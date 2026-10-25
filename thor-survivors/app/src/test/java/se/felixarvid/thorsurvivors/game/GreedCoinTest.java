package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.GameData;

import java.util.HashMap;

/** Greed multiplies single coins too: the fractional remainder is carried, not rounded away. */
public class GreedCoinTest {
    private int goldFromCoins(double greed, int coins) throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("FOREST"), "WHIP", new HashMap<String, Double>());
        s.noSpawnsForTest();
        s.enemyN = 0;
        s.stats.greedMul = greed;
        for (int i = 0; i < coins; i++) {
            Entities.Pickup p = s.picks[s.pickN++];
            p.kind = Entities.K_COIN;
            p.x = s.px;
            p.y = s.py;
            p.value = 1;
            p.pulled = false;
        }
        s.update(1f / 60f, new Input());
        return s.gold;
    }

    @Test
    public void greed1Point2GivesTwelveGoldFromTenCoins() throws Exception {
        assertEquals(12, goldFromCoins(1.2, 10));
    }

    @Test
    public void noGreedStillOneGoldPerCoin() throws Exception {
        assertEquals(10, goldFromCoins(1.0, 10));
    }

    @Test
    public void smallGreedAddsUpOverManyCoins() throws Exception {
        assertEquals(15, goldFromCoins(1.05, 14 + 1)); // 15.75: 15 paid, 0.75 carried
    }
}
