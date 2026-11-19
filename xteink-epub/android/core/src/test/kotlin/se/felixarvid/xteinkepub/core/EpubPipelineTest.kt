package se.felixarvid.xteinkepub.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import se.felixarvid.xteinkepub.core.Fixtures.XLINK
import se.felixarvid.xteinkepub.core.Fixtures.buildEpub
import se.felixarvid.xteinkepub.core.Fixtures.encryptionXml
import se.felixarvid.xteinkepub.core.Fixtures.image
import se.felixarvid.xteinkepub.core.Fixtures.item
import se.felixarvid.xteinkepub.core.Fixtures.opf
import se.felixarvid.xteinkepub.core.Fixtures.readZip
import se.felixarvid.xteinkepub.core.Fixtures.xhtml
import se.felixarvid.xteinkepub.core.Xml.descendants
import se.felixarvid.xteinkepub.core.Xml.localName
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import javax.imageio.ImageIO

private const val XH = "application/xhtml+xml"

/** Port of the Python pipeline tests (tests/test_epub.py) on synthetic EPUB 2 and 3 books. */
class EpubPipelineTest {
    private fun alphaPng(): ByteArray {
        val im = BufferedImage(300, 400, BufferedImage.TYPE_INT_ARGB)
        for (x in 0 until 300) for (y in 0 until 400) im.setRGB(x, y, 0x00FF0000) // transparent red
        for (x in 100 until 200) for (y in 100 until 200) im.setRGB(x, y, 0xFF000000.toInt())
        return Fixtures.encode(im, "png")
    }

    private fun decode(data: ByteArray): BufferedImage = ImageIO.read(ByteArrayInputStream(data))
    private fun gray(im: BufferedImage, x: Int, y: Int) = im.raster.getSample(x, y, 0)

    private fun parse(data: ByteArray, xhtml: Boolean = false) = Xml.parse(data, xhtml)

    /** Every local reference in xhtml/css/opf/ncx that points to a missing file. */
    private fun danglingRefs(files: Map<String, ByteArray>): List<Pair<String, String>> {
        val bad = ArrayList<Pair<String, String>>()
        fun check(ref: String, base: String) {
            val t = resolveRef(ref, base)
            if (t != null && t !in files) bad.add(base to ref)
        }
        for ((name, data) in files) {
            val low = name.lowercase()
            if (low.endsWith(".xhtml") || low.endsWith(".html") || low.endsWith(".opf") || low.endsWith(".ncx")) {
                for (el in parse(data).allElements) for (a in el.attributes()) {
                    if (a.key.startsWith("xmlns")) continue
                    if (a.key.substringAfterLast(':') in setOf("src", "href", "poster", "data")) check(a.value, name)
                }
            } else if (low.endsWith(".css")) {
                Css.rewriteCssUrls(String(data)) { u -> check(u, name); null }
            }
        }
        return bad
    }

