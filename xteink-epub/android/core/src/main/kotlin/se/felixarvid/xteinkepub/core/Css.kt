package se.felixarvid.xteinkepub.core

import java.math.BigDecimal
import java.math.MathContext
import java.math.RoundingMode

/**
 * A small CSS processor (port of css.py): strips comments, parses rules (nested @media etc.)
 * and applies the simplifications that suit a tiny e-reader.
 *
 * It is not a validating parser. It understands just enough of the syntax (comments, strings,
 * parentheses, nested blocks) to cut a stylesheet into rules and declarations without being
 * fooled by braces inside strings.
 */
object Css {
    private val GENERIC_FONTS = setOf("serif", "sans-serif", "monospace")
    private val KEEP_FAMILY_WORDS = setOf("inherit", "initial", "unset")
    private val VENDOR_PREFIXES = listOf("-webkit-", "-moz-", "-ms-", "-o-")
    private val GROUPING_AT = setOf("media", "supports", "document", "layer", "container")
    private val DECL_AT = setOf("font-face", "page", "viewport")
    private val SIZE_PROPS = setOf("width", "height", "min-width", "min-height", "max-width", "max-height")
    private val BOX_PROPS = setOf(
        "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
        "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
    )

    // Strings are written as unrolled loops with possessive quantifiers so that long strings
    // (data: URIs of 100 kB and more) cannot overflow the regex engine's stack.
    private const val STRING = """"[^"\\\n]*+(?:\\.[^"\\\n]*+)*+"|'[^'\\\n]*+(?:\\.[^'\\\n]*+)*+'"""
    private val ABS_LENGTH = Regex("""(?<![\w.-])-?(?:\d+\.?\d*|\.\d+)(?:px|pt|cm|mm|in|pc)(?![\w%])""", RegexOption.IGNORE_CASE)
    private val FONT_SIZE = Regex("""^(-?(?:\d+\.?\d*|\.\d+))(px|pt)$""", RegexOption.IGNORE_CASE)
    private val IMPORTANT = Regex("""\s*!\s*important\s*$""", RegexOption.IGNORE_CASE)
    private val WS_OR_STRING = Regex("($STRING)|\\s+", RegexOption.DOT_MATCHES_ALL)

    // groups: 1 comment, 2 @import string, 3 url(...) argument, 4 other string
    private val URL_TOKEN = Regex(
        "(/\\*.*?\\*/)" +
            "|@import\\s+($STRING)" +
            "|(?<![\\w-])url\\(\\s*($STRING|[^)]*?)\\s*\\)" +
            "|($STRING)",
        setOf(RegexOption.DOT_MATCHES_ALL, RegexOption.IGNORE_CASE),
    )
    private val IMG_LAST = Regex("""^(img|svg|image|picture|video)(?![\w-])""", RegexOption.IGNORE_CASE)
    private val COMBINATORS = Regex("""\s*[>+~]\s*|\s+""")
    private val PROP_NAME = Regex("""^-?[\w-]+$""")
    private val AT_NAME = Regex("""^@([\w-]+)""")

    class Options(
        /** Drop @font-face and non-generic font-family. */
        val removeFonts: Boolean = false,
        /** The e-reader simplifications. */
        val simplify: Boolean = false,
        /** url -> new url, or null to keep. */
        val urlRewriter: ((String) -> String?)? = null,
    ) {
        fun withRewriter(fn: ((String) -> String?)?) = Options(removeFonts, simplify, fn)
    }

    data class Decl(val prop: String, val value: String, val important: Boolean = false)

    class Stats {
        var changes = 0
        var fontFacesRemoved = 0
    }

    private class Rule(
        val kind: String, // style | group | decl | raw | stmt
        val prelude: String,
        val text: String = "",
        val decls: List<Decl> = emptyList(),
        val children: List<Rule> = emptyList(),
    )

    // ------------------------------------------------------------ scanning

    /** Index just past the string starting at text[i] (a quote). */
    private fun stringEnd(text: String, i: Int): Int {
        val q = text[i]
        val n = text.length
        var j = i + 1
        while (j < n) {
            val c = text[j]
            if (c == '\\') j += 2
            else if (c == q) return j + 1
            else if (c == '\n') return j // unterminated string ends at the newline
            else j++
        }
        return n
    }

