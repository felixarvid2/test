package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.GameData;

import java.util.HashMap;
import java.util.Random;

/**
 * Phase 12, late-fight readability: once the field holds {@code GEM_MERGE_FROM} pickups, gems dropped far from the hero fold
 * into a neighbour (the carpet of crystals gets thinner) without losing XP, and gems next to the hero stay separate.
 */
public class GemMergeTest {
    private static Sim quiet() throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("FLATS"), null, new HashMap<String, Double>(), null, 1L);
        s.noSpawns = true;
        s.enemyN = 0;
        s.pickN = 0;
        return s;
    }

    private static float gemXp(Sim s) {
        float v = 0f;
        for (int i = 0; i < s.pickN; i++) if (s.picks[i].kind == Entities.K_GEM) v += s.picks[i].value;
        return v;
    }

    @Test
    public void farGemsMergeAndKeepTheirXp() throws Exception {
        Sim s = quiet();
        Random r = new Random(3);
        // 300 gems of 1 XP scattered 350..700 units from the hero: beyond FAR_MERGE_DIST, inside the condense distance
        for (int i = 0; i < 300; i++) {
            double a = r.nextDouble() * Math.PI * 2, d = 350 + r.nextDouble() * 350;
            s.addPickup(Entities.K_GEM, s.px + (float) (Math.cos(a) * d), s.py + (float) (Math.sin(a) * d), 1f);
        }
        assertEquals("no XP is lost", 300f, gemXp(s), 0.01f);
        assertTrue("far gems merged: " + s.pickN, s.pickN < 200);
        assertTrue("the first " + Sim.GEM_MERGE_FROM + " gems were not touched", s.pickN >= Sim.GEM_MERGE_FROM);
        for (int i = 0; i < s.pickN; i++) assertTrue("a merged gem stays under the cap", s.picks[i].value <= Sim.MERGE_CAP + 0.01f);
    }

    @Test
    public void gemsNextToTheHeroAreNeverMerged() throws Exception {
        Sim s = quiet();
        Random r = new Random(4);
        for (int i = 0; i < Sim.GEM_MERGE_FROM; i++) { // fill up with far gems first so the rule is active
            double a = r.nextDouble() * Math.PI * 2;
            s.addPickup(Entities.K_GEM, s.px + (float) (Math.cos(a) * 600), s.py + (float) (Math.sin(a) * 600), 1f);
        }
        int before = s.pickN;
        for (int i = 0; i < 20; i++) { // 20 gems within 120 units of the hero (inside MID_MERGE_DIST)
            double a = r.nextDouble() * Math.PI * 2, d = 40 + r.nextDouble() * 80;
            s.addPickup(Entities.K_GEM, s.px + (float) (Math.cos(a) * d), s.py + (float) (Math.sin(a) * d), 1f);
        }
        assertEquals("near gems all stay", before + 20, s.pickN);
    }

    @Test
    public void nothingMergesOnAnEmptyField() throws Exception {
        Sim s = quiet();
        for (int i = 0; i < Sim.GEM_MERGE_FROM - 1; i++) s.addPickup(Entities.K_GEM, s.px + 600f, s.py + 600f + i * 0.1f, 1f);
        assertEquals(Sim.GEM_MERGE_FROM - 1, s.pickN);
    }
}
