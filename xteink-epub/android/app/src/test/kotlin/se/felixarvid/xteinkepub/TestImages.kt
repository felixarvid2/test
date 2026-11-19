package se.felixarvid.xteinkepub

import androidx.exifinterface.media.ExifInterface
import android.graphics.Bitmap
import java.io.ByteArrayOutputStream
import java.io.File

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
            return JpegInfo(m == 0xC0 || m == 0xC1, m == 0xC2, w, h, data[i + 9].toInt() and 0xff)
        }
        i += 2 + len
    }
    return null
}

/** Colourful gradient so that autocontrast and colour tests have something to work on. */
fun gradient(w: Int, h: Int, alpha: Boolean = false): Bitmap {
    val px = IntArray(w * h)
    for (y in 0 until h) for (x in 0 until w) {
        val v = (x * 200 / w + y * 55 / h).coerceIn(0, 255)
        px[y * w + x] = (0xFF shl 24) or (v shl 16) or ((255 - v) / 2 shl 8) or (40 + x * 100 / w)
    }
    return Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888).also { it.setHasAlpha(alpha) }
}

fun encode(bmp: Bitmap, format: Bitmap.CompressFormat, quality: Int = 90): ByteArray {
    val out = ByteArrayOutputStream()
    check(bmp.compress(format, quality, out)) { "cannot encode $format" }
    return out.toByteArray()
}

fun png(bmp: Bitmap) = encode(bmp, Bitmap.CompressFormat.PNG)
fun jpeg(bmp: Bitmap) = encode(bmp, Bitmap.CompressFormat.JPEG)

/** Files in app/src/test/resources (the progressive JPEG and the GIF come from ImageIO). */
fun resource(name: String): ByteArray =
    object {}.javaClass.classLoader!!.getResourceAsStream(name)!!.use { it.readBytes() }

/** Sets the EXIF orientation tag of a JPEG. */
fun withOrientation(jpeg: ByteArray, orientation: Int): ByteArray {
    val f = File.createTempFile("exif", ".jpg")
    try {
        f.writeBytes(jpeg)
        val exif = ExifInterface(f.absolutePath)
        exif.setAttribute(ExifInterface.TAG_ORIENTATION, orientation.toString())
        exif.saveAttributes()
        return f.readBytes()
    } finally {
        f.delete()
    }
}
