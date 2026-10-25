package se.felixarvid.thorsurvivors.render;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.graphics.Bitmap;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import se.felixarvid.thorsurvivors.game.Sim;

/** Crowd scenes: 6 consecutive frames while moving, draw-order stability, and "no blinking when hit". */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 35)
public class CrowdOrderTest {
    private Shots crowd() throws Exception {
        Shots h = new Shots();
        Sim s = h.startRun("FOREST", "WHIP", 3);
        s.inv.weaponCount = 0; // nothing kills: the crowd keeps piling up around the player
        s.main.cd = 1e9f; // the hero's main weapon neither
        s.recomputeAll();
        s.time = 150;
        h.drive(30, true);
        return h;
    }

    private static int indexOf(int[] a, int n, int v) {
        for (int i = 0; i < n; i++) if (a[i] == v) return i;
        return -1;
    }

    @Test
    public void drawOrderNeverFlipsInACrowd() throws Exception {
        Shots h = crowd();
        Sim s = h.eng.sim;
        assertTrue("enemies " + s.enemyN, s.enemyN >= 100);
        int n0 = 0;
        int[] prevId = null, prevSx = null, prevSy = null, prevFeet = null;
        int prevN = 0;
        for (int f = 0; f < 6; f++) {
            h.step(2000 + f, true);
            Bitmap b = h.renderTop();
            if (f == 0 || f == 5) Shots.save(b, "crowd_top_" + f + ".png");
            Shots.save(b, "seq_" + f + ".png");
            WorldRenderer w = h.world;
            int n = w.orderN;
            // strictly sorted by (feet, id)
            for (int i = 1; i < n; i++) {
                boolean ok = w.orderFeet[i - 1] < w.orderFeet[i]
                        || (w.orderFeet[i - 1] == w.orderFeet[i] && w.orderId[i - 1] < w.orderId[i]);
                assertTrue("frame " + f + " not sorted at " + i, ok);
            }
            if (prevId != null) {
                int overlaps = 0;
                for (int i = 0; i < n; i++) {
                    for (int j = i + 1; j < n; j++) {
                        // i is drawn before j now; find them in the previous frame
                        int pi = indexOf(prevId, prevN, w.orderId[i]), pj = indexOf(prevId, prevN, w.orderId[j]);
                        if (pi < 0 || pj < 0) continue;
                        boolean overlap = Math.abs(w.orderSx[i] - w.orderSx[j]) < 40 && Math.abs(w.orderSy[i] - w.orderSy[j]) < 40;
                        if (!overlap) continue;
                        overlaps++;
                        boolean yOrderSame = (prevFeet[pi] < prevFeet[pj]) == (w.orderFeet[i] < w.orderFeet[j])
                                && prevFeet[pi] != prevFeet[pj] && w.orderFeet[i] != w.orderFeet[j];
                        if (yOrderSame) assertTrue("z-order flipped between frames " + (f - 1) + "/" + f, pi < pj);
                    }
                }
                n0 += overlaps;
            }
            prevN = n;
            prevId = w.orderId.clone();
            prevSx = w.orderSx.clone();
            prevSy = w.orderSy.clone();
            prevFeet = w.orderFeet.clone();
        }
        assertTrue("expected overlapping pairs in the crowd, got " + n0, n0 > 20);
    }

    /** After a hit the player gets a red tint for ~0.12 s and then looks identical frame to frame (no 20 Hz blink). */
    @Test
    public void playerDoesNotBlinkAfterAHit() throws Exception {
        Shots h = new Shots();
        Sim s = h.startRun("FOREST", "WHIP", 5);
        s.inv.weaponCount = 0;
        s.main.cd = 1e9f; // no attack clip: the idle pose must stay still
        s.recomputeAll();
        h.eng.input.clearMovement();
        s.enemyN = 0;
        s.time = 0.1; // the idle clip stays on one frame for the whole second
        h.eng.advance(1f / 60f);
        s.enemyN = 0;
        Bitmap ref = h.renderTop();
        int cx = Shots.TOP_W / 2, cy = Shots.TOP_H / 2;
        int normal = ref.getPixel(cx, cy - 45);
        s.hp -= 10;
        s.invuln = 0.5f; // i-frames as the Sim gives after a hit
        int[] px = new int[30];
        for (int f = 0; f < 30; f++) {
            s.enemyN = 0;
            h.eng.advance(1f / 60f);
            px[f] = h.renderTop().getPixel(cx, cy - 45);
        }
        assertTrue("red tint right after the hit", px[0] != normal);
        for (int f = 12; f < 30; f++) assertEquals("blink at frame " + f, normal, px[f]);
    }
}
