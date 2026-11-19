package se.felixarvid.xteinkepub.core

/**
 * The pure arithmetic of the image pipeline, on plain arrays so that it can be unit tested on the
 * JVM and shared by the Android (Bitmap) and test (ImageIO) image processors.
 *
 * Gray images are ByteArrays with one byte per pixel (0..255, read with `and 0xff`).
 */
object ImageMath {
    /** PIL's integer RGB -> L conversion. */
    fun gray(r: Int, g: Int, b: Int): Int = (r * 19595 + g * 38470 + b * 7471 + 0x8000) shr 16

    /** Size that fits the box, never larger than the original (like `min(w/W, h/H, 1.0)` in Python). */
    fun fitSize(width: Int, height: Int, boxW: Int, boxH: Int): Pair<Int, Int> {
        val scale = minOf(boxW.toDouble() / width, boxH.toDouble() / height, 1.0)
        if (scale >= 1.0) return width to height
        return maxOf(1, Math.rint(width * scale).toInt()) to maxOf(1, Math.rint(height * scale).toInt())
    }

    /** Landscape images wider than the box are turned 90 degrees (when the option is on). */
    fun shouldRotate(width: Int, height: Int, opts: ImageOptions): Boolean =
        opts.rotateLandscape && width > height && width > opts.width

    /** Size of the final image for an image of [width]x[height] (after EXIF orientation). */
    fun finalSize(width: Int, height: Int, opts: ImageOptions): Pair<Int, Int> {
        val (w, h) = if (shouldRotate(width, height, opts)) height to width else width to height
        return fitSize(w, h, opts.width, opts.height)
    }

    /**
     * Largest power-of-two `inSampleSize` that still decodes at least the final size, so that huge
     * images do not run out of memory while the result stays as sharp as a full decode would give.
     */
    fun chooseSampleSize(width: Int, height: Int, opts: ImageOptions): Int {
        if (width <= 0 || height <= 0) return 1
        val rotate = shouldRotate(width, height, opts)
        val (fw, fh) = finalSize(width, height, opts)
        // final size is in the rotated frame when rotating; compare in the source frame
        val needW = if (rotate) fh else fw
        val needH = if (rotate) fw else fh
        var s = 1
        while (width / (s * 2) >= needW && height / (s * 2) >= needH && s < 64) s *= 2
        return s
    }

    /** Sizes to go through when downscaling: repeated halving while still >= 2x the target. */
    fun halvingSteps(width: Int, height: Int, targetW: Int, targetH: Int): List<Pair<Int, Int>> {
        val steps = ArrayList<Pair<Int, Int>>()
        var w = width
        var h = height
        while (w / 2 >= targetW && h / 2 >= targetH && w / 2 >= 1 && h / 2 >= 1) {
            w /= 2
            h /= 2
            steps.add(w to h)
        }
        return steps
    }

    fun histogram(gray: ByteArray): IntArray {
        val h = IntArray(256)
        for (b in gray) h[b.toInt() and 0xff]++
        return h
    }

    /** PIL `ImageOps.autocontrast(cutoff=...)` lookup table for one channel. */
    fun autocontrastLut(histogram: IntArray, cutoffPercent: Double = 0.5): IntArray {
        val h = histogram.copyOf()
        var n = 0L
        for (v in h) n += v
        var cut = (n * cutoffPercent / 100.0).toLong()
        for (lo in 0 until 256) {
            if (cut > h[lo]) {
                cut -= h[lo]
                h[lo] = 0
            } else {
                h[lo] -= cut.toInt()
                cut = 0
            }
            if (cut <= 0) break
        }
        cut = (n * cutoffPercent / 100.0).toLong()
        for (hi in 255 downTo 0) {
            if (cut > h[hi]) {
                cut -= h[hi]
                h[hi] = 0
            } else {
                h[hi] -= cut.toInt()
                cut = 0
            }
            if (cut <= 0) break
        }
        var lo = 0
        while (lo < 256 && h[lo] == 0) lo++
        var hi = 255
        while (hi >= 0 && h[hi] == 0) hi--
        val lut = IntArray(256)
        if (hi <= lo || lo >= 256) {
            for (i in 0 until 256) lut[i] = i
        } else {
            val scale = 255.0 / (hi - lo)
            val offset = -lo * scale
            for (i in 0 until 256) lut[i] = (i * scale + offset).toInt().coerceIn(0, 255)
        }
        return lut
    }

