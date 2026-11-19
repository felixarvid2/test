package se.felixarvid.xteinkepub.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.util.zip.ZipEntry
import javax.xml.parsers.DocumentBuilderFactory

/**
 * End-to-end check on real books. Skipped unless -Dxteink.e2e.dir=<folder with .epub files> is given
 * (optionally -Dxteink.e2e.out=<folder> to keep the converted books). The books are untrusted
 * input: they are only parsed, never executed.
 */
class RealBooksE2eTest {
    private fun strictParse(name: String, data: ByteArray) {
        val f = DocumentBuilderFactory.newInstance()
        f.isNamespaceAware = true
        f.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false)
        f.setFeature("http://javax.xml.XMLConstants/feature/secure-processing", true)
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
            val out = java.io.ByteArrayOutputStream()
            val t0 = System.nanoTime()
            val report = EpubConverter.convert(book, out, ConvertOptions(), ImageIoProcessor)
            val ms = (System.nanoTime() - t0) / 1_000_000
            val bytes = out.toByteArray()
            outDir?.let { File(it, book.nameWithoutExtension + ".xteink.epub").writeBytes(bytes) }
            val (infos, files) = Fixtures.readZip(bytes)

            assertEquals("mimetype", infos.first().name)
            assertEquals(ZipEntry.STORED, infos.first().method)
            for (i in infos.drop(1)) assertEquals(i.name, ZipEntry.DEFLATED, i.method)
            assertEquals("mimetype", Fixtures.localOrder(bytes).first())

            var jpegs = 0
            for ((name, data) in files) {
                val low = name.lowercase()
                if (low.endsWith(".jpg") || low.endsWith(".jpeg")) {
                    val info = jpegInfo(data)
                    if (info == null) {
                        // only allowed when conversion of that image failed and a warning says so
                        assertTrue("$name is not a JPEG", report.warnings.any { it.contains(name) })
                        continue
                    }
                    jpegs++
                    assertTrue("$name is progressive", info.baseline && !info.progressive)
                    assertTrue("$name is ${info.width}x${info.height}", info.width <= 480 && info.height <= 800)
                }
                assertTrue("font left: $name", listOf(".ttf", ".otf", ".woff", ".woff2").none { low.endsWith(it) })
                if (listOf(".png", ".gif", ".bmp", ".webp", ".tif", ".tiff").any { low.endsWith(it) }) {
                    assertTrue("unconverted raster $name without warning", report.warnings.any { it.contains(name) })
                }
                if (low.endsWith(".xhtml") || low.endsWith(".html") || low.endsWith(".htm") || low.endsWith(".opf") ||
                    low.endsWith(".ncx") || low.endsWith(".xml") || low.endsWith(".svg")
                ) strictParse("${book.name}:$name", data)
            }
            // no dangling references from the OPF / NCX / pages / CSS
            val dangling = ArrayList<String>()
            for ((name, data) in files) {
                val low = name.lowercase()
                if (low.endsWith(".xhtml") || low.endsWith(".html") || low.endsWith(".opf") || low.endsWith(".ncx")) {
                    for (el in Xml.parse(data).allElements) for (a in el.attributes()) {
                        if (a.key.startsWith("xmlns") || a.key.substringAfterLast(':') !in setOf("src", "href", "poster", "data")) continue
                        val t = resolveRef(a.value, name)
                        if (t != null && t !in files) dangling.add("$name -> ${a.value}")
                    }
                } else if (low.endsWith(".css")) {
                    Css.rewriteCssUrls(String(data, Charsets.UTF_8)) { u ->
                        val t = resolveRef(u, name)
                        if (t != null && t !in files) dangling.add("$name -> $u")
                        null
                    }
                }
            }
            // references that were already dangling in the source are not our fault
            FileZipSource.open(book).use { src ->
                val orig = HashSet(src.names)
                val newDangling = dangling.filter { d ->
                    val target = d.substringAfter(" -> ")
                    val base = d.substringBefore(" -> ")
                    val t = resolveRef(target, base)
                    t == null || t.substringBeforeLast('.') + ".x" !in orig.map { it.substringBeforeLast('.') + ".x" }.toSet()
                }
                assertTrue("${book.name}: new dangling refs: ${newDangling.take(10)}", newDangling.isEmpty())
            }
            println(
                "E2E %s: %d -> %d bytes (%.1f%%), %d jpeg, %d converted, %d failed, %d fonts removed, %d warnings, %d ms"
                    .format(book.name, report.sizeBefore, report.sizeAfter, 100.0 * (report.sizeAfter - report.sizeBefore) / report.sizeBefore,
                        jpegs, report.imagesConverted, report.imagesFailed, report.fontsRemoved, report.warnings.size, ms),
            )
            report.warnings.take(5).forEach { println("   warning: $it") }
        }
    }
}
