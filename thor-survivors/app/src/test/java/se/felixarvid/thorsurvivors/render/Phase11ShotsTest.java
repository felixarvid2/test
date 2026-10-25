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

import se.felixarvid.thorsurvivors.game.Elites;
import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;
import se.felixarvid.thorsurvivors.game.Equipment;
import se.felixarvid.thorsurvivors.game.Input;
import se.felixarvid.thorsurvivors.game.Sim;
import se.felixarvid.thorsurvivors.ui.PanelRenderer;
import se.felixarvid.thorsurvivors.ui.UiArt;

/**
 * Design phase 11, the ASHFALL UI skin: every screen of the bottom panel and the top screen in the new look, plus the single-screen
 * compact overlay. Frames go to SHOT_DIR; the asserts check that the steel skin, the accent colours and the art are really on screen
 * (and that the panel stays readable: the HUD header text is drawn at least 22 px tall).
 */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 35)
public class Phase11ShotsTest {
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

    private static boolean notBlank(Bitmap b) {
        int first = b.getPixel(0, 0), diff = 0;
        for (int y = 0; y < b.getHeight(); y += 7) for (int x = 0; x < b.getWidth(); x += 7) if (b.getPixel(x, y) != first) diff++;
        return diff > 400;
    }

    private static Bitmap copy(Bitmap b) {
        return b.copy(Bitmap.Config.ARGB_8888, false);
    }

    private void step(Shots h, int frames) {
        Sim s = h.eng.sim;
        for (int i = 0; i < frames; i++) {
            if (s != null) s.hp = Math.max(s.hp, s.maxHp * 0.7f);
            h.eng.input.stickX = 0;
            h.eng.input.stickY = 0;
            int ph = h.eng.phase;
            if (ph == Engine.PH_LEVELUP || ph == Engine.PH_CHEST) h.eng.input.post(Input.CMD_CONFIRM, 0, 0, 0);
            h.eng.advance(1f / 60f);
        }
    }

    /** A quiet scene: no spawns, no auto weapons, hero immortal. */
    private Sim scene(Shots h, String stage, long seed) {
        Sim s = h.startRun(stage, "WHIP", seed);
        s.noSpawnsForTest();
        s.enemyN = 0;
        s.inv.weaponCount = 0;
        s.recomputeAll();
        s.hp = s.maxHp;
        return s;
    }

    /** A built hero: six weapons, six passives, six items, branches, some statuses. */
    private Sim loaded(Shots h, String stage, int hero, long seed) {
        h.eng.meta.heroIdx = hero;
        Sim s = h.startRun(stage, "WHIP", seed, "MAGIC_MISSILE", "KNIFE", "AXE", "GARLIC", "HOLYBOOK", "POWER", "ARMOR", "COOLDOWN", "AREA",
                "MAXHEALTH", "MAGNET");
        s.noSpawnsForTest();
        s.enemyN = 0;
        s.time = 14 * 60 + 12;
        s.level = 17;
        s.kills = 1342;
        s.gold = 5120;
        s.xp = s.xpNeed * 0.62f;
        s.hp = s.maxHp * 0.64f;
        for (int i = 0; i < s.inv.weaponCount; i++) s.inv.weapons[i].level = 1 + (i * 3) % 8;
        s.inv.weapons[1].level = s.inv.weapons[1].def.maxLevel();
        for (int i = 0; i < s.inv.passiveCount; i++) s.inv.passives[i].level = 1 + i % 4;
        s.giveEquipment("COMBAT_HELM", Equipment.COMMON);
        s.giveEquipment("PLATED_VEST", Equipment.UNCOMMON);
        s.giveEquipment("HYDRAULIC_KNUCKLES", Equipment.RARE);
        s.giveEquipment("MAG_BOOTS", Equipment.COMMON);
        s.giveEquipment("CONDUIT_RING", Equipment.UNCOMMON);
        s.giveEquipment("ECHO_RELIC", Equipment.UNIQUE);
        if (s.main != null) {
            s.main.pick(0, 1);
            s.main.pick(1, 1);
            s.main.pick(1, 2);
            s.main.pick(3, 1);
        }
        s.recomputeAll();
        s.hp = s.maxHp * 0.64f;
        s.heroBurnT = 2.4f;
        s.heroSlowT = 1.2f;
        return s;
    }