    fun applyLut(gray: ByteArray, lut: IntArray) {
        for (i in gray.indices) gray[i] = lut[gray[i].toInt() and 0xff].toByte()
    }

    /** Autocontrast with 0.5 % cut off at both ends, in place (grayscale only, like Python). */
    fun autocontrast(gray: ByteArray, cutoffPercent: Double = 0.5) {
        applyLut(gray, autocontrastLut(histogram(gray), cutoffPercent))
    }

    /** The evenly spaced gray values of a [levels]-level palette. */
    fun levelValues(levels: Int): IntArray = IntArray(levels) { Math.rint(it * 255.0 / (levels - 1)).toInt() }

    /**
     * Reduce [gray] (w x h) to [levels] evenly spaced grays in place, with Floyd-Steinberg error
     * diffusion when [dither] is on, otherwise by nearest level.
     */
    fun quantizeGray(gray: ByteArray, width: Int, height: Int, levels: Int, dither: Boolean) {
        require(levels in 2..256)
        if (levels >= 256) return
        val vals = levelValues(levels)
        // lookup: gray value 0..255 -> nearest level value
        val nearest = IntArray(256) { v ->
            var best = vals[0]
            for (c in vals) if (Math.abs(c - v) < Math.abs(best - v)) best = c
            best
        }
        if (!dither) {
            for (i in gray.indices) gray[i] = nearest[gray[i].toInt() and 0xff].toByte()
            return
        }
        // two rows of accumulated error, scaled by 16
        var cur = IntArray(width + 2)
        var next = IntArray(width + 2)
        for (y in 0 until height) {
            java.util.Arrays.fill(next, 0)
            for (x in 0 until width) {
                val idx = y * width + x
                val old = ((gray[idx].toInt() and 0xff) * 16 + cur[x + 1]).let {
                    // error is carried in 1/16 units; round to a gray value
                    Math.floorDiv(it + 8, 16)
                }.coerceIn(0, 255)
                val new = nearest[old]
                gray[idx] = new.toByte()
                val err = old - new
                cur[x + 2] += err * 7
                next[x] += err * 3
                next[x + 1] += err * 5
                next[x + 2] += err * 1
            }
            val t = cur
            cur = next
            next = t
        }
    }

    /** Composite a non-premultiplied ARGB pixel on white and return its 0xRRGGBB value. */
    fun flattenOnWhite(argb: Int): Int {
        val a = argb ushr 24
        if (a == 255) return argb and 0xFFFFFF
        val r = (argb shr 16) and 0xff
        val g = (argb shr 8) and 0xff
        val b = argb and 0xff
        fun mix(c: Int) = (c * a + 255 * (255 - a) + 127) / 255
        return (mix(r) shl 16) or (mix(g) shl 8) or mix(b)
    }

    /** Rotate a w x h gray image 90 degrees clockwise (PIL's ROTATE_270). The result is h x w. */
    fun rotateClockwise(src: ByteArray, width: Int, height: Int): ByteArray {
        val out = ByteArray(src.size)
        for (y in 0 until height) for (x in 0 until width) out[x * height + (height - 1 - y)] = src[y * width + x]
        return out
    }

    /** Same for packed pixels (e.g. ARGB). */
    fun rotateClockwise(src: IntArray, width: Int, height: Int): IntArray {
        val out = IntArray(src.size)
        for (y in 0 until height) for (x in 0 until width) out[x * height + (height - 1 - y)] = src[y * width + x]
        return out
    }
}
