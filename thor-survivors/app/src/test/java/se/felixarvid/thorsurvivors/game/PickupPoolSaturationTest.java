package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.GameData;

import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Random;

/** The pickup pool must never saturate: far gems condense into one red gem and important drops always get a slot. */
public class PickupPoolSaturationTest {
    private static final float DT = 1f / 60f;

    private Sim sim() throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("FOREST"), "WHIP", new HashMap<String, Double>(), null, 1L);
        return s;
    }

    private Sim quiet() throws Exception {
        Sim s = sim();
        s.noSpawns = true;
        s.enemyN = 0;
        return s;
    }

    /** Fills the pool with normal gems scattered 100..700 u from the player (none beyond the condense distance). */
    private static void fillWithGems(Sim s) {
        Random r = new Random(7);
        s.pickN = 0;
        while (s.pickN < Sim.MAX_PICK) {
            Entities.Pickup p = s.picks[s.pickN++];
            double a = r.nextDouble() * Math.PI * 2, d = 100 + r.nextDouble() * 600;
            p.kind = Entities.K_GEM;
            p.x = s.px + (float) (Math.cos(a) * d);
            p.y = s.py + (float) (Math.sin(a) * d);
            p.value = 1;
            p.pulled = false;
            p.red = false;
        }
    }

    private static int count(Sim s, int kind) {
        int n = 0;
        for (int i = 0; i < s.pickN; i++) if (s.picks[i].kind == kind) n++;
        return n;
    }

    private static int reds(Sim s) {
        int n = 0;
        for (int i = 0; i < s.pickN; i++) if (s.picks[i].red) n++;
        return n;
    }

    @Test
    public void standingStillForTwelveMinutesKeepsLevellingAndNeverFillsThePool() throws Exception {
        GameData d = TestData.load();
        Sim s = sim();
        Input in = new Input();
        Random rng = new Random(5);
        int levelAt9 = 0, levelAt10 = 0;
        float maxNormal = 0, needSeen = 0;
        int peak = 0;
        for (int step = 0; step < 12 * 60 * 60 && s.ended == 0; step++) {
            s.hp = s.maxHp;
            s.update(DT, in);
            while (s.pendingLevelUps > 0) {
                s.applyOffer(OfferGenerator.generate(s.inv, d.weapons.values(), s.stats.luck, rng).get(0));
                s.pendingLevelUps--;
            }
            while (s.pendingChests > 0) s.openChest();
            peak = Math.max(peak, s.pickN);
            if (step == 9 * 3600) levelAt9 = s.level;
            if (step == 10 * 3600) levelAt10 = s.level;
            if (step % 30 == 0) {
                assertTrue("at most one red gem", reds(s) <= 1);
                // gems merge up to 40-50 xp; only an elite's pile (five gems worth two levels together, so 0.4 of a
                // level each) is bigger - judged against the largest xp need so far (it jumps at levels 20 and 40
                // and drops again, while a pile can still lie on the ground)
                needSeen = Math.max(needSeen, s.xpNeed);
                float limit = Math.max(50f, 0.45f * needSeen);
                for (int i = 0; i < s.pickN; i++) {
                    Entities.Pickup p = s.picks[i];
                    if (p.kind == Entities.K_GEM && !p.red) maxNormal = Math.max(maxNormal, p.value / limit);
                }
            }
        }
        assertEquals("survived", 0, s.ended);
        assertTrue("level " + s.level + " vs " + levelAt9 + " at 9 min", s.level > levelAt9 && levelAt10 > levelAt9);
        assertTrue("a normal gem held " + maxNormal + "x the allowed xp", maxNormal <= 1f);
        assertTrue("pickN peaked at " + peak, peak < Sim.MAX_PICK);
    }

    @Test
    public void chestIsNeverLostWhenThePoolIsFull() throws Exception {
        Sim s = quiet();
        fillWithGems(s);
        float total = 0;
        for (int i = 0; i < s.pickN; i++) total += s.picks[i].value;
        int gems = count(s, Entities.K_GEM);
        s.addPickup(Entities.K_CHEST, 50, 50, 0);
        assertEquals(1, count(s, Entities.K_CHEST));
        s.addPickup(Entities.K_COIN, 60, 60, 1);
        s.addPickup(Entities.K_VACUUM, 70, 70, 0);
        assertEquals(1, count(s, Entities.K_COIN));
        assertEquals(1, count(s, Entities.K_VACUUM));
        assertTrue(s.pickN <= Sim.MAX_PICK);
        assertEquals("one red gem holds the evicted xp", 1, reds(s));
        float after = 0;
        for (int i = 0; i < s.pickN; i++) if (s.picks[i].kind == Entities.K_GEM) after += s.picks[i].value;
        assertEquals("no xp lost", total, after, 0.01f);
        assertTrue(count(s, Entities.K_GEM) < gems);
        // far-condensing never despawns a chest, but does despawn a far coin
        for (int i = 0; i < s.pickN; i++) {
            Entities.Pickup p = s.picks[i];
            if (p.kind == Entities.K_CHEST || p.kind == Entities.K_COIN) p.x = s.px + 5000;
        }
        s.condenseFar();
        assertEquals(1, count(s, Entities.K_CHEST));
        assertEquals(0, count(s, Entities.K_COIN));
    }

    @Test
    public void newGemMergesIntoANearbyGemWhenFull() throws Exception {
        Sim s = quiet();
        fillWithGems(s);
        Entities.Pickup q = s.picks[10];
        float before = q.value;
        s.addPickup(Entities.K_GEM, q.x + 5, q.y, 3);
        assertEquals(Sim.MAX_PICK, s.pickN);
        assertEquals(0, reds(s));
        float sum = 0;
        for (int i = 0; i < s.pickN; i++) sum += s.picks[i].value;
        assertEquals(Sim.MAX_PICK + 3f, sum, 0.01f);
        assertTrue(before <= q.value);
    }

    @Test
    public void redGemComesBackToThePlayerAndIsCollected() throws Exception {
        Sim s = quiet();
        s.pickN = 0;
        for (int i = 0; i < 5; i++) { // five far gems of 10 xp
            Entities.Pickup p = s.picks[s.pickN++];
            p.kind = Entities.K_GEM;
            p.x = s.px + 3000 + i * 10;
            p.y = s.py;
            p.value = 10;
            p.pulled = false;
            p.red = false;
        }
        s.condenseFar();
        assertEquals(1, s.pickN);
        Entities.Pickup red = s.findRed();
        assertNotNull(red);
        assertEquals(50f, red.value, 0.01f);
        double dist = Math.hypot(red.x - s.px, red.y - s.py);
        assertTrue("distance " + dist, dist >= Sim.RED_MIN - 1 && dist <= Sim.RED_MAX + 1);
        // far again after the player walks away: relocated next pass
        s.px += 2000;
        s.condenseFar();
        dist = Math.hypot(red.x - s.px, red.y - s.py);
        assertTrue("distance " + dist, dist >= Sim.RED_MIN - 1 && dist <= Sim.RED_MAX + 1);
        // collect it: the player walks onto it and gets the whole value
        float xp0 = s.xp;
        int lv0 = s.level;
        s.px = red.x;
        s.py = red.y;
        s.update(DT, new Input());
        assertEquals(0, count(s, Entities.K_GEM));
        assertTrue("xp or level rose", s.xp > xp0 || s.level > lv0);
    }

    @Test
    public void condensingAndFullPoolPathsDoNotAllocate() throws Exception {
        Sim s = quiet();
        Object[] bean = new Object[1];
        Method alloc;
        try {
            bean[0] = Class.forName("java.lang.management.ManagementFactory").getMethod("getThreadMXBean").invoke(null);
            alloc = Class.forName("com.sun.management.ThreadMXBean").getMethod("getThreadAllocatedBytes", long.class);
        } catch (ReflectiveOperationException | RuntimeException | LinkageError e) {
            alloc = null;
        }
        assumeTrue(alloc != null);
        long tid = Thread.currentThread().getId();
        fillWithGems(s);
        for (int round = 0; round < 2; round++) {
            long before = (Long) alloc.invoke(bean[0], tid);
            for (int i = 0; i < 2000; i++) {
                s.addPickup(i % 7 == 0 ? Entities.K_CHEST : i % 3 == 0 ? Entities.K_COIN : Entities.K_GEM,
                        (i % 50) * 13f, (i % 31) * 9f, 1);
                if (i % 5 == 0) s.condenseFar();
            }
            long used = (Long) alloc.invoke(bean[0], tid) - before;
            if (round == 1) assertTrue("allocated " + used + " bytes", used < 16 * 1024);
        }
    }
}
