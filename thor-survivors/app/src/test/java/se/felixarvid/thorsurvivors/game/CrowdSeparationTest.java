package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;

import java.util.Arrays;
import java.util.HashMap;

/** Crowds stay dense but readable (about 0.8 x (r1 + r2) apart) and look the same at 60 and 120 Hz. */
public class CrowdSeparationTest {
    private static Sim crowd(float hz, float seconds) throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("FOREST"), "WHIP", new HashMap<String, Double>());
        s.inv.weaponCount = 0; // nothing kills: the crowd keeps walking in on the player
        s.recomputeAll();
        s.time = 150;
        Input in = new Input();
        for (int i = 0; i < (int) (seconds * hz); i++) {
            s.hp = s.maxHp;
            s.update(1f / hz, in);
        }
        return s;
    }

    /** Sorted nearest-neighbour distance of every enemy, in units of (r1 + r2). */
    private static float[] nearest(Sim s) {
        int n = s.enemyN;
        float[] r = new float[n];
        for (int i = 0; i < n; i++) {
            float best = Float.MAX_VALUE;
            for (int j = 0; j < n; j++) {
                if (i == j) continue;
                Enemy a = s.enemies[i], b = s.enemies[j];
                best = Math.min(best, (float) Math.hypot(a.x - b.x, a.y - b.y) / (a.radius + b.radius));
            }
            r[i] = best;
        }
        Arrays.sort(r);
        return r;
    }

    @Test
    public void aWalkingCrowdKeepsNearTargetSpacingAtBothFrameRates() throws Exception {
        Sim a = crowd(60f, 30f), b = crowd(120f, 30f);
        assertTrue("crowd too small: " + a.enemyN, a.enemyN >= 80 && b.enemyN >= 80);
        float[] ra = nearest(a), rb = nearest(b);
        float ma = ra[ra.length / 2], mb = rb[rb.length / 2];
        assertTrue("60 Hz median " + ma, ma >= 0.72f);
        assertTrue("120 Hz median " + mb, mb >= 0.72f);
        assertTrue("60 Hz worst tenth " + ra[ra.length / 10], ra[ra.length / 10] >= 0.65f);
        assertTrue("120 Hz worst tenth " + rb[rb.length / 10], rb[rb.length / 10] >= 0.65f);
        assertEquals("same crowd density at 60 and 120 Hz", ma, mb, 0.06f);
    }

    @Test
    public void aPileOfStackedEnemiesSpreadsOutAtBothFrameRates() throws Exception {
        for (float hz : new float[]{60f, 120f}) {
            GameData d = TestData.load();
            Sim s = new Sim(d, d.stages.get("FOREST"), "WHIP", new HashMap<String, Double>());
            s.noSpawns = true;
            s.enemyN = 0;
            s.inv.weaponCount = 0;
            for (int i = 0; i < 40; i++) { // 40 enemies in a 12 x 12 patch, none moving by themselves
                Enemy e = s.addEnemy("ZOMBIE", 400 + (i % 7) * 1.7f, 100 + (i / 7) * 1.7f, false);
                e.speed = 0;
            }
            Input in = new Input();
            for (int i = 0; i < (int) hz; i++) s.update(1f / hz, in);
            float[] r = nearest(s);
            assertTrue(hz + " Hz: closest pair " + r[0], r[0] >= 0.72f);
        }
    }

    @Test
    public void aFullPoolOfEnemiesStillUpdatesQuickly() throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("FOREST"), "WHIP", new HashMap<String, Double>());
        s.noSpawns = true;
        s.enemyN = 0;
        s.inv.weaponCount = 0;
        for (int i = 0; i < Sim.MAX_ENEMIES; i++) {
            Enemy e = s.addEnemy("ZOMBIE", 150 + (i % 20) * 6f, (i / 20) * 6f - 40f, false);
            e.speed = 40f;
        }
        Input in = new Input();
        for (int i = 0; i < 60; i++) { s.hp = s.maxHp; s.update(1f / 60f, in); } // warm up
        long t0 = System.nanoTime();
        for (int i = 0; i < 120; i++) { s.hp = s.maxHp; s.update(1f / 60f, in); }
        double msPerStep = (System.nanoTime() - t0) / 1e6 / 120;
        assertTrue("update took " + msPerStep + " ms with 320 enemies", msPerStep < 8.0);
    }
}
