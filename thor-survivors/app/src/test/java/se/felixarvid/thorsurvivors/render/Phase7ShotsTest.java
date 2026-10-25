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

import se.felixarvid.thorsurvivors.game.Entities;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;
import se.felixarvid.thorsurvivors.game.Sim;

/**
 * Design phases 5-7 on screen: each enemy archetype in action (charger telegraph, bolts, carrier fuse and cloud, vire blink,
 * slag pool), the five statuses, both new stages at 2 / 10 / 20 minutes, the ash storm and a barrel chain. Frames go to
 * $SHOT_DIR (frames7); the asserts check the readability rules that can be measured: telegraphs and enemy bolts are
 * red-orange and full bright, Frost tints cyan, the storm darkens the picture.
 */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 35)
public class Phase7ShotsTest {
    /** A run with no weapons but the hero's hammer, no wave spawns and the hero never dying. */
    private Sim scene(Shots h, String stage, long seed) {
        Sim s = h.startRun(stage, "WHIP", seed);
        s.noSpawnsForTest();
        s.enemyN = 0;
        s.inv.weaponCount = 0;
        s.recomputeAll();
        s.hp = s.maxHp;
        return s;
    }

    private void step(Shots h, int frames) {
        Sim s = h.eng.sim;
        for (int i = 0; i < frames; i++) {
            s.hp = s.maxHp;
            h.eng.input.stickX = 0;
            h.eng.input.stickY = 0;
            h.eng.advance(1f / 60f);
        }
    }

    /** Counts pixels near the danger colour #ff3b1f (readable red-orange) in the frame. */
    private static int dangerPixels(Bitmap b) {
        int n = 0;
        for (int y = 0; y < b.getHeight(); y += 2) {
            for (int x = 0; x < b.getWidth(); x += 2) {
                int p = b.getPixel(x, y);
                int r = p >> 16 & 255, g = p >> 8 & 255, bl = p & 255;
                if (r > 215 && g > 30 && g < 110 && bl < 70) n++;
            }
        }
        return n;
    }

    private static int cyanPixels(Bitmap b) {
        int n = 0;
        for (int y = 0; y < b.getHeight(); y += 2) {
            for (int x = 0; x < b.getWidth(); x += 2) {
                int p = b.getPixel(x, y);
                int r = p >> 16 & 255, g = p >> 8 & 255, bl = p & 255;
                if (bl > 150 && g > 110 && r < g - 25 && bl > r + 40) n++;
            }
        }
        return n;
    }

    private static double meanLum(Bitmap b) {
        double sum = 0;
        int n = 0;
        for (int y = 0; y < b.getHeight(); y += 8) {
            for (int x = 0; x < b.getWidth(); x += 8) {
                int p = b.getPixel(x, y);
                sum += (p >> 16 & 255) * 0.3 + (p >> 8 & 255) * 0.59 + (p & 255) * 0.11;
                n++;
            }
        }
        return sum / n;
    }

    @Test
    public void chargerTelegraphAndDash() throws Exception {
        Shots h = new Shots();
        Sim s = scene(h, "FLATS", 21);
        Enemy w = s.spawnAt("WELDER", 140, -10, false);
        w.actT = 0f;
        Bitmap base = h.renderTop().copy(Bitmap.Config.ARGB_8888, false);
        for (int i = 0; i < 120 && w.tele <= 0f; i++) step(h, 1);
        step(h, 12);
        assertTrue("telegraphing", w.tele > 0f);
        Bitmap tele = h.renderTop();
        assertTrue("the line is red-orange and bright: " + dangerPixels(tele) + " vs " + dangerPixels(base), dangerPixels(tele) > dangerPixels(base) + 400);
        Shots.save(tele, "tele_welder_line.png");
        for (int i = 0; i < 90 && w.clip != Entities.CL_RUN; i++) step(h, 1);
        step(h, 6);
        Shots.save(h.renderTop(), "tele_welder_dash.png");
        // a cargo loader (boss) winds up for a full second on a wider line
        Shots h2 = new Shots();
        Sim s2 = scene(h2, "FLATS", 22);
        Enemy cl = s2.spawnAt("CARGO_LOADER", 260, 20, true);
        cl.actT = 0f;
        for (int i = 0; i < 120 && cl.tele <= 0f; i++) step(h2, 1);
        step(h2, 30);
        Shots.save(h2.renderTop(), "tele_cargo_loader.png");
    }

