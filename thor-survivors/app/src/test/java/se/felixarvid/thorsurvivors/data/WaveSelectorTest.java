package se.felixarvid.thorsurvivors.data;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.game.WaveDirector;

import java.util.ArrayList;
import java.util.List;

public class WaveSelectorTest {
    private static List<WaveRow> rows() {
        List<WaveRow> r = new ArrayList<>();
        for (int m : new int[]{0, 1, 2, 5}) r.add(new WaveRow(m, 10 + m, 1000, new String[]{"A"}, new String[0]));
        return r;
    }

    @Test
    public void picksLastRowNotAfterCurrentMinute() {
        List<WaveRow> r = rows();
        assertEquals(0, WaveSelector.indexAt(r, 0));
        assertEquals(0, WaveSelector.indexAt(r, 59.9));
        assertEquals(1, WaveSelector.indexAt(r, 60));
        assertEquals(2, WaveSelector.indexAt(r, 179));
        assertEquals(2, WaveSelector.indexAt(r, 4 * 60 + 59)); // no row for minutes 3-4: row 2 persists
        assertEquals(3, WaveSelector.indexAt(r, 5 * 60));
        assertEquals(3, WaveSelector.indexAt(r, 99999));
        assertEquals(0, WaveSelector.indexAt(r, -5));
    }

    @Test
    public void realForestRows() throws Exception {
        StageDef f = TestData.load().stages.get("FOREST");
        assertEquals("BAT3", f.rowAt(10).enemies[0]);
        assertEquals(30, f.rowAt(61).minimum);
        assertEquals("XLMANTIS", f.rowAt(5 * 60 + 1).bosses[0]);
        assertEquals(29, f.rowAt(1799).minute);
        assertEquals(30, f.rowAt(1800).minute);
    }

    @Test
    public void spawnsOneOfEachTypeThenTopsUpToMinimum() {
        WaveRow row = new WaveRow(0, 50, 1000, new String[]{"A", "B", "C"}, new String[0]);
        assertEquals(3, WaveDirector.eachCount(row, 0));
        assertEquals(3, WaveDirector.eachCount(row, 200)); // also above `minimum`
        assertEquals(30, WaveDirector.topUpCount(row, 0)); // bounded per tick
        assertEquals(5, WaveDirector.topUpCount(row, 45));
        assertEquals(0, WaveDirector.topUpCount(row, 60));
        assertEquals(0, WaveDirector.eachCount(row, WaveDirector.ENEMY_CAP));
        assertEquals(0, WaveDirector.topUpCount(row, WaveDirector.ENEMY_CAP));
        assertEquals(2, WaveDirector.eachCount(row, WaveDirector.ENEMY_CAP - 2));
        WaveRow big = new WaveRow(0, 999, 1000, new String[]{"A"}, new String[0]);
        assertEquals(WaveDirector.ENEMY_CAP - 295, WaveDirector.topUpCount(big, 295));
    }
}
