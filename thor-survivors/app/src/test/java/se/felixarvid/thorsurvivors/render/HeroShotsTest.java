package se.felixarvid.thorsurvivors.render;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.graphics.Bitmap;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.game.Entities;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;
import se.felixarvid.thorsurvivors.game.Input;
import se.felixarvid.thorsurvivors.game.Sim;

/** Heroes on screen (design phases 3 and 4): each main weapon attacking, the hero select row, a branch card, a dodge. */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 35)
public class HeroShotsTest {
    private static final String[] HEROES = {"bastion", "spectre", "xenomant"};

    private static boolean notBlank(Bitmap b) {
        int first = b.getPixel(0, 0), diff = 0;
        for (int y = 0; y < b.getHeight(); y += 7) for (int x = 0; x < b.getWidth(); x += 7) if (b.getPixel(x, y) != first) diff++;
        return diff > 200;
    }

    private Sim startHero(Shots h, int hero, long seed) {
        h.eng.meta.heroIdx = hero;
        h.eng.phase = Engine.PH_MENU;
        Sim s = h.startRun("FOREST", "WHIP", seed);
        s.inv.weaponCount = 0; // only the main weapon is on screen
        s.recomputeAll();
        s.time = 150;
        return s;
    }

    /** Aims at the nearest enemy and walks in circles until `done` holds (at most 40 s), then returns. */
    private void driveUntil(Shots h, java.util.function.Predicate<Sim> done) {
        Sim s = h.eng.sim;
        for (int i = 0; i < 40 * 60 && !done.test(s); i++) {
            Enemy best = null;
            float bd = 1e18f;
            for (int k = 0; k < s.enemyN; k++) {
                Enemy e = s.enemies[k];
                float dx = e.x - s.px, dy = e.y - s.py, q = dx * dx + dy * dy;
                if (q < bd) { bd = q; best = e; }
            }
            if (best != null) {
                float dx = best.x - s.px, dy = best.y - s.py, m = (float) Math.sqrt(dx * dx + dy * dy) + 1e-3f;
                h.eng.input.aimStickX = dx / m;
                h.eng.input.aimStickY = dy / m;
            }
            h.step(i, true);
            s.inv.weaponCount = 0; // level-ups picked by the harness must not add auto weapons to the picture
        }
    }

    private static boolean fxOf(Sim s, int kind) {
        for (int j = 0; j < Sim.MAX_FX; j++) if (s.fx[j].life > 0 && s.fx[j].kind == kind) return true;
        return false;
    }

    private static int mainProjectiles(Sim s) {
        int n = 0;
        for (int i = 0; i < s.projN; i++) if (s.projs[i].kind == Entities.P_MAIN) n++;
        return n;
    }

    @Test
    public void eachHeroAttacking() throws Exception {
        for (int hero0 = 0; hero0 < 3; hero0++) {
            final int hero = hero0;
            Shots h = new Shots();
            Sim s = startHero(h, hero, 11 + hero);
            final int fxKind = hero == 0 ? Entities.FX_SWING : Entities.FX_MUZZLE;
            driveUntil(h, x -> x.enemyN > 25 && x.time > 160 && (hero == 2 ? mainProjectiles(x) >= 1 && x.tNow - x.lastMainAttack < 0.2f : fxOf(x, fxKind)));
            assertEquals(HEROES[hero], s.hero.model);
            Bitmap t = h.renderTop();
            Shots.save(t, "hero_" + HEROES[hero] + "_attack.png");
            assertTrue(notBlank(t));
        }
    }

    @Test
    public void bastionSlamAndXenomantBurst() throws Exception {
        Shots h = new Shots();
        Sim s = startHero(h, 0, 21);
        driveUntil(h, x -> x.enemyN > 25 && x.time > 160 && fxOf(x, Entities.FX_SLAM));
        Shots.save(h.renderTop(), "hero_bastion_slam.png");
        h = new Shots();
        s = startHero(h, 2, 22);
        driveUntil(h, x -> x.enemyN > 25 && x.time > 160 && fxOf(x, Entities.FX_BURST));
        Shots.save(h.renderTop(), "hero_xenomant_burst.png");
    }

    @Test
    public void branchBuildsOnScreen() throws Exception {
        Shots h = new Shots();
        Sim s = startHero(h, 2, 31);
        s.main.pick(2, 1); // Parasite Link
        s.main.pick(3, 1); // Wrath of Lumen: the beam
        s.recomputeAll();
        driveUntil(h, x -> x.enemyN > 25 && x.time > 160 && x.main.beamT > 0.3f && x.main.linkN > 0);
        Shots.save(h.renderTop(), "hero_xenomant_beam.png");
        Shots.save(h.renderBottom(), "hud_xenomant_branches.png");
        h = new Shots();
        s = startHero(h, 1, 32);
        s.main.pick(3, 1); // Cluster Grenade
        s.main.pick(0, 1); // wide fan
        s.recomputeAll();
        driveUntil(h, x -> x.enemyN > 25 && x.time > 160 && x.main.count > 4 && x.tNow - x.lastMainAttack < 0.15f && x.main.count % 4 == 0);
        Shots.save(h.renderTop(), "hero_spectre_grenade.png");
    }

    @Test
    public void branchCardOnTheBottomScreen() throws Exception {
        Shots h = new Shots();
        Sim s = startHero(h, 0, 41);
        s.level = 5;
        s.pendingLevelUps = 1;
        h.eng.advance(1f / 60f);
        assertEquals(Engine.PH_LEVELUP, h.eng.phase);
        Bitmap b = h.renderBottom();
        Shots.save(b, "levelup_branch_bottom.png");
        assertTrue(notBlank(b));
        boolean branch = false;
        for (se.felixarvid.thorsurvivors.game.Offer o : h.eng.offers) branch |= o.kind == se.felixarvid.thorsurvivors.game.Offer.BRANCH;
        assertTrue(branch);
    }

    @Test
    public void heroSelectMenu() throws Exception {
        Shots h = new Shots();
        for (int hero = 0; hero < 3; hero++) {
            h.eng.meta.heroIdx = hero;
            h.eng.phase = Engine.PH_MENU;
            h.eng.focus = Engine.MENU_HERO;
            for (int i = 0; i < 30; i++) h.eng.advance(1f / 60f);
            Shots.save(h.renderBottom(), "hero_select_" + HEROES[hero] + "_bottom.png");
            if (hero == 1) Shots.save(h.renderTop(), "hero_select_top.png");
        }
    }

    @Test
    public void dodge() throws Exception {
        Shots h = new Shots();
        Sim s = startHero(h, 1, 51);
        driveUntil(h, x -> x.enemyN > 25 && x.time > 160);
        h.eng.input.stickX = 1f;
        h.eng.input.dodgeReq = true;
        for (int i = 0; i < 7; i++) h.eng.advance(1f / 60f);
        assertTrue(s.dodgeT > 0f);
        Shots.save(h.renderTop(), "hero_spectre_dodge.png");
        Shots.save(h.renderBottom(), "hud_dodge_cooldown.png");
    }
}