    private fun makeBook(
        version: String = "3.0", fonts: Boolean = true, extra: Map<String, ByteArray> = emptyMap(),
        cssText: String? = null,
    ): ByteArray {
        val ver3 = version.startsWith("3")
        val items = arrayListOf(
            item("ch1", "ch1.xhtml", XH),
            item("css", "css/style.css", "text/css"),
            item("cover", "img/cover.png", "image/png", if (ver3) "cover-image" else null),
            item("photo", "img/photo.jpg", "image/jpeg"),
            item("pic", "img/pic.bmp", "image/bmp"),
            item("anim", "img/my%20anim.gif", "image/gif"),
            item("small", "img/small.png", "image/png"),
            item("svgimg", "img/vector.svg", "image/svg+xml"),
        )
        if (fonts) items.add(item("font", "fonts/f.ttf", "font/ttf"))
        if (!ver3) items.add(item("ncx", "toc.ncx", "application/x-dtbncx+xml"))
        val meta = if (ver3) "" else "<meta name=\"cover\" content=\"cover\"/>"
        val files = linkedMapOf<String, ByteArray>(
            "OEBPS/content.opf" to opf(
                items, version = version, meta = meta,
                guide = "<guide><reference type=\"cover\" title=\"c\" href=\"img/cover.png\"/></guide>",
            ),
            "OEBPS/ch1.xhtml" to xhtml(
                "<p>hej</p><img src=\"img/cover.png\" alt=\"\"/>" +
                    "<img src=\"img/pic.bmp\" srcset=\"img/pic.bmp 1x, img/small.png 2x\" alt=\"\"/>" +
                    "<a href=\"img/my%20anim.gif#top\"><img src=\"img/my%20anim.gif\" alt=\"\"/></a>" +
                    "<img src=\"img/photo.jpg\" style=\"width:900px\" alt=\"\"/>" +
                    "<img src=\"img/vector.svg\" alt=\"\"/><p style=\"position:absolute;color:red\">x</p>" +
                    "<script>alert(1)</script>",
                head = "<link rel=\"stylesheet\" href=\"css/style.css\"/><style>@font-face{font-family:X;src:url(fonts/f.ttf)}" +
                    "p{font-size:12pt}</style>",
            ),
            "OEBPS/css/style.css" to (
                cssText ?: ("@font-face{font-family:'Foo';src:url('../fonts/f.ttf')}" +
                    "body{background:url(../img/small.png);font-size:12pt;font-family:'Foo',serif;margin:8px}" +
                    ".c{background:url(../img/vector.svg)}")
                ).toByteArray(),
            "OEBPS/img/cover.png" to alphaPng(),
            "OEBPS/img/photo.jpg" to image("jpg", 2000, 3000, progressive = true),
            "OEBPS/img/pic.bmp" to image("bmp", 1000, 600),
            "OEBPS/img/my anim.gif" to image("gif", 640, 480),
            "OEBPS/img/small.png" to image("png", 100, 50),
            "OEBPS/img/vector.svg" to "<svg xmlns=\"http://www.w3.org/2000/svg\"><image xmlns:xlink=\"$XLINK\" xlink:href=\"small.png\"/></svg>".toByteArray(),
        )
        if (fonts) {
            files["OEBPS/fonts/f.ttf"] = "fakefont".toByteArray()
            files["META-INF/encryption.xml"] = encryptionXml("OEBPS/fonts/f.ttf")
        }
        if (!ver3) {
            files["OEBPS/toc.ncx"] = ("<ncx xmlns=\"http://www.daisy.org/z3986/2005/ncx/\"><navMap><navPoint id=\"a\">" +
                "<content src=\"ch1.xhtml#x\"/></navPoint></navMap></ncx>").toByteArray()
        }
        files.putAll(extra)
        return buildEpub(files)
    }

    private class Converted(val infos: List<Fixtures.ZipEntryInfo>, val files: Map<String, ByteArray>, val report: ConversionReport) {
        fun text(name: String) = String(files.getValue(name), Charsets.UTF_8)
    }

    private fun convert(data: ByteArray, opts: ConvertOptions = ConvertOptions()): Converted {
        val r = EpubConverter.convert(data, opts, ImageIoProcessor)
        val (infos, files) = readZip(r.bytes)
        return Converted(infos, files, r.report)
    }

    // ------------------------------------------------------------------ tests

    @Test fun epub3ImagesAndReferences() {
        val c = convert(makeBook("3.0"))
        val files = c.files
        // progressive jpeg -> baseline, fits the box, grayscale
        val photo = jpegInfo(files.getValue("OEBPS/img/photo.jpg"))!!
        assertTrue(photo.baseline)
        assertFalse(photo.progressive)
        assertTrue(photo.width <= 480 && photo.height <= 800)
        assertEquals(1, photo.components)
        // png with alpha -> jpeg on white, renamed
        assertFalse(files.containsKey("OEBPS/img/cover.png"))
        val coverBytes = files.getValue("OEBPS/img/cover.jpg")
        assertTrue(jpegInfo(coverBytes)!!.baseline)
        val cover = decode(coverBytes)
        assertTrue(gray(cover, 5, 5) > 240) // transparent -> white
        assertTrue(gray(cover, 150, 150) < 40) // black square
        // bmp, gif
        assertNotNull(jpegInfo(files.getValue("OEBPS/img/pic.jpg")))
        assertNotNull(jpegInfo(files.getValue("OEBPS/img/my anim.jpg")))
        // small image is never upscaled
        val small = jpegInfo(files.getValue("OEBPS/img/small.jpg"))!!
        assertEquals(100 to 50, small.width to small.height)
        // references
        assertEquals(emptyList<Pair<String, String>>(), danglingRefs(files))
        val ch1 = c.text("OEBPS/ch1.xhtml")
        assertTrue(ch1, ch1.contains("src=\"img/cover.jpg\""))
        assertTrue(ch1.contains("src=\"img/my%20anim.jpg\""))
        assertTrue(ch1.contains("my%20anim.jpg#top"))
        assertFalse(ch1.contains("srcset"))
        assertTrue(ch1.contains("src=\"img/pic.jpg\""))
        assertTrue(ch1.contains("src=\"img/vector.svg\"")) // non raster stays
        assertFalse(ch1.contains("<script"))
        assertFalse(ch1.contains("alert"))
        assertFalse(ch1.contains("position"))
        assertTrue(ch1.contains("width:900px")) // image keeps its size
        val css = c.text("OEBPS/css/style.css")
        assertTrue(css.contains("../img/small.jpg"))
        assertTrue(css.contains("../img/vector.svg"))
        val opfText = c.text("OEBPS/content.opf")
        assertTrue(opfText.contains("href=\"img/cover.jpg\""))
        assertTrue(opfText.contains("href=\"img/my%20anim.jpg\""))
        assertFalse(opfText.contains(".png"))
        assertFalse(opfText.contains(".bmp"))
        // svg file's inner raster reference follows
        assertTrue(c.text("OEBPS/img/vector.svg").contains("href=\"small.jpg\""))
        assertEquals(5, c.report.imagesConverted)
    }

