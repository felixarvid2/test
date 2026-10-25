package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.GameData;

import java.util.HashMap;

/** Braziers (forest) and candelabras (library): deterministic placement, breaking drops something, no per-frame garbage. */
public class DestructibleTest {
    private static final float DT = 1f / 60f;

    private Sim sim(String stage) throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get(stage), "WHIP", new HashMap<String, Double>());
        s.noSpawns = true;
        s.enemyN = 0;
        s.rng.setSeed(3);
        return s;
    }

    private static float[] snapshot(Sim s) {
        float[] a = new float[s.destN * 2];
        for (int i = 0; i < s.destN; i++) {
            a[i * 2] = s.destX[i];
            a[i * 2 + 1] = s.destY[i];
        }
        java.util.Arrays.sort(a);
        return a;
    }

    @Test
    public void stagesDeclareTheirDestructible() throws Exception {
        assertEquals("BRAZIER", sim("FOREST").destType());
        assertEquals("CANDELABRA", sim("LIBRARY").destType());
    }

    @Test
    public void placementIsDeterministicAndStableAcrossVisits() throws Exception {
        for (String stage : new String[]{"FOREST", "LIBRARY"}) {
            Sim a = sim(stage), b = sim(stage);
            assertTrue(stage + " has some at the start", a.destN > 0);
            assertTrue(java.util.Arrays.equals(snapshot(a), snapshot(b)));
            float[] first = snapshot(a);
            a.px = 4000;
            a.py = -3000;
            a.update(DT, new Input());
            assertFalse(java.util.Arrays.equals(first, snapshot(a)));
            a.px = 0;
            a.py = 0;
            a.update(DT, new Input());
            assertTrue("same cells, same braziers on return", java.util.Arrays.equals(first, snapshot(a)));
        }
    }

    @Test
    public void aboutOnePerCellAndNeverNearTheStartOrOnScenery() throws Exception {
        for (String stage : new String[]{"FOREST", "LIBRARY"}) {
            Sim s = sim(stage);
            int cells = 0, placed = 0;
            for (int cy = -20; cy < 20; cy++) {
                for (int cx = -20; cx < 20; cx++) {
                    cells++;
                    if (!s.destPlace(cx, cy)) continue;
                    placed++;
                    float x = s.destPlaceX(), y = s.destPlaceY();
                    assertTrue(Math.hypot(x, y) >= 300f);
                    assertTrue(x >= cx * 500f && x < (cx + 1) * 500f && y >= cy * 500f && y < (cy + 1) * 500f);
                    assertFalse(stage + " on scenery at " + x + "," + y, s.map.blocked(x, y));
                }
            }
            double per = placed / (double) cells;
            assertTrue(stage + " density " + per, per > 0.75 && per <= 0.9);
        }
    }

    @Test
    public void aWeaponHitBreaksOneAndItDropsAPickup() throws Exception {
        Sim s = sim("FOREST");
        float bx = s.destX[0], by = s.destY[0];
        s.px = bx - 70;
        s.py = by;
        s.facingRight = true;
        Input in = new Input();
        s.update(0f, in); // enter the new cell: the 5 x 5 window around it is what counts
        int n0 = s.destN;
        for (int i = 0; i < 120 && s.destsBroken == 0; i++) s.update(DT, in);
        assertEquals(1, s.destsBroken);
        assertEquals(n0 - 1, s.destN);
        boolean found = false;
        for (int i = 0; i < s.pickN; i++) if (s.picks[i].kind != Entities.K_GEM) found = true;
        assertTrue("a drop lies there", found);
        // it stays broken when its cell is left and re-entered
        s.px = 3000;
        s.update(DT, in);
        s.px = bx - 70;
        s.update(DT, in);
        for (int i = 0; i < s.destN; i++) assertFalse(s.destX[i] == bx && s.destY[i] == by);
    }

    @Test
    public void projectilesAndAuraAlsoBreakThem() throws Exception {
        GameData d = TestData.load();
        for (String weapon : new String[]{"KNIFE", "GARLIC", "FIREBALL"}) {
            Sim s = new Sim(d, d.stages.get("FOREST"), weapon, new HashMap<String, Double>());
            s.noSpawns = true;
            s.enemyN = 0;
            float bx = s.destX[0], by = s.destY[0];
            s.px = bx - 60;
            s.py = by;
            s.faceX = 1;
            s.faceY = 0;
            // Fire Wand aims at a random enemy (a random direction when there is none): give it one behind the brazier
            if (weapon.equals("FIREBALL")) s.addEnemy("ZOMBIE", bx + 300, by, false);
            for (int i = 0; i < 60 * 6 && s.destsBroken == 0; i++) s.update(DT, new Input());
            assertEquals(weapon, 1, s.destsBroken);
        }
    }

    @Test
    public void dropTableIsMostlyGoldSometimesFoodRarelyPowerPickups() throws Exception {
        Sim s = sim("FOREST");
        int[] count = new int[16];
        for (int i = 0; i < 20000; i++) {
            s.pickN = 0;
            s.dropFromDest(0, 0);
            assertEquals(1, s.pickN);
            count[s.picks[0].kind]++;
        }
        int gold = count[Entities.K_COIN] + count[Entities.K_COINBAG];
        assertTrue("gold " + gold, gold > 12000);
        assertTrue("roast " + count[Entities.K_ROAST], count[Entities.K_ROAST] > 3000 && count[Entities.K_ROAST] < gold);
        for (int k : new int[]{Entities.K_VACUUM, Entities.K_OROLOGION, Entities.K_ROSARY, Entities.K_CLOVER}) {
            assertTrue("kind " + k + " " + count[k], count[k] > 200 && count[k] < 1500);
        }
    }

    /** Bytes this thread has allocated so far (HotSpot's ThreadMXBean, by reflection: android.jar has no java.lang.management). */
    private static long allocated() throws Exception {
        Class<?> f = Class.forName("java.lang.management.ManagementFactory");
        Object bean = f.getMethod("getThreadMXBean").invoke(null);
        java.lang.reflect.Method m = Class.forName("com.sun.management.ThreadMXBean").getMethod("getThreadAllocatedBytes", long.class);
        m.setAccessible(true);
        return (Long) m.invoke(bean, Thread.currentThread().getId());
    }

    /** Walking across many cells (refreshing the list) and breaking things must not allocate per frame. */
    @Test
    public void updatingDestructiblesAllocatesNothing() throws Exception {
        Sim s = sim("FOREST");
        Input in = new Input();
        in.stickX = 1f;
        for (int i = 0; i < 300; i++) s.update(DT, in); // warm up (class loading, lazy init)
        long before = allocated();
        int steps = 3000;
        float x0 = s.px;
        for (int i = 0; i < steps; i++) {
            s.hp = s.maxHp;
            s.update(DT, in);
        }
        long bytes = allocated() - before;
        assertTrue("crossed several cells: " + (s.px - x0), s.px - x0 > 3 * 500);
        assertTrue("allocated " + bytes + " bytes in " + steps + " frames", bytes < steps * 8L);
    }
}
