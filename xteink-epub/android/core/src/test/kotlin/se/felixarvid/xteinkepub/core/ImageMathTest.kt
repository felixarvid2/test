package se.felixarvid.xteinkepub.core

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ImageMathTest {
    private fun bytes(vararg v: Int) = ByteArray(v.size) { v[it].toByte() }

    @Test fun fitSizeNeverUpscales() {
        assertEquals(480 to 640, ImageMath.fitSize(1200, 1600, 480, 800))
        assertEquals(100 to 50, ImageMath.fitSize(100, 50, 480, 800))
        assertEquals(480 to 270, ImageMath.fitSize(1600, 900, 480, 800))
        assertEquals(450 to 800, ImageMath.fitSize(900, 1600, 480, 800))
        assertEquals(1 to 800, ImageMath.fitSize(1, 100000, 480, 800))
        // Python's round() is half-to-even: 5 * 0.5 = 2.5 -> 2
        assertEquals(2 to 2, ImageMath.fitSize(5, 4, 10, 2))
    }

    @Test fun rotateRule() {
        val o = ImageOptions(rotateLandscape = true)
        assertTrue(ImageMath.shouldRotate(1600, 900, o))
        assertEquals(false, ImageMath.shouldRotate(300, 200, o)) // landscape but fits the width
        assertEquals(false, ImageMath.shouldRotate(900, 1600, o))
        assertEquals(false, ImageMath.shouldRotate(1600, 900, ImageOptions()))
        assertEquals(450 to 800, ImageMath.finalSize(1600, 900, o))
    }

    @Test fun sampleSizeKeepsFullQualityForTheTarget() {
        val o = ImageOptions()
        assertEquals(1, ImageMath.chooseSampleSize(480, 800, o))
        assertEquals(1, ImageMath.chooseSampleSize(900, 1500, o))
        assertEquals(2, ImageMath.chooseSampleSize(1000, 1700, o))
        assertEquals(8, ImageMath.chooseSampleSize(6000, 9000, o).let { if (it >= 8) 8 else it })
        // never so small that the final size could not be reached
        for ((w, h) in listOf(3000 to 4000, 4000 to 3000, 10000 to 800, 9000 to 9000)) {
            val s = ImageMath.chooseSampleSize(w, h, o)
            val (fw, fh) = ImageMath.finalSize(w, h, o)
            assertTrue("$w x $h s=$s", w / s >= fw && h / s >= fh)
        }
        val rot = ImageOptions(rotateLandscape = true)
        val s = ImageMath.chooseSampleSize(4000, 3000, rot)
        assertTrue(3000 / s >= 600 && 4000 / s >= 800)
    }

    @Test fun halvingSteps() {
        assertEquals(listOf(600 to 800, 300 to 400), ImageMath.halvingSteps(1200, 1600, 250, 300))
        assertEquals(emptyList<Pair<Int, Int>>(), ImageMath.halvingSteps(900, 1500, 480, 800))
    }

    @Test fun autocontrastLutStretchesAndClips() {
        // pixels only between 100 and 200 -> stretched to the full range
        val hist = IntArray(256)
        for (v in 100..200) hist[v] = 100
        val lut = ImageMath.autocontrastLut(hist, 0.5)
        assertTrue(lut[100] <= 3)
        assertTrue(lut[200] >= 253) // PIL truncates: int(200 * 2.55 - 255) = 254
        assertTrue(lut[150] in 120..135)
        for (i in 1 until 256) assertTrue(lut[i] >= lut[i - 1])
        // cutoff ignores 0.5 % outliers: one black pixel in 1000 must not stop the stretch
        val h2 = IntArray(256)
        h2[0] = 1
        for (v in 100..200) h2[v] = 10
        h2[255] = 1
        val lut2 = ImageMath.autocontrastLut(h2, 0.5)
        assertEquals(0, lut2[100])
        assertTrue(lut2[200] >= 253)
    }

    @Test fun autocontrastFlatImageIsUntouched() {
        val hist = IntArray(256)
        hist[128] = 1000
        val lut = ImageMath.autocontrastLut(hist)
        for (i in 0 until 256) assertEquals(i, lut[i])
    }

    @Test fun autocontrastMatchesPilForKnownCase() {
        // PIL: Image.frombytes("L",(4,1),bytes([50,100,150,200])) autocontrast(cutoff=0) -> [0,85,170,255]
        val g = bytes(50, 100, 150, 200)
        ImageMath.autocontrast(g, 0.0)
        assertArrayEquals(bytes(0, 85, 170, 255), g)
    }

    @Test fun levelValues() {
        assertArrayEquals(intArrayOf(0, 85, 170, 255), ImageMath.levelValues(4))
        assertEquals(16, ImageMath.levelValues(16).size)
        assertEquals(255, ImageMath.levelValues(16).last())
        assertEquals(17, ImageMath.levelValues(16)[1])
    }

    @Test fun quantizeWithoutDitherPicksNearestLevel() {
        val g = bytes(0, 30, 50, 100, 130, 200, 255)
        ImageMath.quantizeGray(g, g.size, 1, 4, dither = false)
        assertArrayEquals(bytes(0, 0, 85, 85, 170, 170, 255), g)
    }

    @Test fun floydSteinbergOnlyUsesLevelsAndKeepsAverage() {
        val w = 64
        val h = 64
        val g = ByteArray(w * h) { 100.toByte() }
        ImageMath.quantizeGray(g, w, h, 4, dither = true)
        val levels = setOf(0, 85, 170, 255)
        var sum = 0L
        val seen = HashSet<Int>()
        for (b in g) {
            val v = b.toInt() and 0xff
            assertTrue("level $v", v in levels)
            seen.add(v)
            sum += v
        }
        assertTrue("dithering should mix two levels", seen.size >= 2)
        val avg = sum.toDouble() / g.size
        assertTrue("average $avg", Math.abs(avg - 100) < 3)
        // exact levels stay put
        val flat = ByteArray(16) { 170.toByte() }
        ImageMath.quantizeGray(flat, 4, 4, 4, dither = true)
        assertTrue(flat.all { (it.toInt() and 0xff) == 170 })
    }

    @Test fun quantize256IsNoOp() {
        val g = bytes(1, 2, 3)
        ImageMath.quantizeGray(g, 3, 1, 256, true)
        assertArrayEquals(bytes(1, 2, 3), g)
    }

    @Test fun grayMatchesPil() {
        assertEquals(255, ImageMath.gray(255, 255, 255))
        assertEquals(0, ImageMath.gray(0, 0, 0))
        assertEquals(76, ImageMath.gray(255, 0, 0)) // PIL: 76
        assertEquals(150, ImageMath.gray(0, 255, 0))
        assertEquals(29, ImageMath.gray(0, 0, 255))
    }

    @Test fun flattenOnWhite() {
        assertEquals(0xFFFFFF, ImageMath.flattenOnWhite(0x00FF0000)) // transparent red -> white
        assertEquals(0xFF0000, ImageMath.flattenOnWhite(0xFFFF0000.toInt()))
        assertEquals(0x000000, ImageMath.flattenOnWhite(0xFF000000.toInt()))
        val half = ImageMath.flattenOnWhite(0x80000000.toInt())
        assertTrue((half and 0xff) in 126..128)
    }

    @Test fun rotateClockwise() {
        // 3 x 2:  1 2 3 / 4 5 6  ->  2 x 3:  4 1 / 5 2 / 6 3
        assertArrayEquals(bytes(4, 1, 5, 2, 6, 3), ImageMath.rotateClockwise(bytes(1, 2, 3, 4, 5, 6), 3, 2))
        assertArrayEquals(intArrayOf(4, 1, 5, 2, 6, 3), ImageMath.rotateClockwise(intArrayOf(1, 2, 3, 4, 5, 6), 3, 2))
    }
}