    @Test fun epub3CoverAndManifestTypes() {
        val c = convert(makeBook("3.0"))
        val root = parse(c.files.getValue("OEBPS/content.opf"))
        val items = root.descendants("item").associateBy { it.attr("id") }
        assertEquals("image/jpeg", items.getValue("cover").attr("media-type"))
        assertTrue("cover-image" in items.getValue("cover").attr("properties").split(" "))
        val metas = root.descendants("meta").filter { it.attr("name") == "cover" }
        assertEquals(listOf("cover"), metas.map { it.attr("content") })
        assertEquals("img/cover.jpg", root.descendants("reference").first().attr("href"))
    }

    @Test fun epub2CoverPropertyAndNcx() {
        val c = convert(makeBook("2.0"))
        val root = parse(c.files.getValue("OEBPS/content.opf"))
        val items = root.descendants("item").associateBy { it.attr("id") }
        assertFalse(items.getValue("cover").hasAttr("properties")) // EPUB2: no property
        assertEquals("img/cover.jpg", items.getValue("cover").attr("href"))
        assertTrue(c.text("OEBPS/toc.ncx").contains("ch1.xhtml#x"))
        assertEquals(emptyList<Pair<String, String>>(), danglingRefs(c.files))
    }

    @Test fun ncxImageReferenceFollowsRename() {
        val book = buildEpub(
            mapOf(
                "OEBPS/content.opf" to opf(listOf(item("p", "p.xhtml", XH), item("n", "toc.ncx", "application/x-dtbncx+xml"), item("i", "a.png", "image/png")), version = "2.0"),
                "OEBPS/p.xhtml" to xhtml("<p/>"),
                "OEBPS/toc.ncx" to "<ncx xmlns=\"http://www.daisy.org/z3986/2005/ncx/\"><navMap><navPoint><navLabel><text>x</text></navLabel><content src=\"p.xhtml\"/></navPoint></navMap><docImage src=\"a.png\"/></ncx>".toByteArray(),
                "OEBPS/a.png" to image("png", 50, 50),
            ),
        )
        val c = convert(book)
        assertTrue(c.text("OEBPS/toc.ncx").contains("src=\"a.jpg\""))
        assertEquals(emptyList<Pair<String, String>>(), danglingRefs(c.files))
    }

    @Test fun coverAddedWhenOnlyGuessable() {
        val book = buildEpub(
            mapOf(
                "OEBPS/content.opf" to opf(listOf(item("c1", "c1.xhtml", XH), item("front-cover", "img/front-cover.png", "image/png"))),
                "OEBPS/c1.xhtml" to xhtml("<p>x</p>"),
                "OEBPS/img/front-cover.png" to image("png", 50, 50),
            ),
        )
        val c = convert(book)
        val root = parse(c.files.getValue("OEBPS/content.opf"))
        val it = root.descendants("item").first { it.attr("id") == "front-cover" }
        assertTrue(it.attr("properties").contains("cover-image"))
        val meta = root.descendants("meta").first { it.attr("name") == "cover" }
        assertEquals("front-cover", meta.attr("content"))
        // the new meta lives in the OPF namespace (default namespace, so no prefix)
        assertEquals("meta", meta.tagName())
    }

    @Test fun levelsAndDither() {
        val book = makeBook("3.0")
        for (dither in listOf(true, false)) {
            val c = convert(book, ConvertOptions(levels = 4, dither = dither))
            val im = decode(c.files.getValue("OEBPS/img/photo.jpg"))
            var near = 0
            var total = 0
            for (y in 0 until im.height) for (x in 0 until im.width) {
                val v = gray(im, x, y)
                total++
                if (listOf(0, 85, 170, 255).any { Math.abs(it - v) <= 25 }) near++
            }
            assertTrue("dither=$dither: ${near.toDouble() / total}", near.toDouble() / total > 0.9)
        }
    }

