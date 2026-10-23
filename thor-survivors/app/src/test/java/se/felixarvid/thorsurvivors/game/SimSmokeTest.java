package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.GameData;

import java.util.HashMap;
import java.util.Random;

/** Headless runs of the simulation: exercises every weapon behaviour, pools, waves, pickups and win/lose. */
public class SimSmokeTest {
    private void run(String stage, String starter, double seconds) throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get(stage), starter, new HashMap<String, Double>());
        Input in = new Input();
        Random rng = new Random(5);
        for (String k : new String[]{"WHIP", "MAGIC_MISSILE", "KNIFE", "AXE", "CROSS", "HOLYBOOK", "FIREBALL", "GARLIC",
                "HOLYWATER", "LIGHTNING"}) {
            if (s.inv.weaponLevel(k) == 0 && s.inv.weaponCount < 6 && rng.nextBoolean()) s.inv.add(d.weapons.get(k));
        }
        s.recomputeAll();
        int step = 0, levelUps = 0;
        while (s.time < seconds && s.ended == 0) {
            if (step++ % 120 == 0) {
                in.stickX = rng.nextFloat() * 2 - 1;
                in.stickY = rng.nextFloat() * 2 - 1;
            }
            s.hp = s.maxHp; // keep alive
            s.update(1f / 60f, in);
            while (s.pendingLevelUps > 0) {
                s.applyOffer(OfferGenerator.generate(s.inv, d.weapons.values(), s.stats.luck, rng).get(0));
                s.pendingLevelUps--;
                levelUps++;
            }
            while (s.pendingChests > 0) s.openChest();
            assertTrue(s.enemyN <= Sim.MAX_ENEMIES && s.projN <= Sim.MAX_PROJ && s.pickN <= Sim.MAX_PICK);
        }
        assertTrue("kills", s.kills > 0);
        assertTrue("levelups", levelUps > 0);
    }

    @Test
    public void forestRunsFiveMinutes() throws Exception {
        run("FOREST", "WHIP", 300);
    }

    @Test
    public void libraryRunsWithEveryStarter() throws Exception {
        for (String k : new String[]{"MAGIC_MISSILE", "KNIFE", "AXE", "HOLYBOOK", "HOLYWATER"}) run("LIBRARY", k, 90);
    }

    @Test
    public void lateGameWithEvolvedWeaponsAndCrowd() throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("FOREST"), "WHIP", new HashMap<String, Double>());
        for (String k : new String[]{"HOLY_MISSILE", "THOUSAND", "SCYTHE", "HEAVENSWORD", "VESPERS"}) s.inv.add(d.weapons.get(k));
        s.recomputeAll();
        s.time = 25 * 60;
        Input in = new Input();
        for (int i = 0; i < 60 * 40 && s.ended == 0; i++) {
            s.hp = s.maxHp;
            s.update(1f / 60f, in);
        }
        assertTrue(s.kills > 50);
    }

    @Test
    public void winsAtTimeLimit() throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("FOREST"), "WHIP", new HashMap<String, Double>());
        s.time = d.stages.get("FOREST").timeLimit - 0.01;
        s.update(0.1f, new Input());
        assertEquals(2, s.ended);
    }

    @Test
    public void diesWhenNeverMovingAndLowHp() throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("FOREST"), "WHIP", new HashMap<String, Double>());
        s.hp = 1;
        Input in = new Input();
        for (int i = 0; i < 60 * 120 && s.ended == 0; i++) s.update(1f / 60f, in);
        assertEquals(1, s.ended);
    }
}
