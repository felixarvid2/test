package se.felixarvid.xteinkepub.core

import org.jsoup.Jsoup
import org.jsoup.nodes.Comment
import org.jsoup.nodes.DataNode
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import org.jsoup.nodes.Entities
import org.jsoup.nodes.Node
import org.jsoup.nodes.TextNode
import org.jsoup.nodes.XmlDeclaration
import org.jsoup.parser.Parser
import org.xml.sax.EntityResolver
import org.xml.sax.InputSource
import org.xml.sax.helpers.DefaultHandler
import java.io.StringReader
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.Charset
import java.nio.charset.CodingErrorAction
import javax.xml.parsers.SAXParserFactory

/** Thrown when a file is hopeless as XML. */
class XmlParseException(message: String) : Exception(message)

/**
 * XML/XHTML handling on top of jsoup (the counterpart of the lxml code in xhtml.py).
 *
 * Parsing: named HTML entities are made numeric, then a strict well-formedness check decides:
 * well-formed files go through jsoup's XML parser (which keeps prefixed names such as
 * `xlink:href` and `epub:type` verbatim); broken XHTML goes through jsoup's HTML parser, which
 * repairs structure the way a browser would; anything else is read with the XML parser's
 * own recovery. The tree is always written back as XML.
 */
object Xml {
    const val XHTML_NS = "http://www.w3.org/1999/xhtml"
    private val XML_ENTITIES = setOf("lt", "gt", "amp", "quot", "apos")
    private val NAMED_ENTITY = Regex("&([A-Za-z][A-Za-z0-9]*);")
    private val PAGE_TAG = Regex("<(body|html)\\b", RegexOption.IGNORE_CASE)
    private val ENCODING_DECL = Regex("""^\s*<\?xml[^>]*?encoding\s*=\s*["']([A-Za-z0-9._:-]+)["']""")

    // ------------------------------------------------------------ decoding

    fun decode(data: ByteArray): String {
        var start = 0
        var cs: Charset? = null
        if (data.size >= 3 && data[0] == 0xEF.toByte() && data[1] == 0xBB.toByte() && data[2] == 0xBF.toByte()) {
            start = 3; cs = Charsets.UTF_8
        } else if (data.size >= 2 && data[0] == 0xFE.toByte() && data[1] == 0xFF.toByte()) {
            start = 2; cs = Charsets.UTF_16BE
        } else if (data.size >= 2 && data[0] == 0xFF.toByte() && data[1] == 0xFE.toByte()) {
            start = 2; cs = Charsets.UTF_16LE
        } else {
            val head = String(data, 0, minOf(data.size, 200), Charsets.ISO_8859_1)
            val name = ENCODING_DECL.find(head)?.groupValues?.get(1)
            if (name != null) cs = try { Charset.forName(name) } catch (e: Exception) { null }
        }
        val charset = cs ?: Charsets.UTF_8
        val buf = ByteBuffer.wrap(data, start, data.size - start)
        return try {
            charset.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(buf).toString()
        } catch (e: CharacterCodingException) {
            // wrong declaration or broken bytes: Windows-1252 never fails
            String(data, start, data.size - start, Charset.forName("windows-1252"))
        }
    }

    /** `&nbsp;` -> `&#160;` and so on (the five XML entities stay). */
    fun numericEntities(text: String): String {
        if (text.indexOf('&') < 0) return text
        return NAMED_ENTITY.replace(text) { m ->
            val name = m.groupValues[1]
            if (name in XML_ENTITIES) return@replace m.value
            val chars = if (Entities.isNamedEntity(name)) Entities.getByName(name) else ""
            if (chars.isEmpty()) m.value
            else buildString { chars.codePoints().forEach { append("&#").append(it).append(';') } }
        }
    }

    // -------------------------------------------------------------- parsing