    @Test fun colorKept() {
        val c = convert(makeBook("3.0"), ConvertOptions(color = true))
        assertEquals(3, jpegInfo(c.files.getValue("OEBPS/img/photo.jpg"))!!.components)
        val g = convert(makeBook("3.0"))
        assertEquals(1, jpegInfo(g.files.getValue("OEBPS/img/photo.jpg"))!!.components)
    }

    @Test fun rotateLandscape() {
        val book = buildEpub(
            mapOf(
                "OEBPS/content.opf" to opf(listOf(item("c1", "c1.xhtml", XH), item("i", "i.png", "image/png"), item("j", "j.png", "image/png"))),
                "OEBPS/c1.xhtml" to xhtml("<p>x</p>"),
                "OEBPS/i.png" to image("png", 1600, 900),
                "OEBPS/j.png" to image("png", 300, 200), // landscape but fits the width
            ),
        )
        val r = convert(book, ConvertOptions(rotateLandscape = true))
        val i = jpegInfo(r.files.getValue("OEBPS/i.jpg"))!!
        val j = jpegInfo(r.files.getValue("OEBPS/j.jpg"))!!
        assertEquals(450 to 800, i.width to i.height)
        assertEquals(300 to 200, j.width to j.height)
        val plain = jpegInfo(convert(book).files.getValue("OEBPS/i.jpg"))!!
        assertEquals(480 to 270, plain.width to plain.height)
    }

    @Test fun renameAvoidsCollision() {
        val book = buildEpub(
            mapOf(
                "OEBPS/content.opf" to opf(listOf(item("c1", "c1.xhtml", XH), item("a", "a.png", "image/png"), item("b", "a.jpg", "image/jpeg"))),
                "OEBPS/c1.xhtml" to xhtml("<img src=\"a.png\"/><img src=\"a.jpg\"/>"),
                "OEBPS/a.png" to image("png", 40, 40),
                "OEBPS/a.jpg" to image("jpg", 60, 60),
            ),
        )
        val c = convert(book)
        val a = jpegInfo(c.files.getValue("OEBPS/a.jpg"))!!
        val a1 = jpegInfo(c.files.getValue("OEBPS/a_1.jpg"))!!
        assertEquals(60 to 60, a.width to a.height)
        assertEquals(40 to 40, a1.width to a1.height)
        assertTrue(c.text("OEBPS/c1.xhtml").contains("src=\"a_1.jpg\""))
        assertEquals(emptyList<Pair<String, String>>(), danglingRefs(c.files))
    }

    @Test fun brokenImageIsLeftAloneWithWarning() {
        val book = buildEpub(
            mapOf(
                "OEBPS/content.opf" to opf(listOf(item("c1", "c1.xhtml", XH), item("a", "bad.png", "image/png"))),
                "OEBPS/c1.xhtml" to xhtml("<img src=\"bad.png\"/>"),
                "OEBPS/bad.png" to "not an image".toByteArray(),
            ),
        )
        val c = convert(book)
        assertEquals("not an image", c.text("OEBPS/bad.png"))
        assertTrue(c.text("OEBPS/c1.xhtml").contains("src=\"bad.png\""))
        assertEquals(1, c.report.warnings.size)
        assertEquals(1, c.report.imagesFailed)
        val root = parse(c.files.getValue("OEBPS/content.opf"))
        assertEquals("image/png", root.descendants("item").first { it.attr("id") == "a" }.attr("media-type"))
    }

    @Test fun throwingImageProcessorIsAWarningToo() {
        val book = makeBook("3.0")
        val boom = ImageProcessor { _, _ -> throw IllegalStateException("boom") }
        val r = EpubConverter.convert(book, ConvertOptions(), boom)
        assertEquals(0, r.report.imagesConverted)
        assertEquals(5, r.report.imagesFailed)
        assertTrue(r.report.warnings.first().contains("boom"))
    }

    @Test fun fontsRemoved() {
        val c = convert(makeBook("3.0"))
        val files = c.files
        assertFalse(files.containsKey("OEBPS/fonts/f.ttf"))
        assertFalse(files.containsKey("META-INF/encryption.xml"))
        assertFalse(c.text("OEBPS/content.opf").contains("fonts/f.ttf"))
        val css = c.text("OEBPS/css/style.css")
        assertFalse(css.contains("font-face"))
        assertTrue(css.contains("font-family:serif"))
        assertFalse(css.contains("Foo"))
        assertFalse(c.text("OEBPS/ch1.xhtml").contains("font-face"))
        assertEquals(1, c.report.fontsRemoved)
        assertEquals(emptyList<Pair<String, String>>(), danglingRefs(files))
    }