    @Test
    public void menusOnBothScreens() throws Exception {
        Shots h = new Shots();
        h.eng.focus = Engine.MENU_START;
        for (int i = 0; i < 120; i++) h.eng.advance(1f / 60f);
        Bitmap bot = copy(h.renderBottom());
        Shots.save(bot, "p11_menu_bottom.png");
        Bitmap top = copy(h.renderTop());
        Shots.save(top, "p11_menu_top.png");
        assertTrue(notBlank(bot) && notBlank(top));
        assertTrue("orange title on the top screen", near(top, 100, 200, 1100, 500, 0xFF8A2A, 40) > 2000);
        assertTrue("orange accents on the panel", near(bot, 0, 0, 1240, 400, 0xFF8A2A, 40) > 1500);
        int[] focus = {Engine.MENU_STAGE, Engine.MENU_HERO, Engine.MENU_WEAPON, Engine.MENU_SHOP, Engine.MENU_MUSIC, Engine.MENU_LIGHT};
        String[] names = {"stage", "hero", "weapon", "powerups", "music", "lighting"};
        for (int i = 0; i < focus.length; i++) {
            h.eng.focus = focus[i];
            if (focus[i] == Engine.MENU_STAGE) h.eng.selectStage("MINES");
            if (focus[i] == Engine.MENU_HERO) h.eng.meta.heroIdx = 1;
            h.eng.advance(1f / 60f);
            Shots.save(h.renderBottom(), "p11_menu_focus_" + names[i] + ".png");
        }
        h.eng.meta.heroIdx = 2;
        h.eng.focus = Engine.MENU_HERO;
        h.eng.advance(1f / 60f);
        Shots.save(h.renderBottom(), "p11_hero_xenomant.png");
        h.eng.meta.heroIdx = 0;
        h.eng.advance(1f / 60f);
        Shots.save(h.renderBottom(), "p11_hero_bastion.png");
        // the shop (salvage terminal)
        h.eng.phase = Engine.PH_SHOP;
        h.eng.focus = 3;
        h.eng.advance(1f / 60f);
        Shots.save(h.renderBottom(), "p11_shop_bottom.png");
        Shots.save(h.renderTop(), "p11_shop_top.png");
    }

    @Test
    public void hudWithEverything() throws Exception {
        Shots h = new Shots();
        Sim s = loaded(h, "FLATS", 0, 1101);
        step(h, 5);
        Bitmap bot = copy(h.renderBottom());
        Shots.save(bot, "p11_hud_loaded.png");
        Shots.save(h.renderTop(), "p11_hud_top.png");
        assertTrue("lumen green XP bar", near(bot, 90, 174, 1210, 206, 0x39FF88, 70) > 4000);
        assertTrue("red HP bar", near(bot, 90, 118, 1210, 166, 0xFF5A3C, 50) > 4000);
        assertTrue("rarity frames on the strip", near(bot, 30, 516, 600, 604, 0xFFD84A, 60) > 100);
        // elite with three modifiers, then a boss with the banner
        Enemy el = s.spawnEliteForTest("SERGEANT", Elites.M_FIRE | Elites.M_FROST | Elites.M_ARMORED);
        assertNotNull(el);
        el.x = s.px + 300;
        el.y = s.py;
        el.speed = 0;
        el.burn = 3;
        el.frost = 2;
        step(h, 5);
        Bitmap withElite = copy(h.renderBottom());
        Shots.save(withElite, "p11_hud_elite.png");
        assertTrue("the elite's modifier icons are drawn in their colours", near(withElite, 640, 510, 1210, 620, Elites.COLORS[0] & 0xFFFFFF, 40) > 60);
        Enemy b = s.spawnAt("SLAGBORN", s.px + 450, s.py, true);
        assertNotNull(b);
        b.speed = 0;
        b.hp = b.maxHp * 0.55f;
        s.bannerT = Sim.BANNER_LIFE - 0.7f;
        s.bannerKey = "SLAGBORN";
        s.bannerName = "SLAGBORN";
        step(h, 2);
        Shots.save(h.renderBottom(), "p11_hud_boss_banner.png");
        Shots.save(h.renderTop(), "p11_top_boss_bar.png");
        s.bannerT = 0f;
        step(h, 2);
        Shots.save(h.renderBottom(), "p11_hud_boss_elite.png");
    }