    @Test
    public void sergeantsAndDronesShootRedBolts() throws Exception {
        Shots h = new Shots();
        Sim s = scene(h, "FLATS", 23);
        s.spawnAt("SERGEANT", 125, -40, false).actT = 0f;
        s.spawnAt("SERGEANT", -120, 50, false).actT = 0f;
        s.spawnAt("SECURITY_DRONE", 30, -150, false).actT = 0f;
        s.spawnAt("SECURITY_DRONE", -150, -80, false).actT = 0f;
        Bitmap best = null;
        int most = 0;
        for (int i = 0; i < 180; i++) {
            step(h, 1);
            if (s.eprojN > most) {
                most = s.eprojN;
                Shots.save(h.renderTop(), "shots_bolts.png");
            }
        }
        assertTrue("bolts in flight at once: " + most, most >= 2);
        // make sure a frame with bolts really shows red-orange cores
        s.shootForTest(s.px + 90, s.py - 20, 0, 0, 1f, 5f);
        s.shootForTest(s.px - 60, s.py + 60, 0, 0, 1f, 5f);
        step(h, 1);
        Bitmap f = h.renderTop();
        assertTrue("bolt cores: " + dangerPixels(f), dangerPixels(f) > 300);
        Shots.save(f, "shots_bolts_static.png");
    }

    @Test
    public void carrierFuseAndCloud() throws Exception {
        Shots h = new Shots();
        Sim s = scene(h, "FLATS", 24);
        Enemy c = s.spawnAt("SPORE_CARRIER", 36, 6, false);
        c.speed = 0f;
        s.spawnAt("COLONIST", 110, -30, false).speed = 0f;
        s.spawnAt("COLONIST", -90, 40, false).speed = 0f;
        for (int i = 0; i < 20 && c.tele <= 0f; i++) step(h, 1);
        step(h, 3);
        Shots.save(h.renderTop(), "carrier_fuse.png");
        for (int i = 0; i < 60 && s.hazN == 0; i++) step(h, 1);
        step(h, 6);
        assertEquals(1, s.hazN);
        Shots.save(h.renderTop(), "carrier_burst.png");
        step(h, 70);
        Shots.save(h.renderTop(), "carrier_cloud.png");
    }

    @Test
    public void vireBlinkAndSmelterPool() throws Exception {
        Shots h = new Shots();
        Sim s = scene(h, "MINES", 25);
        Enemy v = s.spawnAt("VIRE", 140, -20, false);
        v.hp = v.maxHp = 1e6f;
        v.aiT = 0f;
        for (int i = 0; i < 60 && v.ai != 3; i++) step(h, 1);
        step(h, 3);
        Shots.save(h.renderTop(), "vire_blink_out.png");
        for (int i = 0; i < 60 && v.ai != 8; i++) step(h, 1);
        step(h, 4);
        Shots.save(h.renderTop(), "vire_blink_in.png");
        for (int i = 0; i < 200 && s.eprojN == 0; i++) step(h, 1); // raise, then ring
        v.shots = 1; // next cast is the ring
        v.aiT = 0f;
        for (int i = 0; i < 400 && s.eprojN < 6; i++) step(h, 1);
        Shots.save(h.renderTop(), "vire_ring.png");

        Shots h2 = new Shots();
        Sim s2 = scene(h2, "FLATS", 26);
        Enemy sm = s2.spawnAt("SMELTER", 150, -30, false);
        sm.hp = sm.maxHp = 1e6f;
        sm.speed = 0f;
        sm.actT = 0f;
        step(h2, 12);
        Bitmap warn = h2.renderTop();
        assertTrue("the warning ring is red-orange: " + dangerPixels(warn), dangerPixels(warn) > 250);
        Shots.save(warn, "smelter_warn.png");
        step(h2, 50);
        Shots.save(h2.renderTop(), "smelter_pool.png");
        // Slagborn's trail
        Shots h3 = new Shots();
        Sim s3 = scene(h3, "FLATS", 27);
        Enemy sb = s3.spawnAt("SLAGBORN", 280, 0, true);
        sb.hp = sb.maxHp = 1e8f;
        for (int i = 0; i < 6 * 60; i++) step(h3, 1);
        Shots.save(h3.renderTop(), "slagborn_trail.png");
    }

