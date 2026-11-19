package se.felixarvid.xteinkepub.core

import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam
import javax.imageio.plugins.jpeg.JPEGImageWriteParam

/** [ImageProcessor] for JVM tests, built on javax.imageio and the shared [ImageMath]. */
object ImageIoProcessor : ImageProcessor {
    override fun process(bytes: ByteArray, opts: ImageOptions): ByteArray? {
        val src = ImageIO.read(ByteArrayInputStream(bytes)) ?: return null
        val w0 = src.width
        val h0 = src.height
        // composite on white, as RGB
        val rgb = BufferedImage(w0, h0, BufferedImage.TYPE_INT_RGB)
        val g = rgb.createGraphics()
        g.color = java.awt.Color.WHITE
        g.fillRect(0, 0, w0, h0)
        g.drawImage(src, 0, 0, null)
        g.dispose()

        var gray: ByteArray? = null
        if (!opts.color) {
            val px = rgb.getRGB(0, 0, w0, h0, null, 0, w0)
            gray = ByteArray(px.size) { i ->
                val p = px[i]
                ImageMath.gray((p shr 16) and 0xff, (p shr 8) and 0xff, p and 0xff).toByte()
            }
            ImageMath.autocontrast(gray)
        }
        var w = w0
        var h = h0
        var img: BufferedImage = if (gray != null) {
            val im = BufferedImage(w, h, BufferedImage.TYPE_BYTE_GRAY)
            im.raster.setDataElements(0, 0, w, h, gray)
            im
        } else rgb
        if (ImageMath.shouldRotate(w, h, opts)) {
            // 90 degrees clockwise (PIL's ROTATE_270): pixel (x, y) -> (h - 1 - y, x)
            if (gray != null) {
                val rot = ByteArray(gray.size)
                for (y in 0 until h) for (x in 0 until w) rot[x * h + (h - 1 - y)] = gray[y * w + x]
                gray = rot
                img = BufferedImage(h, w, BufferedImage.TYPE_BYTE_GRAY)
                img.raster.setDataElements(0, 0, h, w, rot)
            } else {
                val r = BufferedImage(h, w, BufferedImage.TYPE_INT_RGB)
                for (y in 0 until h) for (x in 0 until w) r.setRGB(h - 1 - y, x, img.getRGB(x, y))
                img = r
            }
            w = img.width
            h = img.height
        }
        val (tw, th) = ImageMath.fitSize(w, h, opts.width, opts.height)
        if (tw != w || th != h) {
            var cur = img
            for ((sw, sh) in ImageMath.halvingSteps(w, h, tw, th) + listOf(tw to th)) {
                val dst = BufferedImage(sw, sh, cur.type)
                val gg = dst.createGraphics()
                gg.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
                gg.drawImage(cur, 0, 0, sw, sh, null)
                gg.dispose()
                cur = dst
            }
            img = cur
        }
        if (!opts.color && opts.levels < 256) {
            val data = ByteArray(img.width * img.height)
            img.raster.getDataElements(0, 0, img.width, img.height, data)
            ImageMath.quantizeGray(data, img.width, img.height, opts.levels, opts.dither)
            img.raster.setDataElements(0, 0, img.width, img.height, data)
        }
        return writeJpeg(img, opts.quality, progressive = false)
    }
}

fun writeJpeg(img: BufferedImage, quality: Int, progressive: Boolean): ByteArray {
    val writer = ImageIO.getImageWritersByFormatName("jpeg").next()
    val param = JPEGImageWriteParam(null)
    param.compressionMode = ImageWriteParam.MODE_EXPLICIT
    param.compressionQuality = quality / 100f
    param.progressiveMode = if (progressive) ImageWriteParam.MODE_DEFAULT else ImageWriteParam.MODE_DISABLED
    param.optimizeHuffmanTables = true
    val out = ByteArrayOutputStream()
    ImageIO.createImageOutputStream(out).use { ios ->
        writer.output = ios
        writer.write(null, IIOImage(img, null, null), param)
    }
    writer.dispose()
    return out.toByteArray()
}

class JpegInfo(val baseline: Boolean, val progressive: Boolean, val width: Int, val height: Int, val components: Int)

/** Reads the SOF marker of a JPEG, or null if [data] is not a JPEG. */
fun jpegInfo(data: ByteArray): JpegInfo? {
    if (data.size < 4 || data[0] != 0xFF.toByte() || data[1] != 0xD8.toByte()) return null
    var i = 2
    while (i + 9 < data.size) {
        if (data[i] != 0xFF.toByte()) { i++; continue }
        val m = data[i + 1].toInt() and 0xff
        if (m == 0xFF) { i++; continue }
        if (m == 0xD8 || m in 0xD0..0xD7 || m == 0x01) { i += 2; continue }
        val len = ((data[i + 2].toInt() and 0xff) shl 8) or (data[i + 3].toInt() and 0xff)
        if (m in 0xC0..0xCF && m != 0xC4 && m != 0xC8 && m != 0xCC) {
            val h = ((data[i + 5].toInt() and 0xff) shl 8) or (data[i + 6].toInt() and 0xff)
            val w = ((data[i + 7].toInt() and 0xff) shl 8) or (data[i + 8].toInt() and 0xff)
            val comps = data[i + 9].toInt() and 0xff
            return JpegInfo(baseline = m == 0xC0 || m == 0xC1, progressive = m == 0xC2, width = w, height = h, components = comps)
        }
        i += 2 + len
    }
    return null
}