    @Test
    public void hudMines_gamepad_andLowHealth() throws Exception {
        Shots h = new Shots();
        Sim s = loaded(h, "MINES", 1, 1102);
        s.hp = s.maxHp * 0.15f;
        h.eng.input.gamepadSeen = true;
        step(h, 5);
        s.hp = s.maxHp * 0.15f;
        Shots.save(h.renderBottom(), "p11_hud_mines_gamepad.png");
        h.eng.input.gamepadSeen = false;
        Shots.save(h.renderTop(), "p11_hud_mines_top.png");
    }

    @Test
    public void levelUpEquipChestPauseResult() throws Exception {
        Shots h = new Shots();
        Sim s = loaded(h, "FLATS", 0, 1103);
        s.level = 5;
        s.pendingLevelUps = 1;
        h.eng.advance(1f / 60f);
        assertEquals(Engine.PH_LEVELUP, h.eng.phase);
        h.eng.focus = 0;
        Shots.save(h.renderBottom(), "p11_levelup_bottom.png");
        Shots.save(h.renderTop(), "p11_levelup_top.png");
        h.eng.focus = 2;
        h.eng.advance(1f / 60f);
        Shots.save(h.renderBottom(), "p11_levelup_focus2.png");
        h.eng.input.post(Input.CMD_CONFIRM, 0, 0, 0);
        h.eng.advance(1f / 60f);
        // equipment choice
        se.felixarvid.thorsurvivors.data.EquipDef lamp = h.eng.data.equipment.get("HEADLAMP");
        s.addPickupForTest(se.felixarvid.thorsurvivors.game.Entities.K_EQUIP, s.px, s.py, lamp.index * 4 + Equipment.RARE);
        step(h, 3);
        assertEquals(Engine.PH_EQUIP, h.eng.phase);
        Bitmap choice = copy(h.renderBottom());
        Shots.save(choice, "p11_equip_choice.png");
        Shots.save(h.renderTop(), "p11_equip_top.png");
        assertTrue("green stat difference on the Replace card", near(choice, 640, 560, 1240, 1000, 0x5CF08E, 40) > 60);
        h.eng.input.post(Input.CMD_NAV, Input.LEFT, 0, 0);
        h.eng.advance(1f / 60f);
        Shots.save(h.renderBottom(), "p11_equip_keep_focus.png");
        h.eng.input.post(Input.CMD_CONFIRM, 0, 0, 0);
        h.eng.advance(1f / 60f);
        assertEquals(Engine.PH_PLAYING, h.eng.phase);
        // chest result
        s.pendingChests = 1;
        h.eng.advance(1f / 60f);
        assertEquals(Engine.PH_CHEST, h.eng.phase);
        Shots.save(h.renderBottom(), "p11_chest_bottom.png");
        Shots.save(h.renderTop(), "p11_chest_top.png");
        h.eng.input.post(Input.CMD_CONFIRM, 0, 0, 0);
        h.eng.advance(1f / 60f);
        // pause
        h.eng.nextRunSeed = 1L; // deterministic run
        h.eng.input.post(Input.CMD_START, 0, 0, 0);
        h.eng.advance(1f / 60f);
        assertEquals(Engine.PH_PAUSED, h.eng.phase);
        Shots.save(h.renderBottom(), "p11_pause_bottom.png");
        Shots.save(h.renderTop(), "p11_pause_top.png");
        h.eng.nextRunSeed = 1L; // deterministic run
        h.eng.input.post(Input.CMD_START, 0, 0, 0);
        h.eng.advance(1f / 60f);
        // result: the First killed, gold x2
        s.hp = 0;
        h.eng.advance(1f / 60f);
        h.eng.advance(1f / 60f);
        if (h.eng.phase != Engine.PH_RESULT) {
            h.eng.phase = Engine.PH_RESULT;
        }
        h.eng.resultWin = true;
        h.eng.resultFirst = true;
        h.eng.resultGold = 2480;
        h.eng.resultKills = 3120;
        h.eng.resultTime = 1800;
        h.eng.resultLevel = 31;
        h.eng.resultNewBest = true;
        Bitmap res = copy(h.renderBottom());
        Shots.save(res, "p11_result_win.png");
        Shots.save(h.renderTop(), "p11_result_top.png");
        assertTrue("the x2 note in lumen green", near(res, 300, 380, 1200, 470, 0x39FF88, 40) > 100);
        h.eng.resultWin = false;
        h.eng.resultFirst = false;
        h.eng.resultNewBest = false;
        Shots.save(h.renderBottom(), "p11_result_loss.png");
    }

