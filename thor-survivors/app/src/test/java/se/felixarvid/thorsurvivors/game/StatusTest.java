package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;

import java.util.HashMap;

/** Design section 7 / phase 5: the status formulas, caps, the 10 Hz pass, numbers, hero statuses and allocation. */
public class StatusTest {
    private static final float DT = 1f / 60f;

    private Sim sim() throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("FLATS"), null, new HashMap<String, Double>());
        s.noSpawns = true;
        s.enemyN = 0;
        s.rng.setSeed(11);
        return s;
    }

    /** A far-away tough enemy that does not move (speed 0), so only the status under test acts on it. */
    private Enemy dummy(Sim s, float hp) {
        Enemy e = s.addEnemy("COLONIST", 150, 0, false);
        e.speed = 0f;
        e.hp = e.maxHp = hp;
        return e;
    }

    private void run(Sim s, double seconds) {
        Input in = new Input();
        int n = (int) Math.round(seconds / DT);
        for (int i = 0; i < n; i++) {
            s.hp = s.maxHp;
            s.update(DT, in);
        }
    }

    @Test
    public void electrifyIntervalFollowsTheHotFormula() {
        assertEquals(2.0f, Status.electrifyInterval(1), 0.001f);
        assertEquals(1.708f, Status.electrifyInterval(2), 0.001f);
        assertEquals(1.459f, Status.electrifyInterval(3), 0.001f);
        assertEquals(2.0f * (float) Math.pow(0.854, 5), Status.electrifyInterval(6), 0.001f);
    }

    @Test
    public void formulasPerStack() {
        assertEquals(0.94f, Status.slowFactor(1), 1e-5f);
        assertEquals(0.52f, Status.slowFactor(8), 1e-5f);
        assertEquals(0.52f, Status.slowFactor(20), 1e-5f); // never below -48%
        assertEquals(0.6f, Status.decayDamageMul(10), 1e-5f);
        assertEquals(1.6f, Status.burnTick(2, 10f), 1e-5f); // 0.08 x hit per stack
        assertEquals(15f, Status.electrifyTick(3, 10f), 1e-5f); // 0.5 x hit per stack
        assertEquals(6f, Status.decayPerSecond(5, 20f), 1e-5f); // 0.06 x hit per stack per second
        assertEquals(0.25f, Status.stunFor(1f, true, false), 1e-6f);
        assertEquals(0.5f, Status.stunFor(1f, false, true), 1e-6f);
        assertEquals(1f, Status.stunFor(1f, false, false), 1e-6f);
    }

    @Test
    public void stackCapsHold() throws Exception {
        Sim s = sim();
        Enemy e = dummy(s, 1000);
        s.applyStatus(e, Entities.ST_BURN, 99, 10f, 0f);
        s.applyStatus(e, Entities.ST_ELECTRIFY, 99, 10f, 0f);
        s.applyStatus(e, Entities.ST_DECAY, 99, 10f, 0f);
        assertEquals(8, e.burn);
        assertEquals(6, e.elec);
        assertEquals(10, e.decay);
        assertEquals(Status.cap(Entities.ST_BURN), e.burn);
        assertEquals(Status.cap(Entities.ST_ELECTRIFY), e.elec);
        assertEquals(Status.cap(Entities.ST_DECAY), e.decay);
        assertEquals(0.6f, e.dmgMul, 1e-5f);
    }

    @Test
    public void frostSlowsAndFreezesAtTheCap() throws Exception {
        Sim s = sim();
        Enemy e = dummy(s, 1000);
        s.applyStatus(e, Entities.ST_FROST, 3, 10f, 0f);
        assertEquals(3, e.frost);
        assertEquals(0.82f, e.slow, 1e-5f);
        s.applyStatus(e, Entities.ST_FROST, 5, 10f, 0f); // the 8th stack
        assertEquals("stacks start again", 0, e.frost);
        assertEquals(1f, e.slow, 1e-6f);
        assertEquals(1.0f, e.stun, 1e-5f);
        Enemy boss = s.addEnemy("COLONIST", 200, 0, true);
        s.applyStatus(boss, Entities.ST_FROST, 8, 10f, 0f);
        assertEquals("bosses take 25% of the freeze", 0.25f, boss.stun, 1e-5f);
        Enemy elite = s.addEnemy("COLONIST", 250, 0, false);
        elite.elite = true;
        s.stun(elite, 1f);
        assertEquals(0.5f, elite.stun, 1e-5f);
    }

    @Test
    public void frostSlowReallySlowsTheWalk() throws Exception {
        Sim s = sim();
        Enemy a = s.addEnemy("COLONIST", 600, 0, false), b = s.addEnemy("COLONIST", 600, 300, false);
        a.speed = b.speed = 60f;
        s.applyStatus(b, Entities.ST_FROST, 4, 10f, 0f); // -24%
        float ax = a.x, bx = b.x, by = b.y;
        Input in = new Input();
        for (int i = 0; i < 30; i++) s.update(DT, in);
        float da = ax - a.x;
        float db = (float) Math.hypot(bx - b.x, by - b.y);
        assertTrue("walked " + da + " vs " + db, db < da * 0.85f && db > da * 0.6f);
    }

    @Test
    public void burnTicksAFractionOfTheHitForTwoAndAHalfSeconds() throws Exception {
        Sim s = sim();
        Enemy e = dummy(s, 1000);
        s.applyStatus(e, Entities.ST_BURN, 2, 10f, 0f);
        run(s, 1.0);
        float lost = e.maxHp - e.hp;
        assertTrue("about 3 ticks of 1.6 in 1 s: " + lost, lost >= 3.1f && lost <= 4.9f);
        run(s, 2.0);
        assertEquals("the burn has run out", 0, e.burn);
        float total = e.maxHp - e.hp;
        assertTrue("about 2.5 s / 0.33 = 7 ticks of 1.6: " + total, total >= 9f && total <= 13f);
        float after = e.hp;
        run(s, 1.0);
        assertEquals(after, e.hp, 0f);
    }

    @Test
    public void electrifyTicksAtItsIntervalAndDropsAStackEachTime() throws Exception {
        Sim s = sim();
        Enemy e = dummy(s, 1000);
        s.applyStatus(e, Entities.ST_ELECTRIFY, 3, 10f, 0f);
        run(s, 1.35);
        assertEquals("no tick before 1.459 s", e.maxHp, e.hp, 0f);
        assertEquals(3, e.elec);
        run(s, 0.3);
        assertEquals("first tick: 3 stacks x 0.5 x 10", e.maxHp - 15f, e.hp, 0.01f);
        assertEquals(2, e.elec);
        run(s, 1.9); // next interval at 2 stacks is 1.708 s
        assertEquals("second tick: 2 x 0.5 x 10", e.maxHp - 25f, e.hp, 0.01f);
        assertEquals(1, e.elec);
        assertTrue("an Electrify zap sounded", s.sound.emitted[SoundEvents.ELECTRIFY_ZAP] > 0);
    }

    @Test
    public void decayDrainsPerSecondAndWeakensAndTimesOut() throws Exception {
        Sim s = sim();
        Enemy e = dummy(s, 1000);
        s.applyStatus(e, Entities.ST_DECAY, 5, 20f, 0f); // 5 x 0.06 x 20 = 6 per second
        run(s, 2.0);
        float lost = e.maxHp - e.hp;
        assertTrue("about 12 in 2 s: " + lost, lost > 10.5f && lost < 13f);
        assertEquals(0.8f, e.dmgMul, 1e-5f);
        run(s, 6.5);
        assertEquals("8 s timeout", 0, e.decay);
        assertEquals(1f, e.dmgMul, 1e-6f);
    }

    @Test
    public void decayLowersTheDamageAnEnemyDeals() throws Exception {
        Sim s = sim();
        s.hp = s.maxHp = 100f;
        Enemy e = s.addEnemy("COLONIST", 0, 0, false);
        e.speed = 0f;
        s.applyStatus(e, Entities.ST_DECAY, 5, 0.01f, 0f); // -20%: the colonist's contact damage times 0.8
        s.update(DT, new Input());
        assertEquals(100f - 0.8f * (float) s.type("COLONIST").def.power, s.hp, 0.05f);
    }

    @Test
    public void statusNumbersAreColouredAndMerged() throws Exception {
        Sim s = sim();
        s.px = 0;
        Enemy e = dummy(s, 1000);
        s.applyStatus(e, Entities.ST_BURN, 8, 100f, 0f); // 64 per tick
        run(s, 1.0);
        int n = 0, burn = 0;
        for (int i = 0; i < Sim.MAX_TEXT; i++) {
            if (s.texts[i].life <= 0) continue;
            n++;
            if (s.texts[i].color == Status.C_BURN) burn++;
        }
        assertTrue("burn numbers: " + burn, burn >= 1 && burn <= 3);
        assertTrue("merged, not one per tick: " + n, n <= 3);
    }

    @Test
    public void killedByAStatusCountsAsAKill() throws Exception {
        Sim s = sim();
        Enemy e = dummy(s, 10);
        s.applyStatus(e, Entities.ST_BURN, 8, 100f, 0f);
        run(s, 1.0);
        assertEquals(1, s.kills);
    }

    @Test
    public void heroBurnsInASlagPoolAndSlowsInFrost() throws Exception {
        Sim s = sim();
        s.hp = s.maxHp = 100f;
        s.ai.addHazard(Entities.HZ_SLAG, 0, 0, 60f, 3f, 8f, 0.5f);
        Input in = new Input();
        for (int i = 0; i < 20; i++) s.update(DT, in); // 0.33 s: still warning
        assertEquals(100f, s.hp, 1e-3f);
        assertEquals(0f, s.heroBurnT, 0f);
        for (int i = 0; i < 90; i++) s.update(DT, in); // 1.5 s more inside the pool
        assertTrue("burning " + s.heroBurnT, s.heroBurnT > 2.5f);
        float lost = 100f - s.hp;
        assertTrue("8/s + 2/s for about 1.2 s: " + lost, lost > 8f && lost < 14f);
        // a frost patch only slows
        Sim f = sim();
        f.ai.addHazard(Entities.HZ_FROST, 0, 0, 60f, 3f, 0f, 0f);
        float x0 = f.px;
        Input right = new Input();
        right.stickX = 1f;
        for (int i = 0; i < 30; i++) f.update(DT, right);
        assertTrue(f.heroSlowT > 1f);
        Sim g = sim();
        for (int i = 0; i < 30; i++) g.update(DT, right);
        assertTrue("slowed " + (f.px - x0) + " vs " + g.px, (f.px - x0) < 0.85f * g.px && (f.px - x0) > 0.6f * g.px);
    }

    @Test
    public void theStatusPassAllocatesNothing() throws Exception {
        Sim s = sim();
        for (int i = 0; i < 200; i++) {
            Enemy e = s.addEnemy("COLONIST", 80 + (i % 20) * 12, -200 + (i / 20) * 40, false);
            e.speed = 0f;
            e.hp = e.maxHp = 1e9f;
        }
        Input in = new Input();
        for (int i = 0; i < 400; i++) { // warm up
            if (i % 50 == 0) applyAll(s);
            s.hp = s.maxHp;
            s.update(DT, in);
        }
        long before = Alloc.bytes();
        int steps = 1200;
        for (int i = 0; i < steps; i++) {
            if (i % 50 == 0) applyAll(s);
            s.hp = s.maxHp;
            s.update(DT, in);
        }
        long bytes = Alloc.bytes() - before;
        assertTrue("allocated " + bytes + " bytes in " + steps + " frames", bytes < steps * 8L);
    }

    private static void applyAll(Sim s) {
        for (int i = 0; i < s.enemyN; i++) {
            Enemy e = s.enemies[i];
            s.applyStatus(e, Entities.ST_BURN, 2, 10f, 0f);
            s.applyStatus(e, Entities.ST_ELECTRIFY, 3, 10f, 0f);
            s.applyStatus(e, Entities.ST_DECAY, 2, 10f, 0f);
            s.applyStatus(e, Entities.ST_FROST, 2, 10f, 0f);
        }
    }
}
