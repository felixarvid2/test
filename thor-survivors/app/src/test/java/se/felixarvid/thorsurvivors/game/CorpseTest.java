package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.game.Entities.Corpse;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;

import java.util.HashMap;

/** A dead enemy leaves a visual corpse (for the death clip) that expires; the kill itself is unchanged. */
public class CorpseTest {
    private static int active(Sim s) {
        int n = 0;
        for (Corpse c : s.corpses) if (c.active) n++;
        return n;
    }

    @Test
    public void aKillLeavesACorpseThatFades() throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("FOREST"), "WHIP", new HashMap<String, Double>());
        s.noSpawnsForTest();
        s.enemyN = 0;
        s.inv.weaponCount = 0;
        Enemy e = s.addEnemy("ZOMBIE", 400, 300, false);
        e.speed = 0;
        int id = e.id;
        s.hurt(e, 1e6f, 0, 1, 0, 0, 0);
        s.update(1f / 60f, new Input());
        assertEquals(0, s.enemyN);
        assertEquals(1, s.kills);
        assertEquals(1, active(s));
        Corpse c = null;
        for (Corpse k : s.corpses) if (k.active) c = k;
        assertEquals(id, c.id);
        assertEquals(400f, c.x, 1e-3);
        assertEquals("infected_colonist", c.type.model);
        for (int i = 0; i < 60; i++) s.update(1f / 60f, new Input());
        assertTrue("still lying there after a second", c.active && c.age > 0.9f);
        for (int i = 0; i < 80; i++) s.update(1f / 60f, new Input());
        assertFalse("gone after " + Sim.CORPSE_LIFE + " s", c.active);
    }

    @Test
    public void theRingNeverGrowsPastItsPool() throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("FOREST"), "WHIP", new HashMap<String, Double>());
        s.noSpawnsForTest();
        s.enemyN = 0;
        s.inv.weaponCount = 0;
        for (int i = 0; i < 200; i++) {
            Enemy e = s.addEnemy("BAT1", 100 + i, 50, false);
            e.speed = 0;
            s.hurt(e, 1e6f, 0, 1, 0, 0, 0);
            s.update(1f / 60f, new Input());
        }
        assertEquals(200, s.kills);
        assertTrue(active(s) <= Sim.MAX_CORPSES);
    }
}
