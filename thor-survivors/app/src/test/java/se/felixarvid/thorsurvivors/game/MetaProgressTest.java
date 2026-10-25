package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;

import java.util.HashMap;
import java.util.Map;

public class MetaProgressTest {
    static final class MemStore implements MetaProgress.Store {
        final Map<String, Integer> m = new HashMap<>();

        public int getInt(String k, int d) {
            Integer v = m.get(k);
            return v == null ? d : v;
        }

        public void putInt(String k, int v) {
            m.put(k, v);
        }
    }

    @Test
    public void buyingScalesPriceAndPersists() throws Exception {
        MemStore st = new MemStore();
        MetaProgress mp = new MetaProgress(TestData.load(), st);
        mp.addGold(1000);
        assertTrue(mp.buy("POWER")); // 200
        assertEquals(800, mp.gold);
        assertTrue(mp.buy("POWER")); // 400
        assertEquals(400, mp.gold);
        assertEquals(600, mp.nextPrice("POWER"));
        assertFalse(mp.buy("POWER")); // cannot afford 600
        assertEquals(0.10, mp.bonuses().get("power"), 1e-9);
        MetaProgress again = new MetaProgress(TestData.load(), st);
        assertEquals(400, again.gold);
        assertEquals(2, again.rank("POWER"));
    }

    @Test
    public void maxRankStopsPurchases() throws Exception {
        MetaProgress mp = new MetaProgress(TestData.load(), new MemStore());
        mp.addGold(1_000_000);
        assertTrue(mp.buy("AMOUNT"));
        assertTrue(mp.isMaxed("AMOUNT"));
        assertFalse(mp.buy("AMOUNT"));
    }

    @Test
    public void recordsKeepBest() throws Exception {
        MetaProgress mp = new MetaProgress(TestData.load(), new MemStore());
        mp.recordRun(100, 50);
        mp.recordRun(60, 80);
        assertEquals(100, mp.bestTimeSec);
        assertEquals(80, mp.bestKills);
    }

    @Test
    public void heroSelectionPersistsAndOldSavesDefaultToBastion() throws Exception {
        MemStore st = new MemStore();
        MetaProgress fresh = new MetaProgress(TestData.load(), st); // a save without a "hero" key
        assertEquals(0, fresh.heroIdx);
        assertEquals("BASTION", fresh.heroKey());
        fresh.stepHero(1);
        assertEquals("SPECTRE", fresh.heroKey());
        assertEquals(1, (int) st.m.get("hero"));
        assertEquals("SPECTRE", new MetaProgress(TestData.load(), st).heroKey());
        fresh.stepHero(2); // wraps
        assertEquals("BASTION", fresh.heroKey());
        fresh.stepHero(-1);
        assertEquals("XENOMANT", fresh.heroKey());
        st.m.put("hero", 99); // a damaged save clamps
        assertEquals("XENOMANT", new MetaProgress(TestData.load(), st).heroKey());
        st.m.put("hero", -4);
        assertEquals("BASTION", new MetaProgress(TestData.load(), st).heroKey());
        // the other save values are untouched by the new key
        st.m.put("gold", 77);
        assertEquals(77, new MetaProgress(TestData.load(), st).gold);
    }
}
