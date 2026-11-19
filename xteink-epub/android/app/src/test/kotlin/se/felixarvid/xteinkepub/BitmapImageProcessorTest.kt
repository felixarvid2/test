package se.felixarvid.xteinkepub

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import se.felixarvid.xteinkepub.core.ImageOptions

/** Runs the real Android decode/scale/encode path on the JVM with Robolectric's native graphics. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35])
class BitmapImageProcessorTest {
    private val processor = BitmapImageProcessor()

    private fun run(bytes: ByteArray, opts: ImageOptions = ImageOptions()): Pair<ByteArray, JpegInfo> {
        val out = processor.process(bytes, opts)
        assertNotNull("processor returned null", out)
        val info = jpegInfo(out!!)
        assertNotNull("output is not a JPEG", info)
        assertTrue("output is not baseline", info!!.baseline && !info.progressive)
        // the decoder must be able to read it back with the same size
        val bmp = BitmapFactory.decodeByteArray(out, 0, out.size)
        assertEquals(info.width, bmp.width)
        assertEquals(info.height, bmp.height)
        return out to info
    }

    private fun decode(b: ByteArray): Bitmap = BitmapFactory.decodeByteArray(b, 0, b.size)

    private fun lum(p: Int) = ((p shr 16 and 0xff) * 299 + (p shr 8 and 0xff) * 587 + (p and 0xff) * 114) / 1000

    @Test fun progressiveJpegBecomesBaseline() {
        val src = resource("progressive.jpg")
        assertTrue(jpegInfo(src)!!.progressive)
        val (_, info) = run(src)
        assertEquals(480 to 640, info.width to info.height)
    }

    @Test fun pngAlphaIsCompositedOnWhite() {
        val px = IntArray(300 * 400) { 0x00FF0000 } // transparent red
        for (y in 100 until 200) for (x in 100 until 200) px[y * 300 + x] = 0xFF000000.toInt()
        val im = Bitmap.createBitmap(px, 300, 400, Bitmap.Config.ARGB_8888)
        val (out, info) = run(png(im))
        assertEquals(300 to 400, info.width to info.height)
        val bmp = decode(out)
        assertTrue(lum(bmp.getPixel(5, 5)) > 235)
        assertTrue(lum(bmp.getPixel(150, 150)) < 40)
    }

    @Test fun gifIsConverted() {
        val (_, info) = run(resource("gradient.gif"))
        assertEquals(480 to 360, info.width to info.height)
    }

    @Test fun webpIfTheDecoderSupportsIt() {
        // ImageIO cannot write WebP, so make one with Android's encoder
        val bmp = Bitmap.createBitmap(600, 400, Bitmap.Config.ARGB_8888)
        bmp.eraseColor(0xFF3366CC.toInt())
        val out = java.io.ByteArrayOutputStream()
        val ok = try { bmp.compress(Bitmap.CompressFormat.WEBP_LOSSY, 90, out) } catch (e: Throwable) { false }
        assumeTrue("WebP encoder not available in this Robolectric", ok && out.size() > 0)
        val webp = out.toByteArray()
        assumeTrue("WebP decoder not available", BitmapFactory.decodeByteArray(webp, 0, webp.size) != null)
        val (_, info) = run(webp)
        assertEquals(480 to 320, info.width to info.height)
    }

    @Test fun hugeImageFitsTheBoxAndKeepsAspect() {
        val (_, info) = run(jpeg(gradient(4000, 3000)))
        assertTrue(info.width <= 480 && info.height <= 800)
        assertEquals(480 to 360, info.width to info.height)
    }

    @Test fun hugeTallImage() {
        val (_, info) = run(jpeg(gradient(3000, 9000)))
        assertTrue(info.width <= 480 && info.height <= 800)
        assertEquals(267 to 800, info.width to info.height)
    }

    @Test fun smallImageIsNotUpscaled() {
        val (_, info) = run(png(gradient(100, 80)))
        assertEquals(100 to 80, info.width to info.height)
    }

    @Test fun exifOrientation6GivesPortrait() {
        val src = withOrientation(jpeg(gradient(800, 600)), 6)
        val (_, info) = run(src)
        // 800x600 landscape turned to 600x800 portrait, then fitted into 480x800
        assertEquals(480 to 640, info.width to info.height)
    }

    @Test fun grayscaleByDefaultAndColorOnRequest() {
        val src = png(gradient(300, 200))
        val g = decode(run(src).first)
        var maxDiff = 0
        for (y in 0 until g.height step 7) for (x in 0 until g.width step 7) {
            val p = g.getPixel(x, y)
            maxDiff = maxOf(maxDiff, Math.abs((p shr 16 and 0xff) - (p and 0xff)), Math.abs((p shr 8 and 0xff) - (p and 0xff)))
        }
        assertTrue("grayscale output has colour ($maxDiff)", maxDiff <= 4)
        val c = decode(run(src, ImageOptions(color = true)).first)
        var color = 0
        for (y in 0 until c.height step 7) for (x in 0 until c.width step 7) {
            val p = c.getPixel(x, y)
            color = maxOf(color, Math.abs((p shr 16 and 0xff) - (p and 0xff)))
        }
        assertTrue("colour lost ($color)", color > 30)
    }

    @Test fun fourLevelsGiveFewGrayClusters() {
        for (dither in listOf(true, false)) {
            val (out, _) = run(jpeg(gradient(400, 300)), ImageOptions(levels = 4, dither = dither))
            val bmp = decode(out)
            var near = 0
            var total = 0
            for (y in 0 until bmp.height) for (x in 0 until bmp.width) {
                val v = lum(bmp.getPixel(x, y))
                total++
                if (listOf(0, 85, 170, 255).any { Math.abs(it - v) <= 25 }) near++
            }
            assertTrue("dither=$dither near=${near.toDouble() / total}", near.toDouble() / total > 0.9)
        }
    }

    @Test fun rotateLandscape() {
        val src = png(gradient(1600, 900))
        val (_, rot) = run(src, ImageOptions(rotateLandscape = true))
        assertEquals(450 to 800, rot.width to rot.height)
        val (_, plain) = run(src)
        assertEquals(480 to 270, plain.width to plain.height)
        // landscape but narrow enough: not rotated
        val (_, small) = run(png(gradient(300, 200)), ImageOptions(rotateLandscape = true))
        assertEquals(300 to 200, small.width to small.height)
    }

    @Test fun customBox() {
        val (_, info) = run(png(gradient(1000, 1000)), ImageOptions(width = 200, height = 300))
        assertEquals(200 to 200, info.width to info.height)
    }

    @Test fun undecodableGivesNull() {
        assertNull(processor.process("not an image".toByteArray(), ImageOptions()))
    }

    @Test fun outputComponentCounts() {
        val src = png(gradient(300, 200))
        // Android's encoder writes YCbCr (3 components) even for gray content; both are valid baseline JPEGs
        assertTrue(run(src).second.components in setOf(1, 3))
        assertEquals(3, run(src, ImageOptions(color = true)).second.components)
    }
}
