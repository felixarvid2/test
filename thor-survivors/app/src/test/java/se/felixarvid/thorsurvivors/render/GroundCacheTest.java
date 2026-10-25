package se.felixarvid.thorsurvivors.render;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.graphics.Bitmap;
import android.graphics.Canvas;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import se.felixarvid.thorsurvivors.game.WorldGen;

import java.io.FileInputStream;

/** The chunk bitmaps: neighbours agree pixel for pixel across their border, builds are cheap, the LRU stays bounded. */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 35)
public class GroundCacheTest {
    private static final int T = 80, CH = WorldGen.CHUNK;

    private GroundCache cache(String stage) {
        SpriteAtlas a = SpriteAtlas.get();
        a.load(path -> new FileInputStream("src/main/assets/" + path));
        GroundCache c = new GroundCache();
        assertNotNull(a.groundTexture());
        c.setup(WorldGen.of(stage), stage, T, stage.equals("LIBRARY") ? 0xFF70747F : 0xFF8F8A84);
        return c;
    }

    private static void assertSame(Bitmap whole, int ox, int oy, Bitmap part, String what) {
        int w = part.getWidth(), h = part.getHeight();
        int[] a = new int[w * h], b = new int[w * h];
        whole.getPixels(a, 0, w, ox, oy, w, h);
        part.getPixels(b, 0, w, 0, 0, w, h);
        for (int i = 0; i < a.length; i++) {
            if (a[i] != b[i]) throw new AssertionError(what + " differs at " + i % w + "," + i / w);
        }
    }

    /**
     * Two neighbouring chunks drawn separately must equal the same 2-chunk window baked in one go: the rock texture is
     * sampled by world pixel, so only the decals that straddle the border could differ, and both sides paint those.
     */
    @Test
    public void chunksAreSeamlessAcrossBorders() {
        for (String stage : new String[]{"FOREST", "LIBRARY"}) {
            GroundCache c = cache(stage);
            WorldGen g = WorldGen.of(stage);
            Bitmap wide = Bitmap.createBitmap(2 * CH * T, CH * T, Bitmap.Config.ARGB_8888);
            Bitmap tall = Bitmap.createBitmap(CH * T, 2 * CH * T, Bitmap.Config.ARGB_8888);
            int across = 0;
            for (int cy = -3; cy < 3; cy++) {
                for (int cx = -3; cx < 3; cx++) {
                    c.bake(new Canvas(wide), cx * CH, cy * CH, 2 * CH, CH);
                    assertSame(wide, 0, 0, c.chunkBitmap(cx, cy), stage + " chunk " + cx + "," + cy + " left half");
                    assertSame(wide, CH * T, 0, c.chunkBitmap(cx + 1, cy), stage + " chunk " + (cx + 1) + "," + cy + " right half");
                    c.bake(new Canvas(tall), cx * CH, cy * CH, CH, 2 * CH);
                    assertSame(tall, 0, 0, c.chunkBitmap(cx, cy), stage + " chunk " + cx + "," + cy + " top half");
                    assertSame(tall, 0, CH * T, c.chunkBitmap(cx, cy + 1), stage + " chunk " + cx + "," + (cy + 1) + " bottom half");
                    float[] xs = new float[WorldGen.MAX_LIST], ys = new float[WorldGen.MAX_LIST];
                    int[] ks = new int[WorldGen.MAX_LIST];
                    int n = g.decals(cx * CH, cy * CH, cx * CH + 2 * CH - 1, cy * CH + CH - 1, xs, ys, ks);
                    for (int i = 0; i < n; i++) if (Math.abs(xs[i] - (cx + 1) * CH) < 1.2f) across++;
                }
            }
            assertTrue("decals straddle chunk borders somewhere: " + across, across > 10);
        }
    }

    @Test
    public void buildsAreCheapAndTheCacheStaysBounded() {
        GroundCache c = cache("FOREST");
        for (int cx = 0; cx < 8; cx++) c.chunkBitmap(cx, 50); // warm-up: JIT, first scaled copies of the atlas
        c.builds = 0;
        c.buildMsTotal = c.buildMsMax = 0;
        for (int cy = 0; cy < 6; cy++) for (int cx = 0; cx < 6; cx++) c.chunkBitmap(cx, cy);
        double avg = c.buildMsTotal / c.builds;
        System.out.printf("GROUND chunk build: avg %.2f ms, max %.2f ms over %d chunks (Robolectric native, desktop JVM)%n",
                avg, c.buildMsTotal == 0 ? 0 : c.buildMsMax, c.builds);
        assertTrue("avg " + avg, avg < 40);
        // walk 40 chunks east at 1080p: at most the visible new column plus one prefetch per frame is built, never more than CAP live
        c = cache("FOREST");
        c.async = false;
        Canvas canvas = new Canvas(Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888));
        android.graphics.Paint p = new android.graphics.Paint();
        int worst = 0, prev = 0;
        for (int f = 0; f < 3000; f++) {
            c.draw(canvas, p, 960 - f * 5, 540, f * 5, 0, 1920, 1080);
            if (f > 0) worst = Math.max(worst, c.builds - prev); // the first frame builds everything in view
            prev = c.builds;
        }
        int live = 0;
        for (int cx = -2; cx < 60; cx++) for (int cy = -2; cy < 3; cy++) if (c.peek(cx, cy) != null) live++;
        assertTrue("live chunks " + live, live <= GroundCache.CAP);
        assertTrue("worst frame built " + worst, worst <= 2);
        assertEquals(0, c.peek(0, 0) == null ? 0 : 1); // the start is long evicted
    }

    /** The ground is dark rock, not flat colour: real texture detail and decals show up in the bitmap. */
    @Test
    public void groundHasTextureAndStageTint() {
        int[] avg = new int[2];
        String[] stages = {"FOREST", "LIBRARY"};
        for (int s = 0; s < 2; s++) {
            Bitmap b = cache(stages[s]).chunkBitmap(5, 5);
            long sum = 0, sq = 0;
            int n = 0;
            for (int y = 0; y < b.getHeight(); y += 4) {
                for (int x = 0; x < b.getWidth(); x += 4) {
                    int p = b.getPixel(x, y), l = ((p >> 16 & 255) + (p >> 8 & 255) + (p & 255)) / 3;
                    sum += l;
                    sq += (long) l * l;
                    n++;
                }
            }
            double mean = sum / (double) n, var = sq / (double) n - mean * mean;
            avg[s] = (int) mean;
            assertTrue(stages[s] + " has texture variance " + var, var > 40);
            assertTrue(stages[s] + " is dark " + mean, mean < 110 && mean > 15);
        }
        assertTrue("mines darker than the flats: " + avg[1] + " vs " + avg[0], avg[1] <= avg[0]);
    }

    /** With the background thread: the ring just outside the view gets baked by the worker while the camera keeps still. */
    @Test
    public void prefetchRunsOffTheRenderThread() throws Exception {
        GroundCache c = cache("FOREST");
        Canvas canvas = new Canvas(Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888));
        android.graphics.Paint p = new android.graphics.Paint();
        c.draw(canvas, p, 960, 540, 0, 0, 1920, 1080);
        int first = c.builds;
        for (int f = 0; f < 400 && c.builds < first + 8; f++) {
            c.draw(canvas, p, 960, 540, 0, 0, 1920, 1080);
            Thread.sleep(5);
        }
        assertTrue("prefetched " + (c.builds - first), c.builds - first >= 4);
    }
}