    @Test fun encryptionXmlKeepsOtherEntries() {
        val book = makeBook(
            "3.0", extra = mapOf(
                "META-INF/encryption.xml" to encryptionXml("OEBPS/fonts/f.ttf", "OEBPS/fonts/other.otf"),
                "OEBPS/fonts/other.otf" to "x".toByteArray(),
            ),
        )
        val enc = convert(book).text("META-INF/encryption.xml")
        assertFalse(enc.contains("f.ttf"))
        assertTrue(enc.contains("other.otf"))
    }

    @Test fun keepFonts() {
        val c = convert(makeBook("3.0"), ConvertOptions(keepFonts = true))
        assertEquals("fakefont", c.text("OEBPS/fonts/f.ttf"))
        assertTrue(c.text("META-INF/encryption.xml").contains("f.ttf"))
        assertTrue(c.text("OEBPS/css/style.css").contains("font-face"))
        assertEquals(0, c.report.fontsRemoved)
    }

    @Test fun keepCssOnlyTouchesFonts() {
        val c = convert(makeBook("3.0"), ConvertOptions(keepCss = true))
        val css = c.text("OEBPS/css/style.css")
        assertTrue(css.contains("font-size:12pt"))
        assertTrue(css.contains("margin:8px"))
        assertFalse(css.contains("font-face"))
        assertTrue(c.text("OEBPS/ch1.xhtml").contains("position:absolute"))
    }

    @Test fun simplifyCss() {
        val css = convert(makeBook("3.0")).text("OEBPS/css/style.css")
        assertTrue(css.contains("font-size:1em"))
        assertTrue(css.contains("margin:0"))
    }

    @Test fun stripCss() {
        val c = convert(makeBook("3.0"), ConvertOptions(stripCss = true))
        assertFalse(c.files.containsKey("OEBPS/css/style.css"))
        val ch1 = c.text("OEBPS/ch1.xhtml")
        assertFalse(ch1.contains("<style"))
        assertFalse(ch1.contains("stylesheet"))
        assertFalse(ch1.contains("style="))
        assertFalse(c.text("OEBPS/content.opf").contains("style.css"))
        assertEquals(emptyList<Pair<String, String>>(), danglingRefs(c.files))
        assertEquals(1, c.report.cssRemoved)
    }

    @Test fun svgCoverUnwrapped() {
        val page = xhtml(
            "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"$XLINK\" viewBox=\"0 0 600 800\">" +
                "<image width=\"600\" height=\"800\" xlink:href=\"cover.png\"/></svg>",
        )
        val book = buildEpub(
            mapOf(
                "OEBPS/content.opf" to opf(
                    listOf(item("cp", "cover.xhtml", XH, "svg"), item("ci", "cover.png", "image/png", "cover-image"), item("c1", "c1.xhtml", XH, "svg scripted")),
                    spine = listOf("cp", "c1"),
                ),
                "OEBPS/cover.xhtml" to page,
                "OEBPS/c1.xhtml" to xhtml("<svg xmlns=\"http://www.w3.org/2000/svg\"><circle r=\"4\"/></svg>"),
                "OEBPS/cover.png" to image("png", 600, 800),
            ),
        )
        val c = convert(book)
        val text = c.text("OEBPS/cover.xhtml")
        assertFalse(text.contains("<svg"))
        val dom = Xml.parse(c.files.getValue("OEBPS/cover.xhtml"), true)
        val div = dom.descendants("div").single()
        assertEquals("text-align:center", div.attr("style"))
        val img = div.children().single()
        assertEquals("img", img.tagName())
        assertEquals("cover.jpg", img.attr("src"))
        assertEquals("", img.attr("alt"))
        assertEquals("max-width:100%;max-height:100%", img.attr("style"))
        assertTrue(text, Regex("<div style=\"text-align:center\"><img src=\"cover.jpg\" alt=\"\" style=\"max-width:100%;max-height:100%\"\\s*/></div>").containsMatchIn(text))
        val root = parse(c.files.getValue("OEBPS/content.opf"))
        val items = root.descendants("item").associateBy { it.attr("id") }
        assertFalse(items.getValue("cp").hasAttr("properties"))
        assertEquals("svg scripted", items.getValue("c1").attr("properties")) // real svg page untouched
        assertTrue(c.text("OEBPS/c1.xhtml").contains("<svg"))
        assertEquals(1, c.report.svgUnwrapped)
        assertEquals(emptyList<Pair<String, String>>(), danglingRefs(c.files))
    }