    fun stripComments(text: String): String {
        val out = StringBuilder(text.length)
        var i = 0
        val n = text.length
        while (i < n) {
            val c = text[i]
            if (c == '"' || c == '\'') {
                val j = stringEnd(text, i)
                out.append(text, i, minOf(j, n))
                i = j
            } else if (c == '/' && text.startsWith("/*", i)) {
                val j = text.indexOf("*/", i + 2)
                i = if (j < 0) n else j + 2
                out.append(' ')
            } else {
                out.append(c)
                i++
            }
        }
        return out.toString()
    }

    /** First index >= i holding one of [stops] outside strings and (), []. */
    private fun readUntil(text: String, start: Int, stops: String): Int {
        var i = start
        val n = text.length
        var depth = 0
        while (i < n) {
            val c = text[i]
            if (c == '"' || c == '\'') {
                i = stringEnd(text, i)
                continue
            }
            if (c == '(' || c == '[') depth++
            else if (c == ')' || c == ']') depth = maxOf(0, depth - 1)
            else if (depth == 0 && stops.indexOf(c) >= 0) return i
            i++
        }
        return n
    }

    /** Index of the } matching the { at text[i] (text.length if unclosed). */
    private fun matchBrace(text: String, start: Int): Int {
        var i = start
        val n = text.length
        var depth = 0
        while (i < n) {
            val c = text[i]
            if (c == '"' || c == '\'') {
                i = stringEnd(text, i)
                continue
            }
            if (c == '{') depth++
            else if (c == '}') {
                depth--
                if (depth == 0) return i
            }
            i++
        }
        return n
    }

    private fun collapseWs(text: String): String =
        WS_OR_STRING.replace(text) { m -> m.groups[1]?.value ?: " " }.trim()

    /** Split on [sep] outside strings and parentheses. */
    fun splitTopLevel(text: String, sep: String = ","): List<String> {
        val parts = ArrayList<String>()
        var start = 0
        while (true) {
            val j = readUntil(text, start, sep)
            parts.add(text.substring(start, minOf(j, text.length)))
            if (j >= text.length) return parts
            start = j + 1
        }
    }

    fun splitDeclarations(body: String): List<Decl> {
        val decls = ArrayList<Decl>()
        for (piece in splitTopLevel(body, ";")) {
            val colon = piece.indexOf(':')
            if (colon < 0) continue
            val prop = piece.substring(0, colon).trim()
            if (prop.isEmpty() || !PROP_NAME.matches(prop)) continue
            var value = piece.substring(colon + 1).trim()
            var important = false
            val m = IMPORTANT.find(value)
            if (m != null) {
                important = true
                value = value.substring(0, m.range.first).trim()
            }
            decls.add(Decl(prop, value, important))
        }
        return decls
    }

    private fun parse(text: String): List<Rule> {
        val rules = ArrayList<Rule>()
        var i = 0
        val n = text.length
        while (i < n) {
            while (i < n && (text[i].isWhitespace() || text[i] == ';' || text[i] == '}')) i++
            if (i >= n) break
            val j = readUntil(text, i, "{;}")
            val prelude = text.substring(i, j).trim()
            val ch = if (j < n) text[j] else null
            if (ch == '{') {
                val k = matchBrace(text, j)
                val body = text.substring(j + 1, minOf(k, n))
                i = k + 1
                rules.add(classify(prelude, body))
            } else if (ch == ';') {
                i = j + 1
                if (prelude.startsWith("@")) rules.add(Rule("stmt", prelude))
            } else {
                i = j + 1 // stray text before } or at the end: ignore
            }
        }
        return rules
    }

    private fun classify(prelude: String, body: String): Rule {
        val m = AT_NAME.find(prelude) ?: return Rule("style", prelude, text = body)
        val name = m.groupValues[1].lowercase()
        return when (name) {
            in GROUPING_AT -> Rule("group", prelude, children = parse(body))
            in DECL_AT -> Rule("decl", prelude, text = body)
            else -> Rule("raw", prelude, text = body)
        }
    }

