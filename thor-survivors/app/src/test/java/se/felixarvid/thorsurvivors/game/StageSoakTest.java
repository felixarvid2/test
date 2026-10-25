package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeTrue;

import org.junit.Test;

/**
 * Design phase 7 soak, a slice that fits the suite: 5 minutes on each stage with the immortal bot (no NaN, no pool
 * overflow, the 300 cap held, bolts under 40). The full 30 minute matrix is {@link StageSoak} (soak skill); with
 * {@code SOAK=1} this test runs the whole 30 minutes on both stages for the three heroes.
 */
public class StageSoakTest {
    @Test
    public void fiveMinutesOnEachStageStayClean() throws Exception {
        boolean full = System.getenv("SOAK") != null;
        double limit = full ? 1800 : 300;
        for (String stage : new String[]{"FLATS", "MINES"}) {
            for (String hero : full ? new String[]{"BASTION", "SPECTRE", "XENOMANT"} : new String[]{"BASTION"}) {
                StageSoak.Result r = StageSoak.run(stage, hero, "immortal", 1, limit);
                System.out.println(r);
                assertEquals(r.toString(), 0, r.nan);
                assertEquals(r.toString(), 0, r.overflow);
                assertEquals(r.toString(), 0, r.capBreak);
                assertTrue(r.toString(), r.peakEProj <= Sim.MAX_EPROJ && r.peakHaz <= Sim.MAX_HAZ);
                assertTrue(r.toString(), r.kills > 100);
            }
        }
    }

    /** Design 7 acceptance, the naked half: a bot that takes no card (the main weapon alone) dies on both stages, every hero. */
    @Test
    public void aNakedBotDies() throws Exception {
        for (String stage : new String[]{"FLATS", "MINES"}) {
            for (String hero : new String[]{"BASTION", "SPECTRE", "XENOMANT"}) {
                StageSoak.Result r = StageSoak.run(stage, hero, "naked", 1, 1800);
                System.out.println(r);
                assertEquals("a naked build dies: " + r, 1, r.ended);
                assertEquals(r.toString(), 0, r.nan);
                assertTrue(r.toString(), r.endTime < 900);
            }
        }
    }

    /**
     * Design 7 acceptance, the mid-build half (slow, SOAK=1): the bot that takes weapons and branches and plays Bastion
     * (kites, sidesteps bolts and charge lines, keeps out of pools) lives to 30:00 in most of 6 seeded runs per stage.
     * The balance pass (phase 12) tunes this; the rule here is a majority on Cinder Flats and at least a third on Deep Mines.
     */
    @Test
    public void aMidBuildBotSurvives() throws Exception {
        assumeTrue("slow: SOAK=1", System.getenv("SOAK") != null);
        for (String stage : new String[]{"FLATS", "MINES"}) {
            int won = 0;
            for (long seed = 1; seed <= 6; seed++) {
                StageSoak.Result r = StageSoak.run(stage, "BASTION", "mid", seed, 1800);
                System.out.println(r);
                assertEquals(r.toString(), 0, r.nan);
                assertEquals(r.toString(), 0, r.capBreak);
                if (r.ended == 2) won++;
            }
            System.out.println(stage + " mid-build Bastion survived " + won + " of 6");
            assertTrue(stage + " survivors " + won, won >= (stage.equals("FLATS") ? 3 : 2));
        }
    }
}
