package se.felixarvid.xteinkepub.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import javax.xml.parsers.DocumentBuilderFactory

/** The jsoup layer: namespaces, prefixed attributes, void elements, entities, broken input. */
class XmlTest {
    private fun roundTrip(src: String, xhtml: Boolean = true): String =
        String(Xml.serialize(Xml.parse(src.toByteArray(), xhtml)), Charsets.UTF_8)

    /** Strict, namespace-aware parse with the JDK parser (no DTD loading). */
    private fun strict(text: String): org.w3c.dom.Document {
        val f = DocumentBuilderFactory.newInstance()
        f.isNamespaceAware = true
        f.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false)
        val b = f.newDocumentBuilder()
        b.setEntityResolver { _, _ -> org.xml.sax.InputSource(java.io.StringReader("")) }
        return b.parse(org.xml.sax.InputSource(java.io.StringReader(text)))
    }

    private val page = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="sv"><head><title>t</title></head><body><p epub:type="chapter" class="x">a&nbsp;b &amp; c &lt; d &gt; åäö</p><br/><img src="a b.png" alt=""/><p></p><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1 1"><image xlink:href="c.png"/><linearGradient id="g"/></svg><![CDATA[ x<y ]]><!-- c --><pre>  a
  b</pre></body></html>"""

    @Test fun namespacesAndPrefixedAttributesSurvive() {
        val out = roundTrip(page)
        assertTrue(out.startsWith("<?xml version=\"1.0\" encoding=\"utf-8\"?>"))
        assertTrue(out.contains("<!DOCTYPE html PUBLIC"))
        assertTrue(out, out.contains("xmlns:epub=\"http://www.idpf.org/2007/ops\""))
        assertTrue(out.contains("epub:type=\"chapter\""))
        assertTrue(out.contains("xlink:href=\"c.png\""))
        assertTrue(out.contains("xml:lang=\"sv\""))
        assertTrue(out.contains("viewBox=\"0 0 1 1\""))
        assertTrue(out.contains("<linearGradient"))
        // it is still namespace-correct XML
        val dom = strict(out)
        val img = dom.getElementsByTagNameNS("http://www.w3.org/2000/svg", "image").item(0) as org.w3c.dom.Element
        assertEquals("c.png", img.getAttributeNS("http://www.w3.org/1999/xlink", "href"))
        val p = dom.getElementsByTagNameNS("http://www.w3.org/1999/xhtml", "p").item(0) as org.w3c.dom.Element
        assertEquals("chapter", p.getAttributeNS("http://www.idpf.org/2007/ops", "type"))
    }

    @Test fun voidElementsStaySelfClosed() {
        val out = roundTrip(page)
        assertTrue(out, Regex("<br\\s*/>").containsMatchIn(out))
        assertTrue(out, Regex("<img src=\"a b.png\" alt=\"\"\\s*/>").containsMatchIn(out))
        assertFalse(out.contains("</br>"))
        assertFalse(out.contains("</img>"))
    }

    @Test fun entitiesBecomeNumericAndTextSurvives() {
        val out = roundTrip(page)
        assertFalse(out.contains("&nbsp;"))
        assertTrue(out, out.contains("a&#xa0;b &amp; c &lt; d &gt; åäö") || out.contains("a&#160;b &amp; c &lt; d &gt; åäö"))
        assertEquals("&#160;&amp;&#233;&#8212;", Xml.numericEntities("&nbsp;&amp;&eacute;&mdash;"))
        assertEquals("&unknownthing;", Xml.numericEntities("&unknownthing;"))
        assertTrue(out.contains("<![CDATA[ x<y ]]>"))
        assertTrue(out.contains("<!-- c -->"))
        assertTrue(out.contains("  a\n  b"))
    }

    @Test fun outputIsStrictlyWellFormed() {
        strict(roundTrip(page))
    }

    @Test fun brokenXhtmlIsRepairedWithTheHtmlParser() {
        val broken = """<html><head><title>t</title></head><body><p>one<br>two<img src="x.png">three<p>four</body></html>"""
        val out = roundTrip(broken)
        val dom = strict(out)
        assertEquals("html", dom.documentElement.localName)
        assertEquals(Xml.XHTML_NS, dom.documentElement.namespaceURI)
        // structure is a browser's reading, not nested br/img
        assertEquals(2, dom.getElementsByTagNameNS(Xml.XHTML_NS, "p").length)
        val br = dom.getElementsByTagNameNS(Xml.XHTML_NS, "br").item(0)
        assertEquals(0, br.childNodes.length)
        assertTrue(out.contains("<img src=\"x.png\""))
    }

    @Test fun brokenXhtmlKeepsPrefixedAttributes() {
        val broken = """<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><p epub:type="x">a<br>b<svg xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="c.png"/></svg></body></html>"""
        val out = roundTrip(broken)
        assertTrue(out, out.contains("epub:type=\"x\""))
        assertTrue(out, out.contains("xlink:href=\"c.png\""))
        strict(out)
    }

    @Test fun declaredLatin1Encoding() {
        val text = "<?xml version=\"1.0\" encoding=\"iso-8859-1\"?><html xmlns=\"http://www.w3.org/1999/xhtml\"><body><p>åäö</p></body></html>"
        val doc = Xml.parse(text.toByteArray(Charsets.ISO_8859_1), true)
        val out = String(Xml.serialize(doc), Charsets.UTF_8)
        assertTrue(out, out.contains("<p>åäö</p>"))
        assertTrue(out.startsWith("<?xml version=\"1.0\" encoding=\"utf-8\"?>"))
    }

    @Test fun utf8BomIsDropped() {
        val bytes = byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte()) + "<a><b/></a>".toByteArray()
        val out = String(Xml.serialize(Xml.parse(bytes)), Charsets.UTF_8)
        assertTrue(out, out.startsWith("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<a>"))
        assertFalse(out.contains("\uFEFF"))
        assertTrue(out.endsWith("</a>"))
    }

    @Test fun invalidUtf8FallsBackToWindows1252() {
        val doc = Xml.parse(byteArrayOf('<'.code.toByte(), 'a'.code.toByte(), '>'.code.toByte(), 0xE5.toByte(), '<'.code.toByte(), '/'.code.toByte(), 'a'.code.toByte(), '>'.code.toByte()))
        assertEquals("å", doc.firstElementChild()!!.text())
    }

    @Test(expected = XmlParseException::class)
    fun garbageIsRejected() {
        Xml.parse("just some text".toByteArray())
    }

    @Test fun opfWithPrefixedPackageNamespace() {
        val opf = """<?xml version="1.0"?><opf:package xmlns:opf="http://www.idpf.org/2007/opf" version="2.0"><opf:metadata><opf:meta name="cover" content="c"/></opf:metadata><opf:manifest><opf:item id="c" href="c.png" media-type="image/png"/></opf:manifest></opf:package>"""
        val out = roundTrip(opf, xhtml = false)
        assertTrue(out, out.contains("<opf:item id=\"c\""))
        strict(out)
    }

    @Test fun unwrapUsesBodyPrefixAndKeepsNamespace() {
        val page = """<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head/><body><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="cover.png"/></svg></body></html>"""
        val res = Xhtml.process(page.toByteArray(), "OEBPS/p.xhtml", Xhtml.Options())
        assertTrue(res.svgUnwrapped)
        val dom = strict(String(res.data!!, Charsets.UTF_8))
        val img = dom.getElementsByTagNameNS(Xml.XHTML_NS, "img").item(0)
        assertNotNull(img)
    }
}
