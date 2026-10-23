package se.felixarvid.thorsurvivors.render;

import static org.junit.Assert.assertTrue;

import android.graphics.Bitmap;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.game.Sim;

/**
 * Renders the real game through android.graphics.Canvas (Robolectric native graphics) to PNGs under
 * build/screenshots (or $SHOT_DIR) for eyeballing: menu, mid-fight crowd, level-up, a movement sequence.
 */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 35)
public class ScreenshotTest {
    private static boolean notBlank(Bitmap b) {
        int first = b.getPixel(0, 0), diff = 0;
        for (int y = 0; y < b.getHeight(); y += 7) {
            for (int x = 0; x < b.getWidth(); x += 7) if (b.getPixel(x, y) != first) diff++;
        }
        return diff > 200;
    }

    @Test
    public void menu() throws Exception {
        Shots h = new Shots();
        for (int i = 0; i < 90; i++) h.eng.advance(1f / 60f);
        Bitmap t = h.renderTop();
        Shots.save(t, "menu_top.png");
        assertTrue(notBlank(t));
        Bitmap b = h.renderBottom();
        Shots.save(b, "menu_bottom.png");
        assertTrue(notBlank(b));
    }

    @Test
    public void midFightAndLevelUp() throws Exception {
        Shots h = new Shots();
        Sim s = h.startRun("FOREST", "WHIP", 7, "MAGIC_MISSILE", "KNIFE", "AXE", "GARLIC", "HOLYBOOK");
        s.time = 100;
        h.drive(20, true);
        s = h.eng.sim;
        Bitmap t = h.renderTop();
        Shots.save(t, "fight_top.png");
        Shots.save(h.renderBottom(), "fight_bottom.png");
        System.out.println("SHOT enemies=" + s.enemyN + " projs=" + s.projN + " picks=" + s.pickN + " t=" + s.time
                + " level=" + s.level);
        assertTrue(notBlank(t));

        s.pendingLevelUps = 1;
        h.eng.advance(1f / 60f);
        assertTrue(h.eng.phase == Engine.PH_LEVELUP);
        Shots.save(h.renderTop(), "levelup_top.png");
        Shots.save(h.renderBottom(), "levelup_bottom.png");
    }
}
