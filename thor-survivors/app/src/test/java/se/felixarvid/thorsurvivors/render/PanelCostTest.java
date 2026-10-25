package se.felixarvid.thorsurvivors.render;

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

import java.lang.reflect.Method;
import java.util.Arrays;

/**
 * Cost of the ASHFALL panel (design phase 11): the bottom screen is redrawn every vsync, so each screen must allocate nothing in
 * steady state and stay cheap. Timings are software rasterisation on the JVM (a proxy for comparing screens, never an fps claim);
 * output lines start with {@code PERF panel}. Same measurement and spike rule as {@link RenderCostTest}.
 */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 35)
public class PanelCostTest {
    private static final long SPIKE = 8192;

    private Object mx;
    private Method alloc;
    private long tid, probe;

    private void probe() throws Exception {
        mx = Class.forName("java.lang.management.ManagementFactory").getMethod("getThreadMXBean").invoke(null);
        alloc = Class.forName("com.sun.management.ThreadMXBean").getMethod("getThreadAllocatedBytes", long.class);
        tid = Thread.currentThread().getId();
        probe = (Long) alloc.invoke(mx, tid);
        probe = (Long) alloc.invoke(mx, tid) - probe;
    }

    /** Draws `frames` frames of the panel in its current state; fails when it allocates per frame. */
    private void measure(String name, PanelRenderer p, Canvas c, int w, int h, Runnable between) throws Exception {
        for (int i = 0; i < 60; i++) p.draw(c, w, h); // warm up: shaders, string caches, art decode
        final int n = 120;
        double[] ms = new double[n];
        long bytes = 0;
        int spikes = 0;
        for (int i = 0; i < n; i++) {
            if (between != null) between.run();
            long a0 = (Long) alloc.invoke(mx, tid);
            long t0 = System.nanoTime();
            p.draw(c, w, h);
            ms[i] = (System.nanoTime() - t0) / 1e6;
            long d = (Long) alloc.invoke(mx, tid) - a0 - probe;
            if (d >= SPIKE) spikes++; else bytes += d;
        }
        Arrays.sort(ms);
        System.out.printf("PERF panel %s: median %.1f ms, p95 %.1f ms (software raster), allocation %d B/frame (+%d one-off spikes)%n",
                name, ms[n / 2], ms[(int) (n * 0.95)], bytes / n, spikes);
        assertTrue(name + " has " + spikes + " allocation spikes in " + n + " frames", spikes <= 6);
        assertTrue(name + " allocates " + bytes / n + " B per frame", bytes / n < 256 || System.getenv("PANEL_ALLOC_PRINT") != null);
    }

    @Test
    public void everyScreenDrawsWithoutAllocating() throws Exception {
        probe();
        Shots h = new Shots();
        PanelRenderer p = new PanelRenderer(false);
        PanelRenderer compact = new PanelRenderer(true);
        Bitmap b = Bitmap.createBitmap(1240, 1080, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        Bitmap bc = Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888);
        Canvas cc = new Canvas(bc);

        // menus
        h.eng.phase = Engine.PH_MENU;
        for (int f : new int[]{Engine.MENU_START, Engine.MENU_STAGE, Engine.MENU_HERO}) {
            h.eng.focus = f;
            h.eng.advance(1f / 60f);
            measure("menu focus " + f, p, c, 1240, 1080, null);
        }
        measure("menu compact", compact, cc, 1920, 1080, null);
        h.eng.phase = Engine.PH_SHOP;
        h.eng.focus = 2;
        measure("shop", p, c, 1240, 1080, null);

        // the HUD with a full build, an elite, a boss and its banner, hero statuses
        h.eng.phase = Engine.PH_MENU;
        Sim s = h.startRun("FLATS", "WHIP", 9, "MAGIC_MISSILE", "KNIFE", "AXE", "GARLIC", "HOLYBOOK", "POWER", "ARMOR", "COOLDOWN", "AREA",
                "MAXHEALTH", "MAGNET");
        s.noSpawnsForTest();
        s.enemyN = 0;
        s.time = 600;
        s.giveEquipment("COMBAT_HELM", Equipment.COMMON);
        s.giveEquipment("PLATED_VEST", Equipment.RARE);
        s.recomputeAll();
        Enemy el = s.spawnEliteForTest("SERGEANT", Elites.M_FIRE | Elites.M_ARMORED);
        el.speed = 0;
        Enemy boss = s.spawnAt("SLAGBORN", s.px + 300, s.py, true);
        boss.speed = 0;
        final Sim sim = s;
        Runnable hold = () -> {
            sim.hp = sim.maxHp * 0.5f;
            sim.heroBurnT = 2f;
            sim.heroSlowT = 2f;
            sim.bannerT = 1f;
            sim.bannerKey = "SLAGBORN";
            sim.bannerName = "SLAGBORN";
            h.eng.advance(1f / 60f);
        };
        hold.run();
        measure("hud (full build, boss, elite, banner)", p, c, 1240, 1080, null);
        sim.bannerT = 0f;
        measure("hud (full build, boss, elite)", p, c, 1240, 1080, () -> { sim.bannerT = 0f; sim.heroBurnT = 2f; });
        measure("hud compact", compact, cc, 1920, 1080, () -> { sim.bannerT = 0f; sim.heroBurnT = 2f; });

        // level-up, equipment choice, chest, pause, result
        sim.pendingLevelUps = 1;
        sim.level = 5;
        h.eng.advance(1f / 60f);
        measure("level-up", p, c, 1240, 1080, null);
        h.eng.input.post(Input.CMD_CONFIRM, 0, 0, 0);
        h.eng.advance(1f / 60f);
        h.eng.advance(1f / 60f);
        h.eng.nextRunSeed = 1L; // deterministic run
        h.eng.input.post(Input.CMD_START, 0, 0, 0);
        h.eng.advance(1f / 60f);
        measure("pause", p, c, 1240, 1080, null);
        h.eng.chestLines = new String[]{"EVOLUTION!", "Spore Dart -> Lumen Volley", "Vibro Lash -> Lv 2", "+50 gold"};
        h.eng.phase = Engine.PH_CHEST;
        measure("chest", p, c, 1240, 1080, null);
        // equipment choice: Headlamp (Rare) against the worn Combat Helm
        h.eng.phase = Engine.PH_PLAYING;
        sim.addPickupForTest(se.felixarvid.thorsurvivors.game.Entities.K_EQUIP, sim.px, sim.py,
                h.eng.data.equipment.get("HEADLAMP").index * 4 + Equipment.RARE);
        for (int i = 0; i < 4 && h.eng.phase != Engine.PH_EQUIP; i++) h.eng.advance(1f / 60f);
        assertTrue("the equipment choice opened", h.eng.phase == Engine.PH_EQUIP);
        measure("equipment choice", p, c, 1240, 1080, null);
        h.eng.input.post(Input.CMD_CONFIRM, 0, 0, 0);
        h.eng.advance(1f / 60f);
        h.eng.resultWin = true;
        h.eng.resultFirst = true;
        h.eng.resultGold = 1234;
        h.eng.resultKills = 999;
        h.eng.resultTime = 1800;
        h.eng.resultLevel = 30;
        h.eng.phase = Engine.PH_RESULT;
        measure("result", p, c, 1240, 1080, null);
    }
}
