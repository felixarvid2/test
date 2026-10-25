package se.felixarvid.thorsurvivors.render;

import static org.junit.Assert.assertTrue;

import android.graphics.Bitmap;
import android.graphics.Canvas;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import se.felixarvid.thorsurvivors.game.Sim;

import java.lang.reflect.Method;
import java.util.Arrays;

/**
 * Render cost with a full crowd (300 enemies, 6 weapons) in each lighting mode. The timings are software rasterisation on
 * the JVM: a proxy for comparing modes and for catching regressions, never an absolute fps claim (see the perf skill).
 * The allocation check: the world draw allocates nothing in steady state (camera fixed; the ground cache streams chunks when it moves).
 */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 35)
public class RenderCostTest {
    /** One sim step with the player standing still: the camera is fixed, so no ground chunk streaming muddies the numbers. */
    private static void stand(Shots h) {
        h.eng.input.clearMovement();
        h.eng.sim.hp = h.eng.sim.maxHp;
        if (h.eng.phase != se.felixarvid.thorsurvivors.game.Engine.PH_PLAYING) {
            h.eng.sim.pendingLevelUps = 0;
            h.eng.phase = se.felixarvid.thorsurvivors.game.Engine.PH_PLAYING;
        }
        h.eng.advance(1f / 60f);
    }

    @Test
    public void crowdDrawCostAndAllocation() throws Exception {
        Object mx = Class.forName("java.lang.management.ManagementFactory").getMethod("getThreadMXBean").invoke(null);
        Method alloc = Class.forName("com.sun.management.ThreadMXBean").getMethod("getThreadAllocatedBytes", long.class);
        long tid = Thread.currentThread().getId();
        long probe = (Long) alloc.invoke(mx, tid);
        probe = (Long) alloc.invoke(mx, tid) - probe; // the measurement's own garbage
        for (String stage : new String[]{"FOREST", "LIBRARY"}) {
            Shots h = new Shots();
            Sim s = h.startRun(stage, "WHIP", 3, "MAGIC_MISSILE", "KNIFE", "AXE", "GARLIC", "HOLYBOOK");
            s.time = 25 * 60;
            h.drive(40, true);
            s = h.eng.sim;
            assertTrue("a full crowd: " + s.enemyN, s.enemyN >= 250);
            Bitmap b = Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(b);
            for (int mode = 2; mode >= 0; mode--) {
                h.eng.meta.lighting = mode;
                for (int i = 0; i < 100; i++) { stand(h); h.world.draw(c, 1920, 1080, h.eng, true); }
                java.util.Arrays.fill(WorldRenderer.AL,0);
                final int n = 120;
                double[] ms = new double[n];
                long bytes = 0;
                for (int i = 0; i < n; i++) {
                    stand(h);
                    long a0 = (Long) alloc.invoke(mx, tid);
                    long t0 = System.nanoTime();
                    h.world.draw(c, 1920, 1080, h.eng, true);
                    ms[i] = (System.nanoTime() - t0) / 1e6;
                    bytes += (Long) alloc.invoke(mx, tid) - a0 - probe;
                }
                System.out.println("SECT "+stage+" "+mode+" "+java.util.Arrays.toString(java.util.stream.LongStream.of(WorldRenderer.AL).map(x->x/n).toArray()));
                Arrays.sort(ms);
                System.out.printf("PERF %s lighting=%s: enemies=%d draw median %.1f ms, p95 %.1f ms (software raster), allocation %d B/frame%n",
                        stage, new String[]{"OFF", "LOW", "FULL"}[mode], h.eng.sim.enemyN, ms[n / 2], ms[(int) (n * 0.95)], bytes / n);
                assertTrue(stage + " mode " + mode + " allocates " + bytes / n + " B per frame", bytes / n < 256);
            }
        }
    }
}