    private fun atName(prelude: String): String =
        AT_NAME.find(prelude)?.groupValues?.get(1)?.lowercase() ?: ""

    // ---------------------------------------------------------------- urls

    /**
     * Apply fn(url) -> new url|null to every url(...) and @import "..." token outside comments
     * and strings. Returns (new text, number of changes).
     */
    fun rewriteCssUrls(text: String, fn: (String) -> String?): Pair<String, Int> {
        var count = 0
        val result = URL_TOKEN.replace(text) { m ->
            val g = m.groups
            if (g[1] != null || g[4] != null) return@replace m.value
            val isImport = g[2] != null
            val raw = (if (isImport) g[2] else g[3])!!.value
            var quote = if (raw.isNotEmpty() && (raw[0] == '"' || raw[0] == '\'')) raw.substring(0, 1) else ""
            val inner = if (quote.isNotEmpty()) raw.substring(1, raw.length - 1) else raw.trim()
            val new = fn(inner)
            if (new == null || new == inner) return@replace m.value
            count++
            if (quote.isEmpty() && Regex("""[\s()"']""").containsMatchIn(new)) quote = "\""
            val wrapped = quote + new + quote
            if (isImport) "@import $wrapped" else "url($wrapped)"
        }
        return result to count
    }

    // -------------------------------------------------------- declarations

    /** Keep only generic families (serif, sans-serif, monospace); null if none. */
    private fun familyFilter(value: String): String? {
        val kept = ArrayList<String>()
        for (fam in splitTopLevel(value, ",")) {
            val name = fam.trim().trim('"', '\'').trim().lowercase()
            if (name in GENERIC_FONTS || name in KEEP_FAMILY_WORDS) kept.add(name)
        }
        return if (kept.isEmpty()) null else kept.joinToString(", ")
    }

    private fun toEm(value: String): String? {
        val m = FONT_SIZE.matchEntire(value.trim()) ?: return null
        val div = if (m.groupValues[2].lowercase() == "px") 16 else 12
        val em = BigDecimal(m.groupValues[1]).divide(BigDecimal(div), MathContext(28))
            .setScale(2, RoundingMode.HALF_UP) // Decimal.quantize(ROUND_HALF_UP)
        var text = em.toPlainString()
        if (text.contains('.')) text = text.trimEnd('0').trimEnd('.')
        if (text.isEmpty() || text == "-0") text = "0"
        return text + "em"
    }

    fun targetsImages(selector: String): Boolean {
        for (part in splitTopLevel(selector, ",")) {
            val last = COMBINATORS.split(part.trim()).last()
            if (IMG_LAST.containsMatchIn(last)) return true
        }
        return false
    }

    fun targetsRoot(selector: String): Boolean {
        val parts = splitTopLevel(selector, ",").map { collapseWs(it).lowercase() }
        return parts.isNotEmpty() && parts.all { it == "html" || it == "body" || it == "html body" }
    }

    fun processDeclarations(selector: String, decls: List<Decl>, opts: Options, stats: Stats): List<Decl> {
        val isImg = targetsImages(selector)
        val isRoot = targetsRoot(selector)
        val out = ArrayList<Decl>()
        for (d in decls) {
            val prop = d.prop.lowercase()
            var value = d.value
            if (opts.removeFonts && prop == "font-family") {
                val new = familyFilter(value)
                if (new == null) {
                    stats.changes++
                    continue
                }
                if (new != value) {
                    stats.changes++
                    value = new
                }
            }
            if (opts.simplify) {
                if (VENDOR_PREFIXES.any { prop.startsWith(it) }) {
                    stats.changes++
                    continue
                }
                if (prop == "position" && value.trim().lowercase().let { it == "fixed" || it == "absolute" }) {
                    stats.changes++
                    continue
                }
                if (prop in SIZE_PROPS && !isImg && ABS_LENGTH.containsMatchIn(value)) {
                    stats.changes++
                    continue
                }
                if (prop.startsWith("column-") || prop == "columns") {
                    stats.changes++
                    continue
                }
                if (prop == "font-size") {
                    val em = toEm(value)
                    if (em != null) {
                        stats.changes++
                        value = em
                    }
                } else if (isRoot && prop in BOX_PROPS && value != "0") {
                    stats.changes++
                    value = "0"
                }
            }
            val rw = opts.urlRewriter
            if (rw != null && value.lowercase().contains("url(")) {
                val (v, n) = rewriteCssUrls(value, rw)
                value = v
                stats.changes += n
            }
            out.add(Decl(d.prop, value, d.important))
        }
        return out
    }