    @Test fun svgPropertyDroppedFromSpineItemrefToo() {
        val page = xhtml("<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"$XLINK\"><image xlink:href=\"c.png\"/></svg>")
        val opfBytes = String(opf(listOf(item("cp", "cover.xhtml", XH, "svg"), item("ci", "c.png", "image/png")), spine = listOf("cp")))
            .replace("<itemref idref=\"cp\"/>", "<itemref idref=\"cp\" properties=\"svg\"/>").toByteArray()
        val book = buildEpub(mapOf("OEBPS/content.opf" to opfBytes, "OEBPS/cover.xhtml" to page, "OEBPS/c.png" to image("png", 30, 30)))
        val c = convert(book)
        assertFalse(c.text("OEBPS/content.opf").contains("svg"))
    }

    @Test fun svgWithHrefWithoutXlink() {
        val page = xhtml("<div><svg xmlns=\"http://www.w3.org/2000/svg\"><image href=\"c.png\"/></svg></div>")
        val book = buildEpub(
            mapOf(
                "OEBPS/content.opf" to opf(listOf(item("p", "p.xhtml", XH), item("c", "c.png", "image/png"))),
                "OEBPS/p.xhtml" to page,
                "OEBPS/c.png" to image("png", 30, 30),
            ),
        )
        assertTrue(convert(book).text("OEBPS/p.xhtml").contains("src=\"c.jpg\""))
    }

    @Test fun htmlEntitiesSurvive() {
        val page = ("<?xml version=\"1.0\"?><!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.1//EN\" " +
            "\"http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd\"><html xmlns=\"http://www.w3.org/1999/xhtml\">" +
            "<head><title>t</title></head><body><p>a&nbsp;b</p><script>x</script></body></html>").toByteArray()
        val book = buildEpub(mapOf("OEBPS/content.opf" to opf(listOf(item("p", "p.xhtml", XH))), "OEBPS/p.xhtml" to page))
        val out = convert(book).text("OEBPS/p.xhtml")
        assertTrue(out, out.contains("a\u00a0b") || out.contains("a&#xa0;b") || out.contains("a&#160;b"))
        assertTrue(out.contains("<!DOCTYPE html PUBLIC"))
        assertTrue(out.startsWith("<?xml"))
        assertFalse(out.contains("<script"))
    }

    @Test fun onAttributesRemoved() {
        val book = buildEpub(
            mapOf(
                "OEBPS/content.opf" to opf(listOf(item("p", "p.xhtml", XH))),
                "OEBPS/p.xhtml" to xhtml("<p onclick=\"x()\" class=\"c\">hi</p>"),
            ),
        )
        val out = convert(book).text("OEBPS/p.xhtml")
        assertFalse(out.contains("onclick"))
        assertTrue(out.contains("class=\"c\""))
    }

    @Test fun junkRemovedOnlyWhenNotInManifest() {
        val extra = mapOf(
            "__MACOSX/x" to "1", "OEBPS/.DS_Store" to "1", "Thumbs.db" to "1",
            "iTunesMetadata.plist" to "1", "calibre_bookmarks.txt" to "1", "OEBPS/desktop.ini" to "1",
        ).mapValues { it.value.toByteArray() }
        val c = convert(makeBook("3.0", extra = extra))
        for (n in extra.keys) assertFalse(n, c.files.containsKey(n))
        assertEquals(6, c.report.junkRemoved)
        val items = listOf(item("p", "p.xhtml", XH), item("t", "Thumbs.db", "application/octet-stream"))
        val book = buildEpub(mapOf("OEBPS/content.opf" to opf(items), "OEBPS/p.xhtml" to xhtml("<p/>"), "OEBPS/Thumbs.db" to "keepme".toByteArray()))
        assertEquals("keepme", convert(book).text("OEBPS/Thumbs.db"))
    }

    @Test fun untouchedFilesByteIdentical() {
        val notes = byteArrayOf(0, 1, 32, 'b'.code.toByte(), -1)
        val page = xhtml("<p>plain</p>")
        val book = buildEpub(
            mapOf(
                "OEBPS/content.opf" to opf(listOf(item("p", "p.xhtml", XH), item("d", "data.bin", "application/octet-stream"))),
                "OEBPS/p.xhtml" to page, "OEBPS/data.bin" to notes,
            ),
        )
        val c = convert(book)
        assertTrue(notes.contentEquals(c.files.getValue("OEBPS/data.bin")))
        assertTrue(page.contentEquals(c.files.getValue("OEBPS/p.xhtml")))
    }