    /** Strict well-formedness check with the platform's SAX parser (no DTD loading, no network). */
    fun isWellFormed(text: String): Boolean {
        return try {
            val f = SAXParserFactory.newInstance()
            f.isNamespaceAware = false
            f.isValidating = false
            for ((feature, value) in listOf(
                "http://apache.org/xml/features/nonvalidating/load-external-dtd" to false,
                "http://xml.org/sax/features/external-general-entities" to false,
                "http://xml.org/sax/features/external-parameter-entities" to false,
            )) {
                try { f.setFeature(feature, value) } catch (_: Exception) { /* not supported here */ }
            }
            val parser = f.newSAXParser()
            val reader = parser.xmlReader
            reader.entityResolver = EntityResolver { _, _ -> InputSource(StringReader("")) }
            reader.contentHandler = DefaultHandler()
            reader.errorHandler = object : DefaultHandler() {
                override fun error(e: org.xml.sax.SAXParseException) = throw e
                override fun fatalError(e: org.xml.sax.SAXParseException) = throw e
            }
            // A DOCTYPE with an internal subset can define entities: leave such files to jsoup.
            reader.parse(InputSource(StringReader(text)))
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun xmlParse(text: String): Document {
        val doc = Jsoup.parse(text, "", Parser.xmlParser())
        doc.outputSettings()
            .syntax(Document.OutputSettings.Syntax.xml)
            .escapeMode(Entities.EscapeMode.xhtml)
            .charset(Charsets.UTF_8)
            .prettyPrint(false)
        return doc
    }

    private fun htmlParse(text: String): Document {
        val doc = Jsoup.parse(text, "", Parser.htmlParser())
        doc.outputSettings()
            .syntax(Document.OutputSettings.Syntax.xml)
            .escapeMode(Entities.EscapeMode.xhtml)
            .charset(Charsets.UTF_8)
            .prettyPrint(false)
        // an <?xml ...?> declaration is read as a bogus comment by HTML parsers
        doc.childNodes().filter { it is Comment && it.data.startsWith("?xml") }.forEach { it.remove() }
        val root = doc.firstElementChild()
        if (root != null && root.localName() == "html" && !root.hasAttr("xmlns")) root.attr("xmlns", XHTML_NS)
        return doc
    }

    /**
     * Parse an XML file (OPF, NCX, SVG, container.xml, encryption.xml) or, with [xhtml], a page.
     * Throws [XmlParseException] if there is no root element at all.
     */
    fun parse(data: ByteArray, xhtml: Boolean = false): Document {
        val text = numericEntities(decode(data))
        var doc: Document? = null
        if (isWellFormed(text)) {
            doc = xmlParse(text)
        } else if (xhtml) {
            val html = htmlParse(text)
            if (PAGE_TAG.containsMatchIn(text)) doc = html
        }
        if (doc == null) doc = xmlParse(text)
        if (doc.firstElementChild() == null) throw XmlParseException("kunde inte tolka XML")
        return doc
    }

    fun serialize(doc: Document): ByteArray {
        doc.childNodes().filter { it is XmlDeclaration && it.name() == "xml" }.forEach { it.remove() }
        val body = doc.outerHtml().trimStart()
        return ("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n" + body).toByteArray(Charsets.UTF_8)
    }

    // -------------------------------------------------------------- helpers

    /** Local part of the tag name (`opf:meta` -> `meta`). */
    fun Element.localName(): String = tagName().substringAfterLast(':')

    fun Element.prefix(): String = if (tagName().contains(':')) tagName().substringBeforeLast(':') + ":" else ""

    fun Element.childElements(local: String): List<Element> = children().filter { it.localName() == local }

    fun Element.childElement(local: String): Element? = children().firstOrNull { it.localName() == local }

    /** All descendants (and this element itself) with the given local name, in document order. */
    fun Element.descendants(local: String): List<Element> = allElements.filter { it.localName() == local }

    fun findFirst(root: Element, pred: (Element) -> Boolean): Element? = root.allElements.firstOrNull(pred)

    /** Value of an attribute that has no namespace prefix, or null. */
    fun Element.attrOrNull(name: String): String? = if (hasAttr(name)) attr(name) else null

    /** Text of a style element, whether the parser stored it as text or as data. */
    fun Element.rawText(): String = buildString {
        for (n: Node in childNodes()) {
            when (n) {
                is TextNode -> append(n.wholeText)
                is DataNode -> append(n.wholeData)
                else -> {}
            }
        }
    }

    fun Element.setRawText(text: String) {
        empty()
        appendChild(TextNode(text))
    }
}
