package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;

import java.util.HashMap;

/** Every orbiting book (and every puddle) re-hits on its own cooldown, so Amount adds damage. */
public class BookAmountTest {
    private static final float DT = 1f / 60f;

    /** Total damage dealt in `seconds` to a ring of stationary dummies on the books' orbit. */
    private double damage(String weapon, int amount, float seconds) throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("FOREST"), weapon, new HashMap<String, Double>());
        s.noSpawnsForTest();
        s.enemyN = 0;
        s.rng.setSeed(3);
        s.weapons[0].amount = amount;
        int n = 36;
        float r = 75f * s.weapons[0].area;
        float[] ex = new float[n], ey = new float[n];
        Enemy[] es = new Enemy[n];
        for (int i = 0; i < n; i++) {
            double a = i * 2 * Math.PI / n;
            ex[i] = s.px + (float) Math.cos(a) * r;
            ey[i] = s.py + (float) Math.sin(a) * r;
            es[i] = s.addEnemy("ZOMBIE", ex[i], ey[i], false);
            es[i].hp = es[i].maxHp = 1e6f;
            es[i].speed = 0;
        }
        Input in = new Input();
        for (int f = 0; f < Math.round(seconds / DT); f++) {
            s.update(DT, in);
            s.hp = s.maxHp;
            for (int i = 0; i < n; i++) { es[i].x = ex[i]; es[i].y = ey[i]; es[i].kvx = es[i].kvy = 0; }
        }
        double total = 0;
        for (int i = 0; i < n; i++) total += es[i].maxHp - es[i].hp;
        return total;
    }

    @Test
    public void threeBooksDealAboutThreeTimesOneBook() throws Exception {
        double one = damage("HOLYBOOK", 1, 10f);
        double three = damage("HOLYBOOK", 3, 10f);
        assertTrue("one book must hit", one > 0);
        double ratio = three / one;
        assertTrue("ratio " + ratio, ratio > 2.5 && ratio < 3.5);
    }

    @Test
    public void vespersAmountAddsDamage() throws Exception {
        double one = damage("VESPERS", 1, 10f);
        double two = damage("VESPERS", 2, 10f);
        assertTrue("one " + one + " two " + two, two > one * 1.6);
    }
}
