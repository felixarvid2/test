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

import se.felixarvid.thorsurvivors.game.WorldGen;
import se.felixarvid.thorsurvivors.render.SpriteAtlas.Clip;
import se.felixarvid.thorsurvivors.render.SpriteAtlas.Img;
import se.felixarvid.thorsurvivors.render.SpriteAtlas.Model;

import java.io.FileInputStream;

/** The decoded Ashfall art: every model frame and image rectangle lies inside its bitmap, and the direction maths is right. */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 35)
public class AtlasBitmapTest {
    private SpriteAtlas load() {
        SpriteAtlas a = SpriteAtlas.get();
        a.load(path -> new FileInputStream("src/main/assets/" + path));
        assertTrue(a.isLoaded());
        return a;
    }

    @Test
    public void modelFramesAreInsideTheirSheets() {
        SpriteAtlas a = load();
        assertTrue("13 models: " + a.modelNames(), a.modelNames().size() >= 13);
        for (String name : a.modelNames()) {
            Model m = a.model(name);
            assertNotNull(m.sheet);
            int clips = 0;
            for (Clip c : m.clips) {
                if (c == null) continue;
                clips++;
                assertEquals(8 * c.count * 6, c.r.length);
                int nonEmpty = 0;
                for (int i = 0; i < 8 * c.count; i++) {
                    int w = c.r[i * 6 + 2], h = c.r[i * 6 + 3];
                    if (w == 0) continue;
                    nonEmpty++;
                    int x = c.r[i * 6], y = c.r[i * 6 + 1];
                    assertTrue(name + " frame " + i, x >= 0 && y >= 0 && x + w <= m.sheet.getWidth() && y + h <= m.sheet.getHeight());
                }
                assertTrue(name + " has frames", nonEmpty > 0);
            }
            assertTrue(name, clips >= 1);
            assertTrue(name + " head " + m.headPx, m.headPx > 20);
        }
        Model b = a.model("bastion");
        for (int id : new int[]{SpriteAtlas.C_IDLE, SpriteAtlas.C_WALK, SpriteAtlas.C_ATTACK, SpriteAtlas.C_HIT, SpriteAtlas.C_DEATH}) {
            assertNotNull("bastion clip " + id, b.clip(id));
        }
    }

    /** A colonist is about 70-80 px tall at 1080p (design: re-pick the scale so the human reads at that size). */
    @Test
    public void aHumanIsSeventyToEightyPixelsTall() {
        SpriteAtlas a = load();
        int h = a.model("infected_colonist").headPx;
        assertTrue("colonist height " + h, h >= 70 && h <= 84);
        int p = a.model("bastion").headPx;
        assertTrue("bastion height " + p, p >= 70 && p <= 100);
    }

    @Test
    public void imagesAreInsideTheirAtlasesAndEverythingTheWorldNeedsExists() {
        SpriteAtlas a = load();
        for (String key : a.imageKeys()) {
            Img i = a.img(key);
            assertTrue(key, i.src.left >= 0 && i.src.top >= 0 && i.src.right <= i.sheet.getWidth() && i.src.bottom <= i.sheet.getHeight());
            assertTrue(key, i.w() > 0 && i.h() > 0);
        }
        for (String p : WorldGen.PROP) assertNotNull("prop." + p, a.img("prop." + p));
        for (String d : WorldGen.DECAL) assertNotNull("decal." + d, a.img("decal." + d));
        for (String k : new String[]{"gem.crystal_lumen", "gem.crystal_void", "gem.crystal_ember", "pix.coin", "pix.bag", "pix.roast",
                "pix.vacuum", "pix.orologion", "pix.rosary", "pix.clover", "pix.grenade", "pix.flask", "prop.supply_chest",
                "prop.explosive_barrel", "prop.scalpel_blade"}) {
            assertNotNull(k, a.img(k));
        }
        for (String v : new String[]{"slash_0", "slash_1", "plasma_bolt_0", "energy_glow_0", "energy_glow_1", "hit_spark_0",
                "hit_spark_1", "explosion_0", "explosion_2", "explosion_3", "fire_core_0", "fire_core_1", "flame_0", "flame_3",
                "blink_0", "hex_shield_0", "wisp_0", "energy_ring", "spore_cloud_0", "spore_cloud_2", "spores_0", "heal_0",
                "toxic_splat_0", "bubbles_0", "lightning_0", "lightning_1", "electric_ball", "blood_burst", "ichor_burst",
                "rock_debris", "embers_1", "smoke_0"}) {
            assertNotNull("vfx." + v, a.img("vfx." + v));
        }
        assertNotNull(a.groundTexture());
        assertEquals(512, a.groundTexture().getWidth());
    }

    @Test
    public void directionIndexFollowsTheBakeOrder() {
        // S, SE, E, NE, N, NW, W, SW; screen y points down, S faces the camera
        assertEquals(0, WorldRenderer.dirOf(0, 1));
        assertEquals(1, WorldRenderer.dirOf(1, 1));
        assertEquals(2, WorldRenderer.dirOf(1, 0));
        assertEquals(3, WorldRenderer.dirOf(1, -1));
        assertEquals(4, WorldRenderer.dirOf(0, -1));
        assertEquals(5, WorldRenderer.dirOf(-1, -1));
        assertEquals(6, WorldRenderer.dirOf(-1, 0));
        assertEquals(7, WorldRenderer.dirOf(-1, 1));
        assertEquals(2, WorldRenderer.dirOf(1, 0.2f)); // nearest of the eight
    }
}