    @Test fun mimetypeFirstAndStored() {
        val r = EpubConverter.convert(makeBook("3.0"), ConvertOptions(), ImageIoProcessor)
        val (infos, files) = readZip(r.bytes)
        assertEquals("mimetype", infos.first().name)
        assertEquals(java.util.zip.ZipEntry.STORED, infos.first().method)
        assertEquals("application/epub+zip", String(files.getValue("mimetype")))
        for (i in infos.drop(1)) assertEquals(i.name, java.util.zip.ZipEntry.DEFLATED, i.method)
        // a streaming reader sees mimetype first, and the raw bytes start the file (EPUB OCF rule)
        assertEquals("mimetype", Fixtures.localOrder(r.bytes).first())
        val head = String(r.bytes, 30, 8 + "application/epub+zip".length, Charsets.ISO_8859_1)
        assertTrue(head, head.startsWith("mimetype" + "application/epub+zip"))
        // no data descriptors (flag bit 3) anywhere: sizes are in the local headers
        var pos = 0
        var count = 0
        while (pos + 30 < r.bytes.size && r.bytes[pos] == 'P'.code.toByte() && r.bytes[pos + 1] == 'K'.code.toByte() &&
            r.bytes[pos + 2] == 3.toByte() && r.bytes[pos + 3] == 4.toByte()
        ) {
            val flags = (r.bytes[pos + 6].toInt() and 0xff) or ((r.bytes[pos + 7].toInt() and 0xff) shl 8)
            assertEquals(0, flags and 8)
            fun u32(o: Int) = (0 until 4).sumOf { ((r.bytes[pos + o + it].toLong() and 0xff) shl (8 * it)) }
            fun u16(o: Int) = (r.bytes[pos + o].toInt() and 0xff) or ((r.bytes[pos + o + 1].toInt() and 0xff) shl 8)
            pos += 30 + u16(26) + u16(28) + u32(18).toInt()
            count++
        }
        assertEquals(infos.size, count)
    }

    @Test fun missingMimetypeIsAdded() {
        val book = buildEpub(mapOf("OEBPS/content.opf" to opf(listOf(item("p", "p.xhtml", XH))), "OEBPS/p.xhtml" to xhtml("<p/>")), mimetype = null)
        val c = convert(book)
        assertEquals("mimetype", c.infos.first().name)
    }

    @Test fun sizeShrinksAndReportMatches() {
        val data = makeBook("3.0")
        val r = EpubConverter.convert(data, ConvertOptions(), ImageIoProcessor)
        assertEquals(data.size.toLong(), r.report.sizeBefore)
        assertEquals(r.bytes.size.toLong(), r.report.sizeAfter)
        assertTrue(r.bytes.size < data.size)
    }

    @Test fun progressIsMonotonicAndReachesOne() {
        val seen = ArrayList<Progress>()
        EpubConverter.convert(makeBook("3.0"), ConvertOptions(), ImageIoProcessor) { seen.add(it) }
        assertTrue(seen.isNotEmpty())
        assertEquals(1f, seen.last().fraction, 0f)
        for (i in 1 until seen.size) assertTrue("${seen[i - 1]} -> ${seen[i]}", seen[i].fraction >= seen[i - 1].fraction)
        assertTrue(seen.any { it.stage == Stage.IMAGES && it.itemCount == 5 && it.itemName != null })
        assertTrue(seen.any { it.stage == Stage.PAGES })
        assertTrue(seen.any { it.stage == Stage.PACKING })
    }

    @Test fun progressListenerCanCancel() {
        try {
            EpubConverter.convert(makeBook("3.0"), ConvertOptions(), ImageIoProcessor) {
                if (it.stage == Stage.IMAGES && it.itemIndex == 2) throw java.util.concurrent.CancellationException("stopp")
            }
            fail("should have been cancelled")
        } catch (e: java.util.concurrent.CancellationException) {
            assertEquals("stopp", e.message)
        }
    }

    @Test fun fileApiRoundTrip() {
        val tmp = java.io.File.createTempFile("xteink-in", ".epub")
        try {
            tmp.writeBytes(makeBook("3.0"))
            val out = java.io.ByteArrayOutputStream()
            val rep = EpubConverter.convert(tmp, out, ConvertOptions(), ImageIoProcessor)
            assertEquals(out.size().toLong(), rep.sizeAfter)
            assertEquals(tmp.length(), rep.sizeBefore)
            val (_, files) = readZip(out.toByteArray())
            assertTrue(files.containsKey("OEBPS/img/cover.jpg"))
        } finally {
            tmp.delete()
        }
    }

