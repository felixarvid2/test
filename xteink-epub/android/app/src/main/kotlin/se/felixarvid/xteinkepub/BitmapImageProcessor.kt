package se.felixarvid.xteinkepub

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import androidx.exifinterface.media.ExifInterface
import se.felixarvid.xteinkepub.core.ImageMath
import se.felixarvid.xteinkepub.core.ImageOptions
import se.felixarvid.xteinkepub.core.ImageProcessor
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

/**
 * Android implementation of [ImageProcessor]: decode (sub-sampled so that huge images fit in
 * memory), apply EXIF orientation, composite on white, gray + autocontrast, rotate, downscale to
 * the box, optional quantize, and write a baseline JPEG with [Bitmap.compress]. The arithmetic
 * lives in [ImageMath] and is unit tested on the JVM.
 */
class BitmapImageProcessor : ImageProcessor {

    override fun process(bytes: ByteArray, opts: ImageOptions): ByteArray? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        val orientation = readOrientation(bytes)
        val swap = orientation == ExifInterface.ORIENTATION_TRANSPOSE || orientation == ExifInterface.ORIENTATION_ROTATE_90 ||
            orientation == ExifInterface.ORIENTATION_TRANSVERSE || orientation == ExifInterface.ORIENTATION_ROTATE_270
        val orientedW = if (swap) bounds.outHeight else bounds.outWidth
        val orientedH = if (swap) bounds.outWidth else bounds.outHeight

        var sample = ImageMath.chooseSampleSize(orientedW, orientedH, opts)
        var decoded: Bitmap? = null
        while (decoded == null) {
            try {
                val o = BitmapFactory.Options().apply {
                    inSampleSize = sample
                    inPreferredConfig = Bitmap.Config.ARGB_8888
                }
                decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, o) ?: return null
            } catch (e: OutOfMemoryError) {
                if (sample >= 64) throw e
                sample *= 2 // the final size may become a little too small only for absurd images
            }
        }
        val oriented = applyOrientation(decoded, orientation)
        val w = oriented.width
        val h = oriented.height
        val argb = IntArray(w * h)
        oriented.getPixels(argb, 0, w, 0, 0, w, h)
        oriented.recycle()

        val finalOpts = opts
        var width = w
        var height = h
        val pixels: IntArray
        if (!finalOpts.color) {
            // composite on white, gray, autocontrast
            var gray = ByteArray(w * h)
            for (i in gray.indices) {
                val rgb = ImageMath.flattenOnWhite(argb[i])
                gray[i] = ImageMath.gray((rgb shr 16) and 0xff, (rgb shr 8) and 0xff, rgb and 0xff).toByte()
            }
            ImageMath.autocontrast(gray)
            if (ImageMath.shouldRotate(width, height, finalOpts)) {
                gray = ImageMath.rotateClockwise(gray, width, height)
                width = h
                height = w
            }
            pixels = IntArray(gray.size) { 0xFF000000.toInt() or ((gray[it].toInt() and 0xff) * 0x010101) }
        } else {
            var rgb = IntArray(argb.size) { 0xFF000000.toInt() or ImageMath.flattenOnWhite(argb[it]) }
            if (ImageMath.shouldRotate(width, height, finalOpts)) {
                rgb = ImageMath.rotateClockwise(rgb, width, height)
                width = h
                height = w
            }
            pixels = rgb
        }

        var bmp = Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
        val (tw, th) = ImageMath.fitSize(width, height, finalOpts.width, finalOpts.height)
        if (tw != width || th != height) bmp = downscale(bmp, tw, th)

        if (!finalOpts.color && finalOpts.levels < 256) {
            val n = bmp.width * bmp.height
            val px = IntArray(n)
            bmp.getPixels(px, 0, bmp.width, 0, 0, bmp.width, bmp.height)
            val gray = ByteArray(n) { (px[it] and 0xff).toByte() } // R = G = B
            ImageMath.quantizeGray(gray, bmp.width, bmp.height, finalOpts.levels, finalOpts.dither)
            for (i in 0 until n) px[i] = 0xFF000000.toInt() or ((gray[i].toInt() and 0xff) * 0x010101)
            val q = Bitmap.createBitmap(px, bmp.width, bmp.height, Bitmap.Config.ARGB_8888)
            bmp.recycle()
            bmp = q
        }

        val out = ByteArrayOutputStream(maxOf(4096, bmp.width * bmp.height / 4))
        val ok = bmp.compress(Bitmap.CompressFormat.JPEG, finalOpts.quality.coerceIn(1, 100), out)
        bmp.recycle()
        return if (ok) out.toByteArray() else null
    }

    /** Repeated halving (area-like) while the image is at least twice the target, then one filtered scale. */
    private fun downscale(src: Bitmap, tw: Int, th: Int): Bitmap {
        var cur = src
        for ((sw, sh) in ImageMath.halvingSteps(src.width, src.height, tw, th) + listOf(tw to th)) {
            val next = Bitmap.createScaledBitmap(cur, sw, sh, true)
            if (next !== cur) cur.recycle()
            cur = next
        }
        return cur
    }

    private fun readOrientation(bytes: ByteArray): Int = try {
        ExifInterface(ByteArrayInputStream(bytes))
            .getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    } catch (e: Exception) {
        ExifInterface.ORIENTATION_NORMAL
    }

    private fun applyOrientation(src: Bitmap, orientation: Int): Bitmap {
        val m = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> m.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_ROTATE_180 -> m.postRotate(180f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> m.postScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> { m.postRotate(90f); m.postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_ROTATE_90 -> m.postRotate(90f)
            ExifInterface.ORIENTATION_TRANSVERSE -> { m.postRotate(-90f); m.postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_ROTATE_270 -> m.postRotate(-90f)
            else -> return src
        }
        val out = Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true)
        if (out !== src) src.recycle()
        return out
    }
}
