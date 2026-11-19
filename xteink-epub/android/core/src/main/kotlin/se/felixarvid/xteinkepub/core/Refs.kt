package se.felixarvid.xteinkepub.core

/** Resolving and rewriting hrefs between files inside an EPUB zip (port of refs.py). */

private val SCHEME = Regex("^[a-zA-Z][a-zA-Z0-9+.-]*:")

/** Python's `urllib.parse.unquote`: %-escapes decoded as UTF-8 (bad bytes become U+FFFD). */
fun unquote(s: String): String {
    if (!s.contains('%')) return s
    val out = java.io.ByteArrayOutputStream()
    val sb = StringBuilder()
    fun flush() {
        if (out.size() > 0) {
            sb.append(String(out.toByteArray(), Charsets.UTF_8))
            out.reset()
        }
    }
    var i = 0
    while (i < s.length) {
        val c = s[i]
        if (c == '%' && i + 2 < s.length) {
            val h = hex(s[i + 1])
            val l = hex(s[i + 2])
            if (h >= 0 && l >= 0) {
                out.write(h * 16 + l)
                i += 3
                continue
            }
        }
        flush()
        sb.append(c)
        i++
    }
    flush()
    return sb.toString()
}

private fun hex(c: Char): Int = when (c) {
    in '0'..'9' -> c - '0'
    in 'a'..'f' -> c - 'a' + 10
    in 'A'..'F' -> c - 'A' + 10
    else -> -1
}

private const val QUOTE_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-~/"

/** Python's `urllib.parse.quote` with the default safe characters ("/"). */
fun quote(s: String): String {
    val sb = StringBuilder()
    for (b in s.toByteArray(Charsets.UTF_8)) {
        val c = (b.toInt() and 0xff).toChar()
        if (b >= 0 && QUOTE_SAFE.indexOf(c) >= 0) {
            sb.append(c)
        } else {
            sb.append('%')
            sb.append("0123456789ABCDEF"[(b.toInt() shr 4) and 0xf])
            sb.append("0123456789ABCDEF"[b.toInt() and 0xf])
        }
    }
    return sb.toString()
}

/** posixpath.normpath for relative or absolute paths. */
fun normpath(path: String): String {
    if (path.isEmpty()) return "."
    val absolute = path.startsWith("/")
    val out = ArrayList<String>()
    for (part in path.split("/")) {
        if (part.isEmpty() || part == ".") continue
        if (part == ".." && out.isNotEmpty() && out.last() != "..") {
            out.removeAt(out.size - 1)
        } else if (part == ".." && absolute) {
            continue
        } else {
            out.add(part)
        }
    }
    val joined = out.joinToString("/")
    return when {
        absolute -> "/$joined"
        joined.isEmpty() -> "."
        else -> joined
    }
}

fun dirname(path: String): String {
    val i = path.lastIndexOf('/')
    return if (i < 0) "" else path.substring(0, i)
}

fun splitExt(path: String): Pair<String, String> {
    val slash = path.lastIndexOf('/')
    val dot = path.lastIndexOf('.')
    // like posixpath.splitext: a leading dot of the file name is not an extension
    if (dot <= slash + 1 || dot < 0) return path to ""
    return path.substring(0, dot) to path.substring(dot)
}

/**
 * Zip path that [ref] (written inside [baseFile]) points to, or null.
 *
 * Fragments and queries are dropped and %-escapes decoded. Absolute URLs,
 * pure fragments and references that escape the archive give null.
 */
fun resolveRef(ref: String?, baseFile: String): String? {
    val r = (ref ?: "").trim()
    if (r.isEmpty() || r.startsWith("#") || r.startsWith("//") || SCHEME.containsMatchIn(r)) return null
    var path = r.substringBefore('#').substringBefore('?')
    if (path.isEmpty()) return null
    path = unquote(path)
    val joined = if (path.startsWith("/")) path.trimStart('/') else {
        val d = dirname(baseFile)
        if (d.isEmpty()) path else "$d/$path"
    }
    val norm = normpath(joined)
    if (norm == ".." || norm.startsWith("../") || norm == ".") return null
    return norm
}

/** Href (percent-encoded) from [baseFile] to the zip path [target]. */
fun relativeRef(target: String, baseFile: String): String {
    val start = dirname(baseFile).split("/").filter { it.isNotEmpty() }
    val tgt = normpath(target).split("/").filter { it.isNotEmpty() }
    var common = 0
    while (common < start.size && common < tgt.size && start[common] == tgt[common]) common++
    val parts = ArrayList<String>()
    repeat(start.size - common) { parts.add("..") }
    parts.addAll(tgt.subList(common, tgt.size))
    return quote(if (parts.isEmpty()) "." else parts.joinToString("/"))
}

/** Callable (ref, baseFile) -> new ref or null, for an {old path: new path} map. */
fun interface RefRewrite {
    fun rewrite(ref: String, baseFile: String): String?
}

class RefRewriter(private val mapping: Map<String, String>) : RefRewrite {
    override fun rewrite(ref: String, baseFile: String): String? {
        if (mapping.isEmpty()) return null
        val path = resolveRef(ref, baseFile) ?: return null
        val target = mapping[path] ?: return null
        val idx = ref.indexOfFirst { it == '#' || it == '?' }
        val suffix = if (idx >= 0) ref.substring(idx) else ""
        return if (ref.trim().startsWith("/")) "/" + quote(target) + suffix
        else relativeRef(target, baseFile) + suffix
    }
}
