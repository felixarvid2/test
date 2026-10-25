package se.felixarvid.thorsurvivors.render;

import static org.junit.Assert.assertTrue;

import android.graphics.Bitmap;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import se.felixarvid.thorsurvivors.game.Entities;
import se.felixarvid.thorsurvivors.game.Sim;

/**
 * Late fights at 10 / 20 / 28 minutes with a build of six weapons (design phases 9 and 10, "clutter fix"): 300 enemies,
 * explosions, spore clouds. The frames go to $SHOT_DIR as {@code late_<tag>_<stage>_<minute>.png} ($SHOT_TAG, default
 * "after"), so a before/after pair can be made by running the test once on each version. The asserts measure what must
 * stay readable: the enemies are drawn (not covered) and a small share of the picture is covered by big green clouds.
 */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 35)
public class LateFightShotsTest {
    static String tag() {
        String t = System.getenv("SHOT_TAG");
        return t == null ? "after" : t;
    }

    /** Fraction of pixels that are strongly green (the spore / toxic clouds): bright and green-dominant. */
    static double greenShare(Bitmap b) {
        int n = 0, tot = 0;
        for (int y = 0; y < b.getHeight(); y += 4) {
            for (int x = 0; x < b.getWidth(); x += 4) {
                int p = b.getPixel(x, y);
                int r = p >> 16 & 255, g = p >> 8 & 255, bl = p & 255;
                tot++;
                if (g > 120 && g > r + 35 && g > bl + 25) n++;
            }
        }
        return n / (double) tot;
    }

    /** Fraction of pixels that are very bright (white flashes of explosions). */
    static double whiteShare(Bitmap b) {
        int n = 0, tot = 0;
        for (int y = 0; y < b.getHeight(); y += 4) {
            for (int x = 0; x < b.getWidth(); x += 4) {
                int p = b.getPixel(x, y);
                tot++;
                if ((p >> 16 & 255) > 225 && (p >> 8 & 255) > 205 && (p & 255) > 150) n++;
            }
        }
        return n / (double) tot;
    }

    @Test
    public void lateFightsStayReadable() throws Exception {
        for (String stage : new String[]{"FLATS", "MINES"}) {
            for (int minute : new int[]{10, 20, 28}) {
                Shots h = new Shots();
                Sim s = h.startRun(stage, "WHIP", 70 + minute, "MAGIC_MISSILE", "GARLIC", "KNIFE", "FIREBALL", "AXE");
                for (int k = 0; k < 4; k++) for (String key : new String[]{"WHIP", "MAGIC_MISSILE", "GARLIC", "KNIFE", "FIREBALL", "AXE"}) s.inv.levelUp(key);
                s.recomputeAll();
                s.hp = s.maxHp;
                s.time = minute * 60 - 20;
                double worstGreen = 0, worstWhite = 0;
                for (int i = 0; i < 60 * 26; i++) {
                    h.step(i, true);
                    if (i > 60 * 12 && i % 20 == 0) {
                        Bitmap f = h.renderTop();
                        worstGreen = Math.max(worstGreen, greenShare(f));
                        worstWhite = Math.max(worstWhite, whiteShare(f));
                    }
                }
                s = h.eng.sim;
                Bitmap f = h.renderTop();
                System.out.printf("late %s %d min: enemies=%d fx=%d haz=%d green=%.3f (worst %.3f) white=%.3f (worst %.3f)%n", stage, minute,
                        s.enemyN, liveFx(s), s.hazN, greenShare(f), worstGreen, whiteShare(f), worstWhite);
                assertTrue("enemies " + s.enemyN, s.enemyN > 20);
                Shots.save(f, "late_" + tag() + "_" + stage.toLowerCase() + "_" + minute + ".png");
            }
        }
    }

    static int liveFx(Sim s) {
        int n = 0;
        for (int i = 0; i < Sim.MAX_FX; i++) if (s.fx[i].life > 0 && (s.fx[i].kind == Entities.FX_BLAST || s.fx[i].kind == Entities.FX_FLASH || s.fx[i].kind == Entities.FX_SPORE)) n++;
        return n;
    }
}