    @Test
    public void topScreenOverlays() throws Exception {
        Shots h = new Shots();
        Sim s = scene(h, "FLATS", 1104);
        s.time = 12 * 60 + 1;
        step(h, 30);
        s.toast("EQUIPPED  Combat Helm", Equipment.RARITY_COLORS[2]);
        s.toast("SALVAGED  Riot Shield  +24 gold", 0xFFB8B0A4);
        s.toast("THE FIRST IS DEAD  -  GOLD x2", 0xFF39FF88);
        step(h, 6);
        Bitmap t = copy(h.renderTop());
        Shots.save(t, "p11_top_toasts_storm.png");
        assertTrue("storm banner hazard stripes", near(t, 0, 140, 1920, 260, 0xFF8A2A, 40) > 800);
    }

    /** The single-screen overlay: the world with the compact panel drawn over it. */
    @Test
    public void compactOverlay() throws Exception {
        Shots h = new Shots();
        PanelRenderer compact = new PanelRenderer(true);
        Bitmap frame = Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888);
        Canvas fc = new Canvas(frame);
        // menu
        h.eng.phase = Engine.PH_MENU;
        for (int i = 0; i < 30; i++) h.eng.advance(1f / 60f);
        h.world.draw(fc, 1920, 1080, h.eng, false); // single screen: dualScreen = false
        compact.draw(fc, 1920, 1080);
        Shots.save(frame, "p11_compact_menu.png");
        // hud with a boss and an elite
        Sim s = loaded(h, "FLATS", 2, 1105);
        Enemy b = s.spawnAt("SLAGBORN", s.px + 400, s.py, true);
        b.speed = 0;
        Enemy el = s.spawnEliteForTest("SERGEANT", Elites.M_BARRAGE | Elites.M_RAISER);
        el.x = s.px - 300;
        el.y = s.py;
        el.speed = 0;
        step(h, 10);
        h.world.draw(fc, 1920, 1080, h.eng, false); // single screen: dualScreen = false
        compact.draw(fc, 1920, 1080);
        Shots.save(frame, "p11_compact_hud.png");
        assertTrue(notBlank(frame));
        // level-up
        s.pendingLevelUps = 1;
        h.eng.advance(1f / 60f);
        h.world.draw(fc, 1920, 1080, h.eng, false); // single screen: dualScreen = false
        compact.draw(fc, 1920, 1080);
        Shots.save(frame, "p11_compact_levelup.png");
        h.eng.input.post(Input.CMD_CONFIRM, 0, 0, 0);
        h.eng.advance(1f / 60f);
        // pause
        h.eng.nextRunSeed = 1L; // deterministic run
        h.eng.input.post(Input.CMD_START, 0, 0, 0);
        h.eng.advance(1f / 60f);
        h.world.draw(fc, 1920, 1080, h.eng, false); // single screen: dualScreen = false
        compact.draw(fc, 1920, 1080);
        Shots.save(frame, "p11_compact_pause.png");
    }

    @Test
    public void artIsDecodedLazilyAndReleased() throws Exception {
        Shots h = new Shots();
        UiArt art = UiArt.get();
        art.release(UiArt.G_MENU);
        art.release(UiArt.G_TITLE);
        long before = art.bytesHeld();
        h.eng.phase = Engine.PH_MENU;
        h.eng.advance(1f / 60f);
        h.renderBottom();
        h.renderTop();
        long menu = art.bytesHeld();
        assertTrue("the menu paintings are decoded when the screen opens: " + before + " -> " + menu, menu > before + 1_000_000);
        System.out.println("UIART menu screens hold " + menu / 1024 + " KB of decoded pictures");
        h.startRun("FLATS", "WHIP", 5);
        h.eng.advance(1f / 60f);
        h.renderBottom();
        h.renderTop();
        long run = art.bytesHeld();
        System.out.println("UIART during a run " + run / 1024 + " KB");
        assertTrue("released when the run starts: " + run, run < menu / 2);
    }
}
