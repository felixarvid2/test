package se.felixarvid.thorsurvivors.render;

import static org.junit.Assert.assertTrue;

import android.graphics.Bitmap;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import se.felixarvid.thorsurvivors.game.Sim;

/** Screenshots of the stage layout (forest clumps, paths, meadows, library rows, braziers) for eyeballing. */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 35)
public class StageShotsTest {
    private static void walk(Shots h, float dx, float dy, double seconds) {
        for (int i = 0; i < (int) (seconds * 60); i++) {
            h.eng.input.stickX = dx;
            h.eng.input.stickY = dy;
            h.eng.sim.hp = h.eng.sim.maxHp;
            h.eng.advance(1f / 60f);
        }
    }

    private static Bitmap crop(Bitmap b, int cx, int cy, int w, int hgt, int scale) {
        int x = Math.max(0, Math.min(b.getWidth() - w, cx - w / 2)), y = Math.max(0, Math.min(b.getHeight() - hgt, cy - hgt / 2));
        return Bitmap.createScaledBitmap(Bitmap.createBitmap(b, x, y, w, hgt), w * scale, hgt * scale, false);
    }

    @Test
    public void forest() throws Exception {
        Shots h = new Shots();
        Sim s = h.startRun("FOREST", "WHIP", 7);
        Shots.save(h.renderTop(), "forest_start.png");
        walk(h, 1f, 0f, 10.5); // ~1500 u east
        System.out.println("SHOT forest east x=" + h.eng.sim.px);
        Shots.save(h.renderTop(), "forest_east_1500.png");
        walk(h, 0f, 1f, 10.5);
        Shots.save(h.renderTop(), "forest_east_south.png");
        walk(h, -1f, -1f, 12);
        Shots.save(h.renderTop(), "forest_northwest.png");
    }

    @Test
    public void forestFight() throws Exception {
        Shots h = new Shots();
        Sim s = h.startRun("FOREST", "WHIP", 7, "MAGIC_MISSILE", "KNIFE", "AXE", "GARLIC", "HOLYBOOK");
        s.time = 120;
        h.drive(20, true);
        Bitmap t = h.renderTop();
        Shots.save(t, "forest_fight_2min.png");
    }

    @Test
    public void library() throws Exception {
        Shots h = new Shots();
        h.startRun("LIBRARY", "WHIP", 7);
        Shots.save(h.renderTop(), "library_start.png");
        walk(h, 0f, 1f, 6);
        Shots.save(h.renderTop(), "library_south.png");
        walk(h, 1f, 0f, 8);
        Shots.save(h.renderTop(), "library_south_east.png");
        h = new Shots();
        Sim s = h.startRun("LIBRARY", "WHIP", 7, "MAGIC_MISSILE", "KNIFE", "GARLIC", "HOLYBOOK");
        s.time = 120;
        h.drive(20, true);
        Shots.save(h.renderTop(), "library_fight.png");
    }

    @Test
    public void braziers() throws Exception {
        for (String stage : new String[]{"FOREST", "LIBRARY"}) {
            Shots h = new Shots();
            Sim s = h.startRun(stage, "WHIP", 7);
            assertTrue(s.destN > 0);
            int best = 0;
            for (int i = 0; i < s.destN; i++) {
                if (Math.hypot(s.destX[i], s.destY[i]) < Math.hypot(s.destX[best], s.destY[best])) best = i;
            }
            float bx = s.destX[best], by = s.destY[best];
            s.noSpawnsForTest();
            s.enemyN = 0;
            s.px = bx - 150;
            s.py = by;
            s.facingRight = true;
            h.eng.advance(1f / 60f);
            Bitmap before = h.renderTop();
            int cx = 960 + Math.round((bx - s.px) * 1080f / 560f), cy = 540 + Math.round((by - s.py) * 1080f / 560f);
            Shots.save(crop(before, cx - 120, cy, 480, 270, 3), stage.toLowerCase() + "_brazier_before.png");
            int n0 = s.destN;
            for (int i = 0; i < 150 && s.destN >= n0; i++) {
                s.px = Math.min(bx - 60, s.px + 1);
                h.eng.advance(1f / 60f);
            }
            assertTrue("broke", s.destN < n0);
            for (int i = 0; i < 6; i++) h.eng.advance(1f / 60f);
            Bitmap after = h.renderTop();
            Shots.save(crop(after, cx - 60, cy, 480, 270, 3), stage.toLowerCase() + "_brazier_after.png");
            System.out.println("SHOT " + stage + " drops: pickN=" + s.pickN + " gold=" + s.gold);
        }
    }

    /** Other screen sizes pick another integer tile scale; the ground, props and braziers must still draw. */
    @Test
    public void otherResolutionsDraw() throws Exception {
        Shots h = new Shots();
        h.startRun("FOREST", "WHIP", 7);
        h.eng.advance(1f / 60f);
        int[][] sizes = {{1280, 720}, {2560, 1440}, {800, 480}};
        for (int[] sz : sizes) {
            Bitmap b = Bitmap.createBitmap(sz[0], sz[1], Bitmap.Config.ARGB_8888);
            h.world.draw(new android.graphics.Canvas(b), sz[0], sz[1], h.eng, true);
            int first = b.getPixel(0, 0), diff = 0;
            for (int y = 0; y < b.getHeight(); y += 5) for (int x = 0; x < b.getWidth(); x += 5) if (b.getPixel(x, y) != first) diff++;
            assertTrue(sz[0] + "x" + sz[1], diff > 200);
            if (sz[0] == 1280) Shots.save(b, "forest_720p.png");
        }
    }
}
