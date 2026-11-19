package se.felixarvid.xteinkepub.core

import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import org.jsoup.nodes.TextNode
import se.felixarvid.xteinkepub.core.Xml.attrOrNull
import se.felixarvid.xteinkepub.core.Xml.childElements
import se.felixarvid.xteinkepub.core.Xml.descendants
import se.felixarvid.xteinkepub.core.Xml.localName
import se.felixarvid.xteinkepub.core.Xml.prefix
import se.felixarvid.xteinkepub.core.Xml.rawText
import se.felixarvid.xteinkepub.core.Xml.setRawText

/** XHTML / XML cleaning, reference rewriting and SVG unwrapping (port of xhtml.py). */
object Xhtml {
    const val XLINK = "http://www.w3.org/1999/xlink"
    private val REF_ATTRS = setOf("src", "href", "poster", "data")
    private val IMG_TAGS = setOf("img", "svg", "image", "picture", "video")

    class Options(
        val rewrite: RefRewrite? = null,
        /** Files that no longer exist (removed fonts / stylesheets). */
        val removedPaths: Set<String> = emptySet(),
        val removeFonts: Boolean = false,
        val simplifyCss: Boolean = false,
        val stripCss: Boolean = false,
        val dropScripts: Boolean = true,
    )

    class Result(
        /** New bytes, or null when nothing changed. */
        var data: ByteArray? = null,
        var svgUnwrapped: Boolean = false,
        var hasSvg: Boolean = false,
        var fontFacesRemoved: Int = 0,
        val warnings: MutableList<String> = ArrayList(),
    )

    private fun Element.attrKeys(): List<String> = attributes().asList().map { it.key }

    private fun isNsDecl(key: String) = key == "xmlns" || key.startsWith("xmlns:")

    /** Rewrite src/href/xlink:href/poster/data on every element. Returns the change count. */
    fun rewriteXmlRefs(root: Element, baseFile: String, rewrite: RefRewrite): Int {
        var changed = 0
        for (el in root.allElements) {
            for (name in el.attrKeys()) {
                if (isNsDecl(name) || name.substringAfterLast(':') !in REF_ATTRS) continue
                val new = rewrite.rewrite(el.attr(name), baseFile)
                if (new != null) {
                    el.attr(name, new)
                    changed++
                }
            }
        }
        return changed
    }

    private fun firstSrcsetUrl(srcset: String): String {
        val first = srcset.split(",")[0].trim()
        return if (first.isEmpty()) "" else first.split(Regex("\\s+"))[0]
    }

    private fun isBlankText(n: org.jsoup.nodes.Node) = n is TextNode && n.isBlank

    /**
     * The sole svg of a page that is essentially just that svg, if it contains exactly one
     * `<image>`. Returns (svg, image) or null.
     */
    private fun findWrappedSvgImage(body: Element): Pair<Element, Element>? {
        var node = body
        while (true) {
            // any non-blank text (CDATA included) next to the single child disqualifies the page
            if (node.childNodes().any { it is TextNode && !it.isBlank }) return null
            val kids = node.children()
            if (kids.size != 1) return null
            val kid = kids[0]
            val name = kid.localName()
            if (name == "svg") break
            if (name in setOf("div", "p", "section", "span")) {
                node = kid
                continue
            }
            return null
        }
        val svg = node.children()[0]
        val images = svg.descendants("image")
        if (images.size != 1) return null
        if (svg.allElements.any { it.localName() == "text" || it.localName() == "foreignObject" }) return null
        return svg to images[0]
    }

    private fun imageHref(image: Element): String? {
        val x = image.attrKeys().firstOrNull { it.endsWith(":href") && it.substringBeforeLast(':').isNotEmpty() }
        val v = (x?.let { image.attr(it) }).takeUnless { it.isNullOrEmpty() } ?: image.attrOrNull("href")
        return v?.takeUnless { it.isEmpty() }
    }

    private fun unwrapSvg(doc: Document): Boolean {
        val body = doc.allElements.firstOrNull { it.localName() == "body" } ?: return false
        val (svg, image) = findWrappedSvgImage(body) ?: return false
        val href = imageHref(image) ?: return false
        val pre = body.prefix()
        val div = Element(pre + "div")
        div.attr("style", "text-align:center")
        val img = Element(pre + "img")
        img.attr("src", href)
        img.attr("alt", "")
        img.attr("style", "max-width:100%;max-height:100%")
        div.appendChild(img)
        svg.replaceWith(div)
        return true
    }

    /** Clean one XHTML file. [Result.data] is null when unchanged. */
    fun process(data: ByteArray, path: String, opts: Options): Result {
        val res = Result()
        val doc = try {
            Xml.parse(data, xhtml = true)
        } catch (e: XmlParseException) {
            res.warnings.add("$path: kunde inte tolkas, lämnas orörd")
            return res
        }
        var changed = false
        val rewrite = opts.rewrite ?: RefRewrite { _, _ -> null }
        val cssOpts = Css.Options(
            removeFonts = opts.removeFonts,
            simplify = opts.simplifyCss,
            urlRewriter = { u -> rewrite.rewrite(u, path) },
        )

        for (el in doc.allElements.toList()) {
            if (el === doc) continue
            val name = el.localName()
            if (name == "script" && opts.dropScripts) {
                el.remove()
                changed = true
                continue
            }
            if (name == "link") {
                val rels = el.attr("rel").lowercase().split(Regex("\\s+")).filter { it.isNotEmpty() }
                val href = el.attrOrNull("href")
                val target = if (href != null) resolveRef(href, path) else null
                if ((opts.stripCss && "stylesheet" in rels) || (target != null && target in opts.removedPaths)) {
                    el.remove()
                    changed = true
                }
                continue
            }
            if (name == "style") {
                if (opts.stripCss) {
                    el.remove()
                    changed = true
                    continue
                }
                val (new, stats) = Css.processStylesheet(el.rawText(), cssOpts)
                res.fontFacesRemoved += stats.fontFacesRemoved
                if (stats.changes > 0) {
                    changed = true
                    if (new.isNotBlank()) el.setRawText(new) else el.remove()
                }
                continue
            }
            for (attr in el.attrKeys()) {
                if (isNsDecl(attr)) continue
                val aname = attr.substringAfterLast(':').lowercase()
                if (aname.startsWith("on") && opts.dropScripts) {
                    el.removeAttr(attr)
                    changed = true
                } else if (aname == "style" && !attr.contains(':')) {
                    if (opts.stripCss) {
                        el.removeAttr(attr)
                        changed = true
                        continue
                    }
                    val (new, stats) = Css.processStyleAttr(el.attr(attr), cssOpts, isImage = name in IMG_TAGS)
                    if (stats.changes > 0) {
                        changed = true
                        if (new.isNotEmpty()) el.attr(attr, new) else el.removeAttr(attr)
                    }
                }
            }
        }

        if (rewriteXmlRefs(doc, path, rewrite) > 0) changed = true
        for (el in doc.allElements) {
            if (!el.hasAttr("srcset")) continue
            val first = firstSrcsetUrl(el.attr("srcset"))
            if (el.attr("src").isEmpty() && first.isNotEmpty()) {
                el.attr("src", rewrite.rewrite(first, path) ?: first)
            }
            el.removeAttr("srcset")
            el.removeAttr("sizes")
            changed = true
        }

        if (unwrapSvg(doc)) {
            res.svgUnwrapped = true
            changed = true
        }
        res.hasSvg = doc.allElements.any { it.localName() == "svg" }
        if (changed) res.data = Xml.serialize(doc)
        return res
    }
}
