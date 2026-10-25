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

import se.felixarvid.thorsurvivors.data.EquipDef;
import se.felixarvid.thorsurvivors.game.BossAi;
import se.felixarvid.thorsurvivors.game.Elites;
import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.game.Entities;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;
import se.felixarvid.thorsurvivors.game.Equipment;
import se.felixarvid.thorsurvivors.game.Input;
import se.felixarvid.thorsurvivors.game.Sim;

/**
 * Design phases 9 and 10 on screen: an elite of each modifier (outline, floor ring, trail, bolts, bombs, adds), equipment
 * crates, the toast, the choice screen and the equipment strip, each boss pattern with its telegraph, The First in its
 * three phases, the boss banner and the health bars. Frames go to $SHOT_DIR (frames8). The asserts check what can be
 * measured: the modifier outline is in the colour of the modifier, telegraphs are red-orange and bright, the rarity
 * frames reach the bottom screen, the banner covers the panel.
 */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 35)
public class Phase9ShotsTest {
    /** A run with no weapons, no wave spawns and a hero that never dies. */
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
            int ph = h.eng.phase;
            if (ph == Engine.PH_LEVELUP || ph == Engine.PH_CHEST) h.eng.input.post(Input.CMD_CONFIRM, 0, 0, 0); // kills level you up
            h.eng.advance(1f / 60f);
        }
    }

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

    /** Pixels within {@code tol} (per channel) of an RGB colour inside a box. */
    private static int near(Bitmap b, int x0, int y0, int x1, int y1, int rgb, int tol) {
        int n = 0, r0 = rgb >> 16 & 255, g0 = rgb >> 8 & 255, b0 = rgb & 255;
        for (int y = Math.max(0, y0); y < Math.min(b.getHeight(), y1); y++) {
            for (int x = Math.max(0, x0); x < Math.min(b.getWidth(), x1); x++) {
                int p = b.getPixel(x, y);
                if (Math.abs((p >> 16 & 255) - r0) <= tol && Math.abs((p >> 8 & 255) - g0) <= tol && Math.abs((p & 255) - b0) <= tol) n++;
            }
        }
        return n;
    }

    private static Bitmap crop(Bitmap b) {
        return Bitmap.createBitmap(b, 480, 270, 960, 540);
    }

    // ------------------------------------------------------------------ elites

    @Test
    public void eliteOfEachModifier() throws Exception {
        int[] mods = {Elites.M_FIRE, Elites.M_FROST, Elites.M_BARRAGE, Elites.M_VOLCANO, Elites.M_RAISER, Elites.M_ARMORED,
                Elites.M_FIRE | Elites.M_BARRAGE | Elites.M_RAISER};
        String[] names = {"firewalker", "frostwalker", "barrage", "volcano", "raiser", "armored", "three"};
        int[] settle = {200, 200, 100, 190, 330, 40, 240}; // frames until the modifier shows itself
        for (int i = 0; i < mods.length; i++) {
            Shots h = new Shots();
            Sim s = scene(h, i % 2 == 0 ? "FLATS" : "MINES", 600 + i);
            s.time = 600;
            Enemy e = s.spawnEliteForTest(i == 2 ? "SERGEANT" : "WELDER", mods[i]);
            assertNotNull(e);
            boolean walker = i < 2 || i == 6;
            e.x = s.px + (walker ? 330 : 180);
            e.y = s.py - 40;
            e.hp = e.maxHp = 1e9f;
            if (!walker) e.speed = 0f;
            e.actT = 1e6f; // the welder does not dash through the picture
            for (int k = 1; k < s.enemyN; k++) s.enemies[k].speed = 0f; // the adds stay where they were raised
            step(h, settle[i]);
            Bitmap f = h.renderTop().copy(Bitmap.Config.ARGB_8888, false);
            Shots.save(f, "elite_" + names[i] + ".png");
            int sx = (int) ((e.x - s.px) * (1080f / Sim.VIEW_H)) + 960, sy = (int) ((e.y - s.py) * (1080f / Sim.VIEW_H)) + 540;
            int mi = Elites.indexOf(mods[i], 0);
            int col = Elites.COLORS[mi] & 0xFFFFFF;
            int outline = near(f, sx - 120, sy - 220, sx + 120, sy + 60, col, 60);
            assertTrue(names[i] + ": the marker in the modifier colour is on the elite: " + outline, outline > 120);
            if (i == 6) Shots.save(h.renderBottom(), "hud_elite_three.png");
            if (i == 0) {
                Bitmap bot = h.renderBottom();
                Shots.save(bot, "hud_elite.png");
                assertTrue("the ELITE tag shows its colour dot on the bottom screen", near(bot, 640, 510, 1210, 620, col, 40) > 30);
            }
        }
    }

    // ------------------------------------------------------------------ equipment

    @Test
    public void equipmentCratesToastChoiceScreenAndStrip() throws Exception {
        Shots h = new Shots();
        Sim s = scene(h, "FLATS", 701);
        // four crates, one of each rarity, on the ground
        String[] keys = {"COMBAT_HELM", "RIOT_SHIELD", "CONDUIT_RING", "CROWN_OF_THE_HIVE"};
        int[] rar = {Equipment.COMMON, Equipment.UNCOMMON, Equipment.RARE, Equipment.UNIQUE};
        for (int i = 0; i < 4; i++) {
            EquipDef d = h.eng.data.equipment.get(keys[i]);
            s.addPickupForTest(Entities.K_EQUIP, s.px - 150 + i * 100, s.py - 120, d.index * 4 + rar[i]);
        }
        step(h, 5);
        Bitmap crates = h.renderTop().copy(Bitmap.Config.ARGB_8888, false);
        Shots.save(crates, "equip_crates.png");
        Shots.save(crop(crates), "equip_crates_crop.png");
        // the frames in the four rarity colours are over the icons
        assertTrue("rare gold frame", near(crates, 700, 200, 1250, 450, 0xFFD84A, 45) > 20);
        assertTrue("unique orange frame", near(crates, 700, 200, 1250, 450, 0xFF8A2A, 45) > 20);

        // pick them up: the first three equip (empty slots), a toast per item, no pause
        s.px = s.px - 150;
        s.py = s.py - 120;
        step(h, 3);
        s.px += 100;
        step(h, 3);
        s.px += 100;
        step(h, 3);
        assertEquals("equipping never pauses", Engine.PH_PLAYING, h.eng.phase);
        Shots.save(h.renderTop(), "equip_toast_top.png");
        // fill the strip with one item per slot at mixed rarities
        s.giveEquipment("HYDRAULIC_KNUCKLES", Equipment.UNCOMMON);
        s.giveEquipment("MAG_BOOTS", Equipment.COMMON);
        s.giveEquipment("ECHO_RELIC", Equipment.RARE);
        step(h, 2);
        Bitmap bot = h.renderBottom().copy(Bitmap.Config.ARGB_8888, false);
        Shots.save(bot, "hud_equipment.png");
        assertTrue("rarity frames on the strip", near(bot, 30, 516, 600, 604, 0xFFD84A, 45) > 40 || near(bot, 30, 516, 600, 604, 0x4FA8FF, 45) > 40);

        // a better item for the Head slot (the helm is Common): the choice screen on the bottom screen, the top dims
        EquipDef lamp = h.eng.data.equipment.get("HEADLAMP");
        s.addPickupForTest(Entities.K_EQUIP, s.px, s.py, lamp.index * 4 + Equipment.RARE);
        step(h, 2);
        assertEquals(Engine.PH_EQUIP, h.eng.phase);
        Bitmap choice = h.renderBottom().copy(Bitmap.Config.ARGB_8888, false);
        Shots.save(choice, "equip_choice_bottom.png");
        Shots.save(h.renderTop(), "equip_choice_top.png");
        assertTrue("green stat difference on the Replace card", near(choice, 640, 560, 1240, 1000, 0x5CF08E, 40) > 60);
        h.eng.input.post(Input.CMD_NAV, Input.LEFT, 0, 0);
        h.eng.advance(1f / 60f);
        Shots.save(h.renderBottom(), "equip_choice_keep_focus.png");
        h.eng.input.post(Input.CMD_CONFIRM, 0, 0, 0);
        h.eng.advance(1f / 60f);
        assertEquals(Engine.PH_PLAYING, h.eng.phase);
    }

    @Test
    public void aHeadlampWidensThePoolOfLight() throws Exception {
        double plain, lit;
        {
            Shots h = new Shots();
            Sim s = scene(h, "MINES", 711);
            step(h, 3);
            Bitmap f = h.renderTop();
            Shots.save(f, "light_plain.png");
            plain = brightShare(f);
        }
        {
            Shots h = new Shots();
            Sim s = scene(h, "MINES", 711);
            s.giveEquipment("HEADLAMP", Equipment.RARE); // +24%
            s.giveEquipment("HEART_OF_LUMEN", Equipment.UNIQUE); // +15% more is in another slot (Neck): both count
            step(h, 3);
            Bitmap f = h.renderTop();
            Shots.save(f, "light_headlamp.png");
            lit = brightShare(f);
        }
        assertTrue("more of the picture is lit with a Headlamp: " + plain + " -> " + lit, lit > plain * 1.15);
    }

    private static double brightShare(Bitmap b) {
        int n = 0, tot = 0;
        for (int y = 0; y < b.getHeight(); y += 6) {
            for (int x = 0; x < b.getWidth(); x += 6) {
                int p = b.getPixel(x, y);
                tot++;
                if ((p >> 16 & 255) + (p >> 8 & 255) + (p & 255) > 150) n++;
            }
        }
        return n / (double) tot;
    }

    // ------------------------------------------------------------------ bosses

    @Test
    public void cargoLoaderChargeAndStomp() throws Exception {
        Shots h = new Shots();
        Sim s = scene(h, "FLATS", 801);
        s.time = 20 * 60;
        Enemy b = s.spawnAt("CARGO_LOADER", s.px + 330, s.py - 10, true);
        b.speed = 0f;
        b.bag = 0b0001;
        b.actT = 0f;
        Bitmap base = h.renderTop().copy(Bitmap.Config.ARGB_8888, false);
        step(h, 40);
        Bitmap charge = h.renderTop().copy(Bitmap.Config.ARGB_8888, false);
        Shots.save(charge, "boss_cargo_charge_line.png");
        assertTrue("the line is red-orange: " + dangerPixels(charge) + " vs " + dangerPixels(base), dangerPixels(charge) > dangerPixels(base) + 800);
        step(h, 40);
        Shots.save(h.renderTop(), "boss_cargo_charge_fills.png");
        // the stomp ring and the crates
        Shots h2 = new Shots();
        Sim s2 = scene(h2, "FLATS", 802);
        s2.time = 20 * 60;
        Enemy c = s2.spawnAt("CARGO_LOADER", s2.px + 140, s2.py - 20, true);
        c.speed = 0f;
        c.bag = 0b0100;
        c.actT = 0f;
        step(h2, 30);
        Bitmap stomp = h2.renderTop().copy(Bitmap.Config.ARGB_8888, false);
        Shots.save(stomp, "boss_cargo_stomp_ring.png");
        assertTrue("the ring: " + dangerPixels(stomp), dangerPixels(stomp) > 400);
        step(h2, 40);
        Shots.save(h2.renderTop(), "boss_cargo_crates_falling.png");
        step(h2, 30);
        Shots.save(h2.renderTop(), "boss_cargo_crates_land.png");
    }

    @Test
    public void slagbornBombsTrailAndEnrage() throws Exception {
        Shots h = new Shots();
        Sim s = scene(h, "FLATS", 811);
        s.time = 20 * 60;
        Enemy b = s.spawnAt("SLAGBORN", s.px + 260, s.py, true);
        b.hp = b.maxHp = 1e8f;
        b.actT = 100f;
        step(h, 240);
        Shots.save(h.renderTop(), "boss_slagborn_trail.png");
        b.actT = 0f;
        step(h, 30);
        Bitmap bombs = h.renderTop().copy(Bitmap.Config.ARGB_8888, false);
        Shots.save(bombs, "boss_slagborn_bombs_falling.png");
        assertTrue("rings: " + dangerPixels(bombs), dangerPixels(bombs) > 500);
        step(h, 50);
        Shots.save(h.renderTop(), "boss_slagborn_pools.png");
        b.hp = b.maxHp * 0.4f;
        step(h, 5);
        b.actT = 0f;
        step(h, 40);
        Shots.save(h.renderTop(), "boss_slagborn_enraged_five_bombs.png");
    }

    @Test
    public void tentaclesWarnRiseAndTheHazardEvent() throws Exception {
        Shots h = new Shots();
        Sim s = scene(h, "MINES", 821);
        s.time = 600;
        s.tentacleWaveForTest(3, 400, true);
        s.tentacleWaveForTest(3, 400, false);
        step(h, 25);
        Bitmap warn = h.renderTop().copy(Bitmap.Config.ARGB_8888, false);
        Shots.save(warn, "tentacles_warning.png");
        assertTrue("warn rings: " + dangerPixels(warn), dangerPixels(warn) > 500);
        step(h, 30);
        Shots.save(h.renderTop(), "tentacles_up.png");
        step(h, 20);
        Shots.save(h.renderTop(), "tentacles_up_late.png");
    }

    @Test
    public void vireSpiralRaiseAndCarriers() throws Exception {
        Shots h = new Shots();
        Sim s = scene(h, "FLATS", 831);
        s.time = 20 * 60;
        s.invuln = 1e6f;
        Enemy v = s.spawnAt("VIRE_AWAKENED", s.px + 200, s.py - 30, true);
        v.hp = v.maxHp = 1e8f;
        v.aiT = 0f;
        boolean raised = false, ring = false;
        for (int i = 0; i < 60 * 14 && !(raised && ring); i++) {
            s.invuln = 1e6f;
            step(h, 1);
            if (!raised && v.ai == 7 && (v.shots & 1) == 0 && v.aiT < 0.1f) {
                Shots.save(h.renderTop(), "boss_vire_raise.png");
                raised = true;
            }
            if (!ring && v.ai == BossAi.BA_SPIRAL && v.cnt >= 8) {
                Shots.save(h.renderTop(), "boss_vire_spiral.png");
                ring = true;
            }
        }
        assertTrue(raised && ring);
        v.hp = v.maxHp * 0.6f;
        step(h, 40);
        Shots.save(h.renderTop(), "boss_vire_carriers.png");
    }

    @Test
    public void foremanCarpetAndPull() throws Exception {
        Shots h = new Shots();
        Sim s = scene(h, "FLATS", 841);
        s.time = 20 * 60;
        Enemy f = s.spawnAt("SMELTER_FOREMAN", s.px + 60, s.py - 30, true);
        f.hp = f.maxHp = 1e8f;
        f.speed = 0f;
        f.actT = 0f;
        step(h, 25);
        Bitmap carpet = h.renderTop().copy(Bitmap.Config.ARGB_8888, false);
        Shots.save(carpet, "boss_foreman_carpet_warning.png");
        assertTrue("five warn rings: " + dangerPixels(carpet), dangerPixels(carpet) > 800);
        step(h, 90);
        Shots.save(h.renderTop(), "boss_foreman_carpet_burning.png");
        Shots h2 = new Shots();
        Sim s2 = scene(h2, "FLATS", 842);
        s2.time = 20 * 60;
        Enemy g = s2.spawnAt("SMELTER_FOREMAN", s2.px + 200, s2.py - 20, true);
        g.hp = g.maxHp = 1e8f;
        g.speed = 0f;
        g.hp = g.maxHp * 0.2f;
        g.actT = 1e6f;
        for (int i = 0; i < 300 && g.ai != BossAi.BA_PULL_TELE; i++) step(h2, 1);
        step(h2, 30);
        Bitmap pull = h2.renderTop().copy(Bitmap.Config.ARGB_8888, false);
        Shots.save(pull, "boss_foreman_pull_warning.png");
        assertTrue("the pull ring: " + dangerPixels(pull), dangerPixels(pull) > 800);
        for (int i = 0; i < 300 && g.ai != BossAi.BA_PULL; i++) step(h2, 1);
        step(h2, 15);
        Shots.save(h2.renderTop(), "boss_foreman_pull.png");
    }

    @Test
    public void theFirstInThreePhasesBannerAndBars() throws Exception {
        Shots h = new Shots();
        Sim s = h.startRun("MINES", "WHIP", 851);
        s.inv.weaponCount = 0;
        s.recomputeAll();
        s.time = 29 * 60 - 0.3;
        s.enemyN = 0;
        s.nextEliteAt = 1e9f;
        s.hp = s.maxHp;
        for (int i = 0; i < 60 && s.bossNow == null; i++) step(h, 1);
        assertNotNull(s.bossNow);
        Enemy b = s.bossNow;
        s.noSpawnsForTest();
        for (int i = s.enemyN - 1; i >= 0; i--) if (s.enemies[i] != b) { s.enemies[i] = s.enemies[s.enemyN - 1]; s.enemyN--; }
        step(h, 20);
        Bitmap banner = h.renderBottom().copy(Bitmap.Config.ARGB_8888, false);
        Shots.save(banner, "boss_banner_first.png");
        Shots.save(h.renderTop(), "boss_first_spawn_top.png");
        assertTrue("the banner is on the panel: a red warning line", near(banner, 0, 300, 1240, 360, 0xFF3B1F, 40) > 400 || near(banner, 0, 300, 1240, 360, 0xC02810, 40) > 400);
        for (int i = 0; i < 140; i++) step(h, 1);
        Bitmap noBanner = h.renderBottom().copy(Bitmap.Config.ARGB_8888, false);
        Shots.save(noBanner, "hud_boss_bar.png");
        b = s.bossNow;
        b.speed = 0f;
        s.px = b.x - 330;
        s.py = b.y;
        // phase 1: ring and a tentacle burst
        for (int i = 0; i < 60 * 6 && s.eprojN < 12; i++) step(h, 1);
        step(h, 6);
        Bitmap p1 = h.renderTop().copy(Bitmap.Config.ARGB_8888, false);
        Shots.save(p1, "first_phase1_ring_tentacles.png");
        assertTrue("bolts: " + dangerPixels(p1), dangerPixels(p1) > 200);
        // phase 2: lanes
        b.hp = b.maxHp * 0.6f;
        for (int i = 0; i < 60 * 2; i++) step(h, 1);
        s.px = b.x - 300;
        s.py = b.y;
        for (int i = 0; i < 60 * 8 && !laneWarning(s); i++) { s.px = b.x - 300; s.py = b.y; step(h, 1); }
        step(h, 10);
        Bitmap lanesWarn = h.renderTop().copy(Bitmap.Config.ARGB_8888, false);
        Shots.save(lanesWarn, "first_phase2_lanes_warning.png");
        assertTrue("the lane warning is red-orange: " + dangerPixels(lanesWarn), dangerPixels(lanesWarn) > 600);
        step(h, 50);
        Shots.save(h.renderTop(), "first_phase2_lanes_sweeping.png");
        step(h, 90);
        Shots.save(h.renderTop(), "first_phase2_lanes_hounds.png");
        // phase 3: the pulse and its safe half
        b.hp = b.maxHp * 0.25f;
        step(h, 60 * 2);
        for (int i = 0; i < 60 * 12 && b.ai != BossAi.BA_PULSE; i++) { s.px = b.x - 120; s.py = b.y; step(h, 1); }
        assertEquals(BossAi.BA_PULSE, b.ai);
        step(h, 40);
        Bitmap pulse = h.renderTop().copy(Bitmap.Config.ARGB_8888, false);
        Shots.save(pulse, "first_phase3_pulse_safe_half.png");
        assertTrue("the unsafe half is washed red: " + dangerPixels(pulse), dangerPixels(pulse) > 1500);
        assertTrue("the safe half has green rings", near(pulse, 0, 0, 1920, 1080, 0x39FF88, 40) > 300);
        Shots.save(h.renderBottom(), "hud_boss_bar_phase3.png");
        // victory
        s.killForTest(b);
        step(h, 5);
        Shots.save(h.renderTop(), "first_dying.png");
    }

    private static boolean laneWarning(Sim s) {
        for (int i = 0; i < s.hazN; i++) if (s.hazards[i].kind == Entities.HZ_LANE) return true;
        return false;
    }

    @Test
    public void bannersOfTheOtherBosses() throws Exception {
        String[] keys = {"CARGO_LOADER", "SLAGBORN", "VIRE_AWAKENED", "SMELTER_FOREMAN"};
        for (String k : keys) {
            Shots h = new Shots();
            Sim s = scene(h, "FLATS", 861);
            s.time = 20 * 60;
            s.bannerT = Sim.BANNER_LIFE - 0.5f;
            s.bannerKey = k;
            s.bannerName = h.eng.data.enemies.get(k).name.toUpperCase(java.util.Locale.ROOT);
            Enemy b = s.spawnAt(k, s.px + 400, s.py, true);
            b.speed = 0f;
            b.hp = b.maxHp * 0.7f;
            Bitmap bot = h.renderBottom().copy(Bitmap.Config.ARGB_8888, false);
            Shots.save(bot, "boss_banner_" + k.toLowerCase() + ".png");
        }
    }
}