    @Test fun malformedPageIsRepairedNotDropped() {
        val book = buildEpub(
            mapOf(
                "OEBPS/content.opf" to opf(listOf(item("p", "p.xhtml", XH), item("i", "a.png", "image/png"))),
                "OEBPS/p.xhtml" to "<html><body><p>one<br>two<img src=\"a.png\"><p>three</body></html>".toByteArray(),
                "OEBPS/a.png" to image("png", 40, 40),
            ),
        )
        val c = convert(book)
        val out = c.text("OEBPS/p.xhtml")
        assertTrue(out, out.contains("a.jpg"))
        // result is well-formed XML now
        Xml.isWellFormed(out).let { assertTrue(out, it) }
    }

    // ------------------------------------------------------------- refusals

    @Test fun badZip() {
        try {
            EpubConverter.convert("this is not a zip".toByteArray(), ConvertOptions(), ImageIoProcessor)
            fail()
        } catch (e: InvalidZipException) {
            assertTrue(e.message!!.contains("EPUB"))
        }
    }

    @Test fun badZipFile() {
        val tmp = java.io.File.createTempFile("xteink-bad", ".epub")
        try {
            tmp.writeText("not a zip at all, just text")
            try {
                EpubConverter.convert(tmp, java.io.ByteArrayOutputStream(), ConvertOptions(), ImageIoProcessor)
                fail()
            } catch (e: InvalidZipException) {
                // expected
            }
        } finally {
            tmp.delete()
        }
    }

    @Test fun rightsXmlIsDrm() {
        val book = makeBook("3.0", extra = mapOf("META-INF/rights.xml" to "<rights/>".toByteArray()))
        try {
            EpubConverter.convert(book, ConvertOptions(), ImageIoProcessor)
            fail()
        } catch (e: DrmException) {
            assertTrue(e.message!!.contains("DRM"))
        }
    }

    @Test fun nonFontEncryptionIsDrm() {
        val book = makeBook("3.0", extra = mapOf("META-INF/encryption.xml" to encryptionXml("OEBPS/ch1.xhtml", algo = "http://www.w3.org/2001/04/xmlenc#aes128-cbc")))
        try {
            EpubConverter.convert(book, ConvertOptions(), ImageIoProcessor)
            fail()
        } catch (e: DrmException) {
            // expected
        }
    }

    @Test fun adobeFontObfuscationIsNotDrm() {
        val book = makeBook("3.0", extra = mapOf("META-INF/encryption.xml" to encryptionXml("OEBPS/fonts/f.ttf", algo = "http://ns.adobe.com/pdf/enc#RC")))
        assertEquals(0, convert(book).report.warnings.size)
    }

    @Test fun noOpf() {
        val book = buildEpub(mapOf("OEBPS/ch.xhtml" to xhtml("<p/>")), container = null)
        try {
            EpubConverter.convert(book, ConvertOptions(), ImageIoProcessor)
            fail()
        } catch (e: NoOpfException) {
            assertTrue(e.message!!.contains("OPF"))
        }
    }

    @Test fun opfFoundWithoutContainer() {
        val book = buildEpub(
            mapOf("OEBPS/content.opf" to opf(listOf(item("p", "p.xhtml", XH))), "OEBPS/p.xhtml" to xhtml("<p/>")),
            container = null,
        )
        convert(book)
    }

    @Test fun brokenOpf() {
        val book = buildEpub(mapOf("OEBPS/content.opf" to "this is not xml".toByteArray()))
        try {
            EpubConverter.convert(book, ConvertOptions(), ImageIoProcessor)
            fail()
        } catch (e: InvalidOpfException) {
            // expected
        }
        val noManifest = buildEpub(mapOf("OEBPS/content.opf" to "<package xmlns=\"http://www.idpf.org/2007/opf\"/>".toByteArray()))
        try {
            EpubConverter.convert(noManifest, ConvertOptions(), ImageIoProcessor)
            fail()
        } catch (e: InvalidOpfException) {
            assertTrue(e.message!!.contains("manifest"))
        }
    }

    @Test fun errorsAreTypedAndSwedish() {
        val all = listOf(InvalidZipException(), DrmException("Boken är DRM-skyddad"), NoOpfException(), InvalidOpfException("x"))
        for (e in all) assertTrue(e.message!!.isNotEmpty())
        assertNull(InvalidZipException().cause)
    }
}