    @Test
    public void houndPack() throws Exception {
        Shots h = new Shots();
        Sim s = scene(h, "MINES", 28);
        s.spawnAt("SPORE_HOUND", 260, -60, false);
        s.spawnAt("SPORE_HOUND", 280, -30, false);
        s.spawnAt("SPORE_HOUND", 270, 0, false);
        s.spawnAt("SPORE_HOUND", 290, 30, false);
        step(h, 70);
        Shots.save(h.renderTop(), "hound_pack.png");
    }

    @Test
    public void statusesOnScreen() throws Exception {
        Shots h = new Shots();
        Sim s = scene(h, "FLATS", 29);
        String[] names = {"burn", "frost", "freeze", "electrify", "decay", "stun"};
        float[][] pos = {{-170, -60}, {-100, 60}, {-20, -110}, {60, 70}, {130, -50}, {190, 40}};
        Enemy[] e = new Enemy[6];
        for (int i = 0; i < 6; i++) {
            e[i] = s.spawnAt(i == 3 ? "SERGEANT" : i == 5 ? "WELDER" : "COLONIST", s.px + pos[i][0], s.py + pos[i][1], false);
            e[i].speed = 0f;
            e[i].hp = e[i].maxHp = 100000f;
            e[i].actT = 1e6f;
        }
        s.applyStatus(e[0], Entities.ST_BURN, 5, 120f, 0f);
        s.applyStatus(e[1], Entities.ST_FROST, 5, 20f, 0f);
        s.applyStatus(e[2], Entities.ST_FROST, 8, 20f, 0f);
        s.applyStatus(e[3], Entities.ST_ELECTRIFY, 4, 120f, 0f);
        s.applyStatus(e[4], Entities.ST_DECAY, 6, 200f, 0f);
        s.stun(e[5], 0.9f);
        step(h, 25);
        s.stun(e[5], 0.9f);
        Bitmap frame = h.renderTop();
        Shots.save(frame, "statuses_all.png");
        assertTrue("Frost tints cyan: " + cyanPixels(frame), cyanPixels(frame) > 60);
        // the numbers: coloured status damage texts exist
        int coloured = 0;
        for (int i = 0; i < Sim.MAX_TEXT; i++) if (s.texts[i].life > 0 && s.texts[i].color != 0) coloured++;
        assertTrue("coloured numbers " + coloured, coloured >= 2);
        for (int i = 0; i < 6; i++) {
            Shots h2 = new Shots();
            Sim t = scene(h2, "FLATS", 30 + i);
            Enemy a = t.spawnAt("COLONIST", t.px + 70, t.py - 20, false);
            Enemy b = t.spawnAt("COLONIST", t.px - 60, t.py + 10, false);
            a.speed = b.speed = 0f;
            a.hp = a.maxHp = b.hp = b.maxHp = 100000f;
            int[] kinds = {Entities.ST_BURN, Entities.ST_FROST, Entities.ST_FROST, Entities.ST_ELECTRIFY, Entities.ST_DECAY, 0};
            int[] stacks = {6, 5, 8, 4, 8, 0};
            if (i == 5) t.stun(a, 1f);
            else t.applyStatus(a, kinds[i], stacks[i], 150f, 0f);
            step(h2, 20);
            if (i == 5) t.stun(a, 1f);
            Shots.save(h2.renderTop(), "status_" + names[i] + ".png");
        }
    }

    @Test
    public void stageFightsAtTwoTenAndTwentyMinutes() throws Exception {
        for (String stage : new String[]{"FLATS", "MINES"}) {
            for (int minute : new int[]{2, 10, 20}) {
                Shots h = new Shots();
                Sim s = h.startRun(stage, "WHIP", 40 + minute, "MAGIC_MISSILE", "GARLIC", "KNIFE");
                s.time = minute * 60 - 12;
                h.drive(26, true);
                s = h.eng.sim;
                Bitmap f = h.renderTop();
                assertTrue(s.enemyN > 5);
                Shots.save(f, "fight_" + stage.toLowerCase() + "_" + minute + "min.png");
            }
        }
    }

