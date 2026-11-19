package se.felixarvid.xteinkepub

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import se.felixarvid.xteinkepub.core.ConvertOptions
import se.felixarvid.xteinkepub.core.EpubConverter
import se.felixarvid.xteinkepub.core.FileZipSource
import se.felixarvid.xteinkepub.core.Xml
import se.felixarvid.xteinkepub.core.resolveRef
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import javax.xml.parsers.DocumentBuilderFactory

/**
 * The full pipeline with the Android image processor on real books. Skipped unless
 * -Dxteink.e2e.dir=<folder with .epub files> is given (optionally -Dxteink.e2e.out=<folder>).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35])
class RealBooksAndroidE2eTest {
    private fun strictParse(name: String, data: ByteArray) {
        val f = DocumentBuilderFactory.newInstance()
        f.isNamespaceAware = true
        try { f.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false) } catch (_: Exception) {}
        val b = f.newDocumentBuilder()
        b.setEntityResolver { _, _ -> org.xml.sax.InputSource(java.io.StringReader("")) }
        b.setErrorHandler(null)
        try {
            b.parse(java.io.ByteArrayInputStream(data))
        } catch (e: Exception) {
            throw AssertionError("$name is not well-formed: ${e.message}", e)
        }
    }

    @Test fun realBooks() {
        val dir = System.getProperty("xteink.e2e.dir").orEmpty()
        assumeTrue("xteink.e2e.dir not set", dir.isNotEmpty() && File(dir).isDirectory)
        val outDir = System.getProperty("xteink.e2e.out").orEmpty().takeIf { it.isNotEmpty() }?.let { File(it).also { d -> d.mkdirs() } }
        val books = File(dir).listFiles { f -> f.name.endsWith(".epub") && !f.name.endsWith(".xteink.epub") }!!.sortedBy { it.name }
        assumeTrue("no .epub files in $dir", books.isNotEmpty())
        for (book in books) {
            val out = ByteArrayOutputStream()
            val t0 = System.nanoTime()
            val report = EpubConverter.convert(book, out, ConvertOptions(), BitmapImageProcessor())
            val ms = (System.nanoTime() - t0) / 1_000_000
            val bytes = out.toByteArray()
            outDir?.let { File(it, book.nameWithoutExtension + ".xteink.epub").writeBytes(bytes) }

            val tmp = File.createTempFile("e2e", ".zip")
            val files = LinkedHashMap<String, ByteArray>()
            try {
                tmp.writeBytes(bytes)
                ZipFile(tmp).use { zf ->
                    val entries = zf.entries().toList()
                    assertEquals("mimetype", entries.first().name)
                    assertEquals(ZipEntry.STORED, entries.first().method)
                    for (e in entries.drop(1)) assertEquals(e.name, ZipEntry.DEFLATED, e.method)
                    for (e in entries) files[e.name] = zf.getInputStream(e).readBytes()
                }
            } finally { tmp.delete() }

            var jpegs = 0
            var maxW = 0
            var maxH = 0
            for ((name, data) in files) {
                val low = name.lowercase()
                if (low.endsWith(".jpg") || low.endsWith(".jpeg")) {
                    val info = jpegInfo(data)
                    if (info == null) {
                        assertTrue("$name is not a JPEG", report.warnings.any { it.contains(name) })
                        continue
                    }
                    jpegs++
                    maxW = maxOf(maxW, info.width); maxH = maxOf(maxH, info.height)
                    assertTrue("$name is not baseline", info.baseline && !info.progressive)
                    assertTrue("$name is ${info.width}x${info.height}", info.width <= 480 && info.height <= 800)
                }
                assertTrue("font left: $name", listOf(".ttf", ".otf", ".woff", ".woff2").none { low.endsWith(it) })
                if (listOf(".png", ".gif", ".bmp", ".webp", ".tif", ".tiff").any { low.endsWith(it) }) {
                    assertTrue("unconverted raster $name without warning", report.warnings.any { it.contains(name) })
                }
                if (listOf(".xhtml", ".html", ".htm", ".opf", ".ncx", ".xml", ".svg").any { low.endsWith(it) }) {
                    strictParse("${book.name}:$name", data)
                }
            }
            val orig = FileZipSource.open(book).use { it.names.toSet() }
            val dangling = ArrayList<String>()
            for ((name, data) in files) {
                val low = name.lowercase()
                if (low.endsWith(".xhtml") || low.endsWith(".html") || low.endsWith(".opf") || low.endsWith(".ncx")) {
                    for (el in Xml.parse(data).allElements) for (a in el.attributes()) {
                        if (a.key.startsWith("xmlns") || a.key.substringAfterLast(':') !in setOf("src", "href", "poster", "data")) continue
                        val t = resolveRef(a.value, name)
                        if (t != null && t !in files && t !in orig) dangling.add("$name -> ${a.value}")
                    }
                }
            }
            assertTrue("${book.name}: dangling refs ${dangling.take(10)}", dangling.isEmpty())
            println(
                "ANDROID-E2E %s: %d -> %d bytes (%.1f%%), %d jpeg (max %dx%d), %d converted, %d failed, %d fonts removed, %d warnings, %d ms"
                    .format(book.name, report.sizeBefore, report.sizeAfter, 100.0 * (report.sizeAfter - report.sizeBefore) / report.sizeBefore,
                        jpegs, maxW, maxH, report.imagesConverted, report.imagesFailed, report.fontsRemoved, report.warnings.size, ms),
            )
            report.warnings.take(5).forEach { println("   warning: $it") }
        }
    }
}