object Fixtures {
    const val XLINK = "http://www.w3.org/1999/xlink"
    const val ENC_NS = "urn:oasis:names:tc:opendocument:xmlns:container"

    val CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>""".toByteArray()

    /** Gradient with some texture so autocontrast has something to stretch. */
    fun image(format: String, w: Int = 1200, h: Int = 1600, type: Int = BufferedImage.TYPE_INT_RGB, progressive: Boolean = false): ByteArray {
        val im = BufferedImage(w, h, type)
        for (x in 0 until w step 3) for (y in 0 until h step 3) {
            val v = ((x * 200 / w) + (y * 55 / h) + ((x + y) % 7)).coerceIn(0, 255)
            im.setRGB(x, y, (0xFF shl 24) or (v shl 16) or ((255 - v) shl 8) or ((x + y) % 256))
        }
        return encode(im, format, progressive)
    }

    fun encode(im: BufferedImage, format: String, progressive: Boolean = false): ByteArray {
        if (format == "jpg") {
            val rgb = BufferedImage(im.width, im.height, BufferedImage.TYPE_INT_RGB)
            rgb.createGraphics().apply { drawImage(im, 0, 0, null); dispose() }
            return writeJpeg(rgb, 90, progressive)
        }
        val out = ByteArrayOutputStream()
        check(ImageIO.write(im, format, out)) { "no writer for $format" }
        return out.toByteArray()
    }

    fun xhtml(body: String, head: String = ""): ByteArray =
        ("""<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title>$head</head><body>$body</body></html>""").toByteArray()

    /** items: (id, href, media-type, properties?) */
    fun opf(
        items: List<List<String?>>, version: String = "3.0", meta: String = "",
        spine: List<String>? = null, guide: String = "",
    ): ByteArray {
        val manifest = items.joinToString("") { (id, href, mt, props) ->
            "<item id=\"$id\" href=\"$href\" media-type=\"$mt\"" + (if (props != null) " properties=\"$props\"" else "") + "/>"
        }
        val spineIds = spine ?: items.filter { it[2] == "application/xhtml+xml" }.map { it[0]!! }
        return ("""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="$version" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>T</dc:title><dc:identifier id="id">x</dc:identifier>$meta</metadata><manifest>$manifest</manifest><spine>${spineIds.joinToString("") { "<itemref idref=\"$it\"/>" }}</spine>$guide</package>""").toByteArray()
    }

    fun item(id: String, href: String, mt: String, props: String? = null) = listOf(id, href, mt, props)

    /** mimetype first and stored unless [mimetype] is null. */
    fun buildEpub(
        files: Map<String, ByteArray>,
        mimetype: ByteArray? = "application/epub+zip".toByteArray(),
        container: ByteArray? = CONTAINER,
    ): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { zos ->
            if (mimetype != null) {
                val e = ZipEntry("mimetype")
                e.method = ZipEntry.STORED
                e.size = mimetype.size.toLong()
                e.compressedSize = mimetype.size.toLong()
                e.crc = CRC32().also { it.update(mimetype) }.value
                zos.putNextEntry(e)
                zos.write(mimetype)
                zos.closeEntry()
            }
            fun put(name: String, data: ByteArray) {
                zos.putNextEntry(ZipEntry(name))
                zos.write(data)
                zos.closeEntry()
            }
            if (container != null) put("META-INF/container.xml", container)
            for ((n, d) in files) put(n, d)
        }
        return out.toByteArray()
    }

    class ZipEntryInfo(val name: String, val method: Int)

    /** Entries of a zip in order, plus a name -> bytes map. */
    fun readZip(data: ByteArray): Pair<List<ZipEntryInfo>, Map<String, ByteArray>> {
        // Read the central directory with ZipFile semantics via a temp file to get methods reliably.
        val tmp = java.io.File.createTempFile("xteink", ".zip")
        try {
            tmp.writeBytes(data)
            java.util.zip.ZipFile(tmp).use { zf ->
                val infos = ArrayList<ZipEntryInfo>()
                val map = LinkedHashMap<String, ByteArray>()
                for (e in zf.entries()) {
                    infos.add(ZipEntryInfo(e.name, e.method))
                    map[e.name] = zf.getInputStream(e).readBytes()
                }
                return infos to map
            }
        } finally {
            tmp.delete()
        }
    }

    /** Local-header order of entries (what a streaming reader sees first). */
    fun localOrder(data: ByteArray): List<String> {
        val names = ArrayList<String>()
        ZipInputStream(ByteArrayInputStream(data)).use { z ->
            while (true) names.add((z.nextEntry ?: break).name)
        }
        return names
    }

    fun encryptionXml(vararg uris: String, algo: String = "http://www.idpf.org/2008/embedding"): ByteArray {
        val body = uris.joinToString("") {
            "<enc:EncryptedData xmlns:enc=\"http://www.w3.org/2001/04/xmlenc#\">" +
                "<enc:EncryptionMethod Algorithm=\"$algo\"/><enc:CipherData>" +
                "<enc:CipherReference URI=\"$it\"/></enc:CipherData></enc:EncryptedData>"
        }
        return "<?xml version=\"1.0\"?><encryption xmlns=\"$ENC_NS\">$body</encryption>".toByteArray()
    }
}
