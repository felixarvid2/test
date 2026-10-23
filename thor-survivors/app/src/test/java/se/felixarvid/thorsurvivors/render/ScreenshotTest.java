package se.felixarvid.thorsurvivors.render;

import static org.junit.Assert.assertTrue;

import android.graphics.Bitmap;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.game.Entities;
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

    /** However many hits land, at most ~25 damage numbers are drawn (plus crits). */
    @Test
    public void damageNumbersAreCapped() throws Exception {
        Shots h = new Shots();
        Sim s = h.startRun("FOREST", "WHIP", 7);
        h.drive(2, true);
        s = h.eng.sim;
        for (int i = 0; i < Sim.MAX_TEXT; i++) {
            s.texts[i].life = s.texts[i].maxLife = 0.5f;
            s.texts[i].x = s.px + i * 3;
            s.texts[i].y = s.py - 40;
            s.texts[i].len = 2;
            s.texts[i].digits[0] = '1';
            s.texts[i].digits[1] = '0';
            s.texts[i].crit = false;
        }
        h.renderTop();
        assertTrue("drawn " + h.world.textsDrawn, h.world.textsDrawn <= 25 && h.world.textsDrawn >= 20);
    }

    /** Library fight at 2 minutes: checks the second stage's ground and scenery. */
    @Test
    public void libraryFight() throws Exception {
        Shots h = new Shots();
        Sim s = h.startRun("LIBRARY", "WHIP", 7, "MAGIC_MISSILE", "KNIFE", "GARLIC", "HOLYBOOK");
        s.time = 100;
        h.drive(20, true);
        Bitmap t = h.renderTop();
        Shots.save(t, "library_fight_top.png");
        assertTrue(notBlank(t));
    }

    /** The projectile kind a weapon is on screen as (-1: effect weapons, checked through their effect instead). */
    private static int kindOf(String weapon) {
        switch (weapon) {
            case "MAGIC_MISSILE": return Entities.P_MISSILE;
            case "KNIFE": return Entities.P_KNIFE;
            case "AXE": return Entities.P_AXE;
            case "CROSS": case "HEAVENSWORD": return Entities.P_CROSS;
            case "HOLYBOOK": case "VESPERS": return Entities.P_BOOK;
            case "FIREBALL": return Entities.P_FIRE;
            case "HOLYWATER": return Entities.P_PUDDLE;
            default: return -1;
        }
    }

    /** True while the weapon's own effect is clearly on screen (not just any projectile of another weapon). */
    private static boolean inAction(Sim s, String weapon, int i) {
        int kind = kindOf(weapon);
        if (weapon.equals("WHIP") || weapon.equals("LIGHTNING")) {
            int fk = weapon.equals("WHIP") ? Entities.FX_WHIP : Entities.FX_BOLT;
            for (int j = 0; j < Sim.MAX_FX; j++) if (s.fx[j].life > 0 && s.fx[j].kind == fk) return true;
            return false;
        }
        if (weapon.equals("GARLIC")) return i > 60;
        for (int j = 0; j < s.projN; j++) {
            Entities.Projectile p = s.projs[j];
            if (p.kind != kind) continue;
            float d = (float) Math.hypot(p.x - s.px, p.y - s.py);
            if (kind == Entities.P_PUDDLE) return p.maxLife - p.life > p.flight + 0.3f;
            if (kind == Entities.P_BOOK) return d > 40f; // orbiting, not at the player's feet
            if (kind == Entities.P_CROSS) return d > 90f && d < 330f && p.life < p.maxLife - 0.3f; // mid-flight, out and back
            return d > 60f;
        }
        return false;
    }

    /** Keeps only the weapon under test so no other weapon's effect shows in its shot. */
    private static void isolate(Sim s, String key) {
        if (s.inv.weaponCount == 1 && s.inv.weapons[0].def.key.equals(key)) return;
        for (int i = 0; i < s.inv.weaponCount; i++) {
            if (!s.inv.weapons[i].def.key.equals(key)) continue;
            s.inv.weapons[0].def = s.inv.weapons[i].def;
            s.inv.weapons[0].level = s.inv.weapons[i].level;
            break;
        }
        s.inv.weaponCount = 1;
        s.recomputeAll();
    }

    /** One frame per weapon type while its own effect is on screen (checked per weapon, not by "any projectile"). */
    @Test
    public void weaponsInAction() throws Exception {
        String[][] w = {{"WHIP", "whip"}, {"GARLIC", "garlic"}, {"HOLYBOOK", "bible"}, {"HOLYWATER", "santawater"},
                {"CROSS", "cross"}, {"LIGHTNING", "lightning"}, {"AXE", "axe"}, {"KNIFE", "knife"},
                {"FIREBALL", "fire"}, {"MAGIC_MISSILE", "wand"}, {"VESPERS", "vespers"}, {"HEAVENSWORD", "heavensword"}};
        for (String[] e : w) {
            Shots h = new Shots();
            boolean starter = h.eng.starters.contains(e[0]);
            Sim s = starter ? h.startRun("FOREST", e[0], 11) : h.startRun("FOREST", "HOLYWATER", 11, e[0]);
            if (!starter) { // swap the borrowed starter out so only the weapon under test shows
                s.inv.weapons[0].def = s.inv.weapons[1].def;
                s.inv.weapons[0].level = s.inv.weapons[1].level;
                s.inv.weaponCount = 1;
                s.recomputeAll();
                s.weapons[0].cd = 0.3f;
            }
            s.time = 100;
            h.drive(12, true);
            boolean saved = false;
            for (int i = 0; i < 900 && !saved; i++) {
                h.step(i + 700, true);
                s = h.eng.sim;
                isolate(s, e[0]); // level-ups during the run may have added other weapons
                if (inAction(s, e[0], i)) {
                    StringBuilder dbg = new StringBuilder();
                    for (int j = 0; j < s.inv.weaponCount; j++) dbg.append(s.inv.weapons[j].def.key).append(' ');
                    for (int j = 0; j < Sim.MAX_FX; j++) if (s.fx[j].life > 0) dbg.append("fx").append(s.fx[j].kind).append(' ');
                    System.out.println("SHOT " + e[0] + " weapons=" + dbg + " enemies=" + s.enemyN);
                    Shots.save(h.renderTop(), "weapon_" + e[1] + ".png");
                    saved = true;
                }
            }
            assertTrue(e[0] + " effect never appeared", saved);
        }
    }
}
