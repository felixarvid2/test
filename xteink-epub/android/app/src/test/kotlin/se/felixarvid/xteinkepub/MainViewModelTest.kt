package se.felixarvid.xteinkepub

import android.app.Application
import android.content.pm.ProviderInfo
import android.graphics.Bitmap
import android.net.Uri
import android.os.Looper
import android.provider.DocumentsContract
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

/** The ViewModel end to end: add a book, pick an output folder (a fake SAF provider), convert, check the file. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35])
class MainViewModelTest {
    @get:Rule val tmp = TemporaryFolder()
    private lateinit var app: Application
    private lateinit var outDir: File
    private lateinit var tree: Uri

    @Before fun setUp() {
        app = ApplicationProvider.getApplicationContext()
        outDir = tmp.newFolder("out")
        TestDocsProvider.rootDir = outDir
        val info = ProviderInfo().apply {
            authority = TestDocsProvider.AUTHORITY
            exported = true
            grantUriPermissions = true
        }
        Robolectric.buildContentProvider(TestDocsProvider::class.java).create(info)
        tree = DocumentsContract.buildTreeDocumentUri(TestDocsProvider.AUTHORITY, "root")
    }

    private fun epub(): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { z ->
            val mt = "application/epub+zip".toByteArray()
            z.putNextEntry(ZipEntry("mimetype").apply { method = ZipEntry.STORED; size = mt.size.toLong(); compressedSize = mt.size.toLong(); crc = CRC32().also { it.update(mt) }.value })
            z.write(mt); z.closeEntry()
            fun put(n: String, d: ByteArray) { z.putNextEntry(ZipEntry(n)); z.write(d); z.closeEntry() }
            put("META-INF/container.xml", """<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>""".toByteArray())
            put("OEBPS/content.opf", """<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="i"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>T</dc:title><dc:identifier id="i">x</dc:identifier></metadata><manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/><item id="p" href="p.png" media-type="image/png"/></manifest><spine><itemref idref="c"/></spine></package>""".toByteArray())
            put("OEBPS/c.xhtml", """<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head><body><p>hej</p><img src="p.png" alt=""/></body></html>""".toByteArray())
            put("OEBPS/p.png", png(gradient(1000, 1500)))
        }
        return out.toByteArray()
    }

    private fun waitFor(vm: MainViewModel, cond: (UiState) -> Boolean) {
        val end = System.currentTimeMillis() + 25_000
        while (System.currentTimeMillis() < end) {
            shadowOf(Looper.getMainLooper()).idle()
            if (cond(vm.state.value)) return
            Thread.sleep(25)
        }
        throw AssertionError("timeout, state=${vm.state.value}")
    }

    @Test fun convertsABookIntoTheChosenFolder() {
        val input = File(tmp.root, "Min bok.epub").also { it.writeBytes(epub()) }
        val vm = MainViewModel(app)
        vm.setOutputFolder(tree)
        waitFor(vm) { it.folderName == "Testmapp" }
        vm.addBooks(listOf(Uri.fromFile(input)), fromIntent = false)
        waitFor(vm) { it.books.size == 1 }
        assertEquals("Min bok.epub", vm.state.value.books[0].name)
        vm.convertClicked()
        waitFor(vm) { it.books.firstOrNull()?.status !is BookStatus.Waiting && !it.running }
        val status = vm.state.value.books[0].status
        assertTrue("status=$status", status is BookStatus.Done)
        status as BookStatus.Done
        assertEquals("Min bok.xteink.epub", status.outputName)
        assertEquals(1, status.imagesConverted)
        assertNotNull(status.shareFile)
        val result = File(outDir, "Min bok.xteink.epub")
        assertTrue(result.exists())
        assertEquals(status.sizeAfter, result.length())
        ZipFile(result).use { z ->
            assertEquals("mimetype", z.entries().nextElement().name)
            val img = z.getEntry("OEBPS/p.jpg")!!
            val bytes = z.getInputStream(img).readBytes()
            val info = jpegInfo(bytes)!!
            assertTrue(info.baseline && info.width <= 480 && info.height <= 800)
            assertTrue(z.getInputStream(z.getEntry("OEBPS/c.xhtml")).readBytes().decodeToString().contains("p.jpg"))
        }
        // the cache copy that "Dela" shares
        assertTrue(status.shareFile!!.exists())
    }

    @Test fun secondBookWithSameNameGetsNumber() {
        val dir = tmp.newFolder("in")
        val a = File(dir, "Bok.epub").also { it.writeBytes(epub()) }
        val vm = MainViewModel(app)
        vm.setOutputFolder(tree)
        waitFor(vm) { it.folderName != null }
        vm.addBooks(listOf(Uri.fromFile(a)), false)
        waitFor(vm) { it.books.size == 1 }
        vm.convertClicked()
        waitFor(vm) { it.books.all { b -> b.status is BookStatus.Done } && !it.running }
        vm.clearFinished()
        vm.addBooks(listOf(Uri.fromFile(a)), false)
        waitFor(vm) { it.books.size == 1 }
        vm.convertClicked()
        waitFor(vm) { it.books.all { b -> b.status is BookStatus.Done } && !it.running }
        assertTrue(File(outDir, "Bok.xteink.epub").exists())
        assertTrue(File(outDir, "Bok (2).xteink.epub").exists())
    }

    @Test fun drmBookFailsWithSwedishMessage() {
        val bad = File(tmp.root, "Skyddad.epub")
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { z ->
            z.putNextEntry(ZipEntry("META-INF/rights.xml")); z.write("<rights/>".toByteArray()); z.closeEntry()
        }
        bad.writeBytes(out.toByteArray())
        val vm = MainViewModel(app)
        vm.setOutputFolder(tree)
        waitFor(vm) { it.folderName != null }
        vm.addBooks(listOf(Uri.fromFile(bad)), false)
        waitFor(vm) { it.books.size == 1 }
        vm.convertClicked()
        waitFor(vm) { it.books[0].status is BookStatus.Failed && !it.running }
        val msg = (vm.state.value.books[0].status as BookStatus.Failed).message
        assertTrue(msg, msg.contains("DRM"))
        assertTrue(outDir.listFiles()!!.isEmpty())
    }

    @Test fun incomingShareConvertsAtOnceWhenAFolderIsSet() {
        val a = File(tmp.root, "Delad.epub").also { it.writeBytes(epub()) }
        val vm = MainViewModel(app)
        vm.setOutputFolder(tree)
        waitFor(vm) { it.folderName != null }
        vm.addBooks(listOf(Uri.fromFile(a)), fromIntent = true)
        waitFor(vm) { it.books.firstOrNull()?.status is BookStatus.Done }
        assertTrue(File(outDir, "Delad.xteink.epub").exists())
    }

    @Test fun nonEpubIsIgnored() {
        val f = File(tmp.root, "bild.png").also { it.writeBytes(byteArrayOf(1, 2, 3)) }
        val vm = MainViewModel(app)
        vm.addBooks(listOf(Uri.fromFile(f)), false)
        shadowOf(Looper.getMainLooper()).idle()
        Thread.sleep(300)
        shadowOf(Looper.getMainLooper()).idle()
        assertTrue(vm.state.value.books.isEmpty())
    }
}