    private fun declText(decls: List<Decl>): String =
        decls.joinToString(";") { d -> "${d.prop}:${collapseWs(d.value)}${if (d.important) " !important" else ""}" }

    // ---------------------------------------------------------- stylesheets

    private fun processRules(rules: List<Rule>, opts: Options, stats: Stats): List<Rule> {
        val kept = ArrayList<Rule>()
        for (r0 in rules) {
            var r = r0
            if (r.kind == "stmt") {
                val name = atName(r.prelude)
                if (name == "charset") continue // output is always utf-8
                val rw = opts.urlRewriter
                if (rw != null && name == "import") {
                    val (nw, n) = rewriteCssUrls(r.prelude, rw)
                    stats.changes += n
                    r = Rule("stmt", nw)
                }
                kept.add(r)
                continue
            }
            if (r.kind == "style") {
                val orig = splitDeclarations(r.text)
                val decls = processDeclarations(r.prelude, orig, opts, stats)
                if (decls.isEmpty()) {
                    if (opts.simplify || orig.isNotEmpty()) {
                        stats.changes++
                        continue
                    }
                }
                kept.add(Rule("style", r.prelude, decls = decls))
                continue
            }
            val name = atName(r.prelude)
            if (opts.simplify && name.startsWith("-")) {
                stats.changes++ // @-webkit-keyframes and friends
                continue
            }
            when (r.kind) {
                "decl" -> {
                    if (name == "font-face" && opts.removeFonts) {
                        stats.changes++
                        stats.fontFacesRemoved++
                        continue
                    }
                    val decls = processDeclarations("@$name", splitDeclarations(r.text), opts, stats)
                    if (decls.isEmpty() && opts.simplify) {
                        stats.changes++
                        continue
                    }
                    kept.add(Rule("decl", r.prelude, decls = decls))
                }
                "group" -> {
                    val children = processRules(r.children, opts, stats)
                    if (children.isEmpty() && (r.children.isNotEmpty() || opts.simplify)) {
                        stats.changes++
                        continue
                    }
                    kept.add(Rule("group", r.prelude, children = children))
                }
                else -> { // raw (keyframes, ...)
                    var body = r.text
                    val rw = opts.urlRewriter
                    if (rw != null && body.lowercase().contains("url(")) {
                        val (b, n) = rewriteCssUrls(body, rw)
                        body = b
                        stats.changes += n
                    }
                    kept.add(Rule("raw", r.prelude, text = body))
                }
            }
        }
        return kept
    }

    private fun serialize(rules: List<Rule>): String = rules.joinToString("\n") { r ->
        val prelude = collapseWs(r.prelude)
        when (r.kind) {
            "stmt" -> "$prelude;"
            "style", "decl" -> "$prelude{${declText(r.decls)}}"
            "group" -> "$prelude{\n${serialize(r.children)}\n}"
            else -> "$prelude{${r.text.trim()}}"
        }
    }

    private fun clean(text: String): String = stripComments(text).replace("<!--", " ").replace("-->", " ")

    /** Process a full stylesheet. Returns (new text, stats). */
    fun processStylesheet(text: String, opts: Options): Pair<String, Stats> {
        val stats = Stats()
        val rules = processRules(parse(clean(text)), opts, stats)
        return serialize(rules) to stats
    }

    /** Process the value of a style="" attribute. Returns (new text, stats). */
    fun processStyleAttr(text: String, opts: Options, isImage: Boolean = false): Pair<String, Stats> {
        val stats = Stats()
        val decls = processDeclarations(if (isImage) "img" else "", splitDeclarations(clean(text)), opts, stats)
        return declText(decls) to stats
    }
}