    @Test
    public void ashStorm() throws Exception {
        // the same empty scene calm and in the storm: the light pool is 40% smaller and dust hangs in the air
        Shots calm = new Shots();
        Sim s = scene(calm, "FLATS", 51);
        s.time = 12 * 60 - 30;
        step(calm, 3);
        Bitmap c0 = calm.renderTop().copy(Bitmap.Config.ARGB_8888, false);
        Shots.save(c0, "ash_calm.png");
        s.time = 12 * 60 + 8;
        step(calm, 3);
        assertTrue("storm at " + s.time, s.ashStorm());
        Bitmap storm = calm.renderTop();
        Shots.save(storm, "ash_storm.png");
        s.time = 12 * 60 + 1;
        step(calm, 3);
        Shots.save(calm.renderTop(), "ash_storm_banner.png");
        assertTrue("the storm is darker around the hero: " + meanLumCentre(c0) + " vs " + meanLumCentre(storm), meanLumCentre(storm) < meanLumCentre(c0) * 0.97);
        // and a fight in it
        Shots h = new Shots();
        Sim f = h.startRun("FLATS", "WHIP", 52, "GARLIC", "MAGIC_MISSILE");
        f.time = 12 * 60 - 12;
        h.drive(24, true);
        Shots.save(h.renderTop(), "ash_storm_fight.png");
    }

    private static double meanLumCentre(Bitmap b) {
        double sum = 0;
        int n = 0;
        for (int y = b.getHeight() / 2 - 330; y < b.getHeight() / 2 + 330; y += 6) {
            for (int x = b.getWidth() / 2 - 330; x < b.getWidth() / 2 + 330; x += 6) {
                int p = b.getPixel(x, y);
                sum += (p >> 16 & 255) * 0.3 + (p >> 8 & 255) * 0.59 + (p & 255) * 0.11;
                n++;
            }
        }
        return sum / n;
    }

    @Test
    public void barrelChain() throws Exception {
        Shots h = new Shots();
        Sim s = scene(h, "FLATS", 61);
        s.destN = 0;
        float[][] b = {{60, -30}, {130, -40}, {185, -20}, {235, -10}, {150, 40}};
        for (float[] p : b) {
            s.destX[s.destN] = s.px + p[0];
            s.destY[s.destN] = s.py + p[1];
            s.destKind[s.destN++] = (byte) Sim.DK_BARREL;
        }
        s.destX[s.destN] = s.px + 30;
        s.destY[s.destN] = s.py + 35;
        s.destKind[s.destN++] = (byte) Sim.DK_CHEST;
        for (int i = 0; i < 6; i++) {
            Enemy e = s.spawnAt("COLONIST", s.px + 100 + i * 25, s.py + (i % 2 == 0 ? 70 : -80), false);
            e.speed = 0f;
        }
        step(h, 2);
        Shots.save(h.renderTop(), "barrels_0_before.png");
        s.rebuildGridForTest();
        s.hp = s.maxHp;
        s.px -= 0;
        // set the first one off (the hammer, an arrow, a welder: anything)
        s.hitDestForTest(s.px + 60, s.py - 30, 4);
        float hpAfterBlast = s.hp;
        float hpBefore = s.maxHp;
        step(h, 4);
        Shots.save(h.renderTop(), "barrels_1_blast.png");
        step(h, 12);
        Shots.save(h.renderTop(), "barrels_2_after.png");
        assertEquals("all five barrels and the chest went", 0, s.destN);
        assertTrue(s.kills >= 1);
        assertTrue("the hero was in the first blast", hpAfterBlast < hpBefore);
    }

    @Test
    public void chestAndPylonProps() throws Exception {
        Shots h = new Shots();
        Sim s = scene(h, "MINES", 62);
        s.destN = 0;
        float[][] p = {{-120, -30, Sim.DK_BARREL}, {-40, 20, Sim.DK_CHEST}, {60, -10, Sim.DK_PYLON}, {150, 30, Sim.DK_BARREL}};
        for (float[] q : p) {
            s.destX[s.destN] = s.px + q[0];
            s.destY[s.destN] = s.py + q[1];
            s.destKind[s.destN++] = (byte) q[2];
        }
        step(h, 3);
        Bitmap f = h.renderTop();
        assertNotNull(f);
        Shots.save(f, "props_barrel_chest_pylon.png");
    }
}
