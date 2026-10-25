package se.felixarvid.thorsurvivors.data;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class WeaponDefTest {
    private static Map<String, Double> row(Object... kv) {
        Map<String, Double> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], ((Number) kv[i + 1]).doubleValue());
        return m;
    }

    @Test
    public void deltaRowsAreAddedToPreviousLevel() {
        List<Map<String, Double>> rows = new ArrayList<>();
        rows.add(row("power", 1, "interval", 1000, "amount", 1));
        rows.add(row("amount", 1));
        rows.add(row("power", 0.5, "interval", -100));
        rows.add(row("power", 0.5, "interval", -100, "area", 0.2));
        WeaponDef d = new WeaponDef("T", "Test", "", null, null, false, false, 100, rows);
        assertEquals(4, d.maxLevel());
        assertEquals(1.0, d.stat(1, "power", 0), 1e-9);
        assertEquals(2.0, d.stat(2, "amount", 0), 1e-9);
        assertEquals(1.5, d.stat(3, "power", 0), 1e-9);
        assertEquals(900.0, d.stat(3, "interval", 0), 1e-9);
        assertEquals(2.0, d.stat(4, "power", 0), 1e-9);
        assertEquals(800.0, d.stat(4, "interval", 0), 1e-9);
        assertEquals(0.2, d.stat(4, "area", 0), 1e-9);
        assertEquals(0.0, d.stat(3, "area", 0), 1e-9); // absent stat falls back
        assertEquals(800.0, d.stat(99, "interval", 0), 1e-9); // clamped
    }

    @Test
    public void realWhipAccumulates() throws Exception {
        WeaponDef whip = TestData.load().weapons.get("WHIP");
        assertEquals(8, whip.maxLevel());
        assertEquals(1350.0, whip.stat(1, "interval", 0), 1e-9);
        assertEquals(2.0, whip.stat(2, "amount", 0), 1e-9);
        assertEquals(1.5, whip.stat(3, "power", 0), 1e-9);
    }

    @Test
    public void realDataLoads() throws Exception {
        GameData d = TestData.load();
        assertTrue(d.weapons.get("VAMPIRICA").evolution);
        assertTrue(d.weapons.get("POWER").powerUp);
        assertEquals("FOREST and LIBRARY (legacy) plus FLATS and MINES", 4, d.stages.size());
        assertEquals(16, d.powerUps.size());
        assertEquals(100.0, d.enemies.get("ZOMBIE").speed, 1e-9);
        assertEquals(1800.0, d.stages.get("FOREST").timeLimit, 1e-9);
    }

    @Test
    public void shopPriceGrowsPerRank() throws Exception {
        PowerUpDef p = TestData.load().powerUps.get("POWER");
        assertEquals(200, p.priceForNext(0));
        assertEquals(400, p.priceForNext(1));
        assertEquals(1000, p.priceForNext(4));
        assertEquals(0.15, p.statsAt(3).get("power"), 1e-9);
    }
}
