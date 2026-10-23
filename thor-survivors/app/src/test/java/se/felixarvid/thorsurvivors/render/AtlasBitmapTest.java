package se.felixarvid.thorsurvivors.render;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.graphics.Bitmap;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import java.io.FileInputStream;

/** Frames are sliced exactly and scaled by whole factors: no neighbour bleed, flips and silhouettes line up. */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 35)
public class AtlasBitmapTest {
    @Test
    public void scaledFramesAreExactBlockCopiesOfTheSlice() throws Exception {
        SpriteAtlas a = SpriteAtlas.get();
        a.load(path -> new FileInputStream("src/main/assets/" + path));
        SpriteAtlas.Sprite s = a.find("enemy.ZOMBIE");
        assertNotNull(s);
        assertEquals(16, s.width());
        Bitmap base = s.base[0], big = a.bitmap(s, 0, 3, SpriteAtlas.T_NORMAL, false);
        assertEquals(48, big.getWidth());
        for (int y = 0; y < 48; y++) {
            for (int x = 0; x < 48; x++) assertEquals(base.getPixel(x / 3, y / 3), big.getPixel(x, y));
        }
        Bitmap flip = a.bitmap(s, 0, 3, SpriteAtlas.T_NORMAL, true);
        Bitmap white = a.bitmap(s, 0, 3, SpriteAtlas.T_WHITE, false);
        for (int y = 0; y < 48; y += 5) {
            for (int x = 0; x < 48; x += 5) {
                assertEquals(big.getPixel(x, y), flip.getPixel(47 - x, y));
                int p = big.getPixel(x, y), w = white.getPixel(x, y);
                assertEquals(p >>> 24, w >>> 24);
                if ((p >>> 24) != 0) assertEquals(0xFFFFFF, w & 0xFFFFFF);
            }
        }
    }

    @Test
    public void everySpriteKeyKeepsItsFrameInsideThe16pxSlice() throws Exception {
        SpriteAtlas a = SpriteAtlas.get();
        a.load(path -> new FileInputStream("src/main/assets/" + path));
        for (String k : new String[]{"player", "boss.BOSS_XLDEATH", "pickup.GEM.0", "proj.HOLYBOOK", "tile.FOREST"}) {
            assertNotNull(k, a.find(k));
        }
    }

    /** Every projectile weapon draws something real: a sprite with enough opaque pixels, at a readable scale. */
    @Test
    public void everyProjectileWeaponHasAVisibleSprite() throws Exception {
        SpriteAtlas a = SpriteAtlas.get();
        a.load(path -> new FileInputStream("src/main/assets/" + path));
        for (String k : new String[]{"MAGIC_MISSILE", "HOLY_MISSILE", "KNIFE", "THOUSAND", "AXE", "SCYTHE", "CROSS",
                "HEAVENSWORD", "HOLYBOOK", "VESPERS", "FIREBALL", "HELLFIRE", "HOLYWATER", "BORA"}) {
            SpriteAtlas.Sprite s = a.find("proj." + k);
            assertNotNull("proj." + k, s);
            assertTrue(k + " k=" + s.k, s.k >= 3);
            Bitmap b = a.bitmap(s, 0, s.k, SpriteAtlas.T_NORMAL, false);
            int opaque = 0;
            for (int y = 0; y < b.getHeight(); y++) {
                for (int x = 0; x < b.getWidth(); x++) if ((b.getPixel(x, y) >>> 24) == 255) opaque++;
            }
            assertTrue(k + " opaque pixels " + opaque, opaque >= 60 * s.k * s.k / 3);
        }
        assertTrue("the bible is a book, not the old shield blob", a.find("proj.HOLYBOOK").width() == 12);
    }

    @Test
    public void groundIsDarkenedAndScatteredSparsely() throws Exception {
        SpriteAtlas a = SpriteAtlas.get();
        a.load(path -> new FileInputStream("src/main/assets/" + path));
        for (String stage : new String[]{"FOREST", "LIBRARY"}) {
            SpriteAtlas.Sprite t = a.find("tile." + stage);
            assertNotNull(stage, t);
            assertTrue(stage + " decor " + t.decorChance, t.decorChance <= 0.03f);
            for (float v : t.variantChance) assertTrue(stage + " variant " + v, v <= 0.15f);
        }
        SpriteAtlas.Sprite f = a.find("tile.FOREST");
        assertTrue("flower variant ~3%", f.variantChance[1] <= 0.035f && f.variantChance[0] <= 0.15f);
        Bitmap g = f.base[0];
        long lum = 0;
        for (int y = 0; y < 16; y++) {
            for (int x = 0; x < 16; x++) {
                int p = g.getPixel(x, y);
                lum += (((p >> 16) & 255) * 3 + ((p >> 8) & 255) * 6 + (p & 255)) / 10;
            }
        }
        assertTrue("forest ground is a darker green, mean luminance " + lum / 256, lum / 256 < 135);
    }

    @Test
    public void noSceneryUnderThePlayerSpawn() {
        assertTrue(!WorldRenderer.sceneryAllowed(0, 0));
        assertTrue(!WorldRenderer.sceneryAllowed(100, 50));
        assertTrue(WorldRenderer.sceneryAllowed(200, 0));
    }
}
