package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.EnemyDef;
import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;
import se.felixarvid.thorsurvivors.game.Entities.Hazard;

import java.util.HashMap;

/**
 * Design phase 9, elites and champions (design section 5): the schedule (first at 3:00, one every 150 s less 1% per
 * minute, one alive), the stat changes, the one to three modifiers by time, what each modifier does, and the reward.
 */
public class EliteTest {
    private static final float DT = 1f / 60f;

    private static Sim sim(String stage, long seed) throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get(stage), null, new HashMap<String, Double>(), null, seed); // no hero: no hammer clearing the scene
        s.noSpawns = true;
        s.enemyN = 0;
        return s;
    }

    private static void run(Sim s, double seconds) {
        Input in = new Input();
        for (int i = 0, n = (int) Math.round(seconds / DT); i < n; i++) {
            s.hp = s.maxHp;
            s.update(DT, in);
        }
    }

    private static int count(Sim s, int kind, int variant) {
        int n = 0;
        for (int i = 0; i < s.hazN; i++) if (s.hazards[i].kind == kind && (variant < 0 || s.hazards[i].variant == variant)) n++;
        return n;
    }

    // ------------------------------------------------------------------ the schedule

    /** 30 minutes headless on both stages: the first elite at 3:00 and one every 150 s less 1% per minute (floor 100 s). */
    @Test
    public void oneEliteEveryHundredAndTwentyFiveSecondsShrinkingOnePercentAMinute() throws Exception {
        GameData d = TestData.load();
        for (String stage : new String[]{"FLATS", "MINES"}) {
            StageSoak.Result r = StageSoak.run(stage, "BASTION", "immortal", 3, 1800);
            assertEquals(r.toString(), 0, r.nan);
            assertTrue("first elite at 3:00 +-10 s: " + r.eliteAt, Math.abs(r.eliteAt.get(0) - 180) <= 10);
            for (int i = 1; i < r.eliteAt.size(); i++) {
                double gap = r.eliteAt.get(i) - r.eliteAt.get(i - 1);
                double want = Elites.interval(d, r.eliteAt.get(i - 1));
                assertTrue(stage + " gap " + gap + " wanted " + want + " +-10 s", Math.abs(gap - want) <= 10.0);
                assertTrue("never over 125 s + 10 s, never under the 90 s floor - 10 s: " + gap, gap <= 135 && gap >= 80);
            }
            // 180, then 120 s shrinking to 100 s at the end: 15 to 17 elites in 30 minutes (phase 12: 125 s, floor 90 s)
            assertTrue(stage + " elites " + r.eliteAt.size(), r.eliteAt.size() >= 15 && r.eliteAt.size() <= 18);
            assertTrue("they die too: " + r.eliteKilled, r.eliteKilled >= r.eliteAt.size() - 2);
        }
    }

    @Test
    public void theIntervalShrinksOnePercentAMinuteDownToTheFloor() throws Exception {
        GameData d = TestData.load();
        assertEquals(125f, Elites.interval(d, 0), 1e-3f);
        assertEquals(112.5f, Elites.interval(d, 600), 1e-3f);
        assertEquals("125 x 0.7 = 87.5 is under the floor", 90f, Elites.interval(d, 1800), 1e-3f);
        assertEquals(100f, Elites.interval(d, 1200), 1e-3f);
        assertEquals("the floor", 90f, Elites.interval(d, 6000), 1e-3f);
    }

    @Test
    public void noElitesBeforeThreeMinutesAndOnlyOneAtATime() throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("FLATS"), null, new HashMap<String, Double>(), "BASTION", 4);
        run(s, 170);
        assertEquals(0, s.eliteSpawned);
        run(s, 15);
        assertEquals("the first one at 3:00", 1, s.eliteSpawned);
        Enemy first = s.eliteNow;
        assertNotNull(first);
        // freeze the schedule's next slot into the past while it still lives: no second elite until it dies
        s.nextEliteAt = (float) s.time;
        s.noSpawns = false;
        for (int i = 0; i < 600; i++) {
            if (first.dead || !first.elite) break;
            first.hp = first.maxHp; // keep it alive
            s.hp = s.maxHp;
            s.update(DT, new Input());
            int alive = 0;
            for (int k = 0; k < s.enemyN; k++) if (s.enemies[k].elite && !s.enemies[k].dead) alive++;
            assertTrue("at most one elite alive, saw " + alive, alive <= 1);
        }
        assertEquals(1, s.eliteSpawned);
        // it dies: the next one comes (the schedule was overdue)
        first.hp = 0;
        s.killNow(first);
        run(s, 1);
        assertTrue("the overdue elite arrives once the first is dead: " + s.eliteSpawned, s.eliteSpawned >= 2);
    }

    @Test
    public void anEliteIsPickedFromTheCurrentWaveRowAndSpawns400UnitsAway() throws Exception {
        GameData d = TestData.load();
        for (long seed = 1; seed <= 12; seed++) {
            Sim s = new Sim(d, d.stages.get("FLATS"), null, new HashMap<String, Double>(), "BASTION", seed);
            s.time = 9 * 60 + 20; // row 9: COLONIST, WELDER, SECURITY_DRONE
            s.nextEliteAt = (float) s.time;
            s.enemyN = 0;
            s.px = 500;
            s.py = -300;
            s.update(DT, new Input());
            Enemy e = s.eliteNow;
            assertNotNull(e);
            String k = e.type.def.key;
            assertTrue("from the row: " + k, k.equals("COLONIST") || k.equals("WELDER") || k.equals("SECURITY_DRONE"));
            assertEquals("400 units from the hero", 400.0, Math.hypot(e.x - s.px, e.y - s.py), 25.0);
        }
    }

    // ------------------------------------------------------------------ stats

    @Test
    public void anEliteHasSixTimesTheHpOneAndAHalfTheDamageAndIsAFlaggedSlot() throws Exception {
        Sim s = sim("FLATS", 5);
        Enemy plain = s.addEnemy("SERGEANT", 600, 0, false);
        Enemy e = s.spawnEliteForTest("SERGEANT", 0);
        assertNotNull(e);
        assertTrue(e.elite);
        assertFalse(e.boss);
        assertEquals(plain.maxHp * 6f, e.maxHp, 0.01f);
        assertEquals(plain.power * 1.5f, e.power, 1e-4f);
        assertEquals(plain.speed * 0.9f, e.speed, 1e-4f);
        assertEquals(plain.radius * 1.4f, e.radius, 1e-3f);
        assertEquals(plain.xp * 4f, e.xp, 1e-4f);
        assertEquals("shots hit 1.5 times as hard", 1.5f, e.shotMul, 1e-6f);
        assertEquals("six adds came with it", 1 + 1 + 6, s.enemyN);
        assertEquals(1, s.sound.emitted[SoundEvents.ELITE_SPAWN]);
        // it lives in the ordinary enemy pool: same record class, no extra array
        assertTrue(s.enemies.length == Sim.MAX_ENEMIES);
    }

    // ------------------------------------------------------------------ modifiers

    @Test
    public void oneModifierToTwelveMinutesTwoAfterThatThreeAfterTwentyFour() throws Exception {
        GameData d = TestData.load();
        assertEquals(1, Elites.modCount(d, 3 * 60));
        assertEquals(1, Elites.modCount(d, 12 * 60 - 1));
        assertEquals(2, Elites.modCount(d, 12 * 60));
        assertEquals(2, Elites.modCount(d, 24 * 60 - 1));
        assertEquals(3, Elites.modCount(d, 24 * 60));
        java.util.Random rng = new java.util.Random(7);
        int seen = 0;
        for (int i = 0; i < 300; i++) {
            int m = Elites.roll(rng, 3);
            assertEquals("three distinct modifiers", 3, Elites.bits(m));
            seen |= m;
        }
        assertEquals("all six are in the pool", 63, seen);
        // and the scheduler uses it
        for (int[] c : new int[][]{{200, 1}, {800, 2}, {1500, 3}}) {
            Sim s = sim("FLATS", c[0]);
            s.noSpawns = false;
            s.time = c[0];
            s.nextEliteAt = c[0];
            s.update(DT, new Input());
            assertNotNull(s.eliteNow);
            assertEquals("modifiers at " + c[0] + " s", c[1], Elites.bits(s.eliteNow.mods));
        }
    }

    @Test
    public void firewalkerLeavesAFirePatchEvery45Units() throws Exception {
        Sim s = sim("FLATS", 11);
        s.px = 700;
        s.py = 0; // it walks toward the hero
        Enemy e = s.spawnEliteForTest("COLONIST", Elites.M_FIRE);
        e.x = 0;
        e.y = 0;
        s.enemyN = 1;
        float x0 = e.x;
        run(s, 2.8); // the patches burn for 3 s: all of them are still there
        int fire = count(s, Entities.HZ_SLAG, -1);
        float walked = Math.abs(e.x - x0);
        assertTrue("walked " + walked, walked > 100f && walked < 600f);
        assertTrue("a patch for every 45 units walked (" + fire + " for " + walked + ")", fire >= (int) (walked / 45f) - 1 && fire >= 3);
        // the patches burn the hero (Burn) when it stands in one
        Hazard h = null;
        for (int i = 0; i < s.hazN; i++) if (s.hazards[i].kind == Entities.HZ_SLAG) h = s.hazards[i];
        assertNotNull(h);
        s.px = h.x;
        s.py = h.y;
        h.life = 3f;
        s.hp = s.maxHp;
        s.update(DT, new Input());
        assertTrue("burning", s.heroBurnT > 0f);
    }

    @Test
    public void frostwalkerLeavesFrostPatchesThatSlowTheHero() throws Exception {
        Sim s = sim("FLATS", 12);
        s.px = 700;
        s.py = 0;
        Enemy e = s.spawnEliteForTest("COLONIST", Elites.M_FROST);
        e.x = 0;
        e.y = 0;
        s.enemyN = 1;
        run(s, 5);
        assertTrue("frost patches: " + count(s, Entities.HZ_FROST, -1), count(s, Entities.HZ_FROST, -1) >= 3);
        Hazard h = null;
        for (int i = 0; i < s.hazN; i++) if (s.hazards[i].kind == Entities.HZ_FROST) h = s.hazards[i];
        s.px = h.x;
        s.py = h.y;
        s.update(DT, new Input());
        assertTrue("slowed", s.heroSlowT > 0f);
    }

    @Test
    public void barrageFiresThreeBoltsInAnEightyDegreeFan() throws Exception {
        Sim s = sim("FLATS", 13);
        Enemy e = s.spawnEliteForTest("COLONIST", Elites.M_BARRAGE);
        e.x = 200;
        e.y = 0;
        e.speed = 0;
        s.enemyN = 1;
        e.mt0 = 0.01f;
        run(s, 0.1);
        assertEquals(3, s.eprojN);
        double lo = 9, hi = -9, base = Math.atan2(s.py - e.y, s.px - e.x);
        for (int i = 0; i < 3; i++) {
            Entities.EProj p = s.eprojs[i];
            double a = Math.atan2(Math.sin(Math.atan2(p.vy, p.vx) - base), Math.cos(Math.atan2(p.vy, p.vx) - base)); // relative to the aim
            lo = Math.min(lo, a);
            hi = Math.max(hi, a);
            assertEquals("elite shots hit 1.5x", 9f * 1.5f, p.dmg, 0.01f);
        }
        assertEquals("an 80 degree fan", Math.toRadians(80), hi - lo, 0.05);
        run(s, 3.2);
        assertTrue("again every 3 s: " + s.eprojN, s.eprojN >= 3 && s.sound.emitted[SoundEvents.SERGEANT_BURST] >= 2);
    }

    @Test
    public void volcanoLobsThreeBombsWithWarnRingsThenBlasts() throws Exception {
        Sim s = sim("FLATS", 14);
        Enemy e = s.spawnEliteForTest("COLONIST", Elites.M_VOLCANO);
        e.x = 300;
        e.y = 0;
        e.speed = 0;
        s.enemyN = 1;
        e.mt1 = 0.01f;
        run(s, 0.1);
        assertEquals("three bombs", 3, count(s, Entities.HZ_BOMB, Entities.BV_VOLCANO));
        for (int i = 0; i < s.hazN; i++) assertTrue("a warn ring first", s.hazards[i].warn > 0f);
        // the first lands on the hero: standing still costs HP, walking out of the ring costs none
        float before = s.hp;
        Input in = new Input();
        for (int i = 0; i < 90; i++) {
            s.hp = Math.min(s.hp, before); // no regen noise
            s.update(DT, in);
        }
        assertTrue("the blast hit the hero: " + s.hp + " of " + before, s.hp < before - 5f);
        Sim t = sim("FLATS", 15);
        Enemy e2 = t.spawnEliteForTest("COLONIST", Elites.M_VOLCANO);
        e2.x = 300;
        e2.speed = 0;
        t.enemyN = 1;
        e2.mt1 = 0.01f;
        run(t, 0.1);
        t.px = 700; // out of every ring
        t.py = 0;
        float hp0 = t.hp;
        for (int i = 0; i < 90; i++) t.update(DT, in);
        assertEquals("nothing hit a hero who stepped away", hp0, t.hp, 0.01f);
    }

    @Test
    public void raiserRaisesFourColonistsEveryTenSeconds() throws Exception {
        Sim s = sim("FLATS", 16);
        Enemy e = s.spawnEliteForTest("COLONIST", Elites.M_RAISER);
        e.x = 900;
        e.speed = 0;
        s.enemyN = 1 + 6; // the adds stay
        for (int i = 1; i < s.enemyN; i++) s.enemies[i].speed = 0;
        int before = s.enemyN;
        e.mt2 = 0.01f;
        run(s, 0.1);
        assertEquals(before + 4, s.enemyN);
        run(s, 9.5);
        assertEquals("not again before 10 s", before + 4, s.enemyN);
        run(s, 1);
        assertEquals(before + 8, s.enemyN);
    }

    @Test
    public void armoredTakesThreeOffEveryHitAndIsNeverKnockedBack() throws Exception {
        Sim s = sim("FLATS", 17);
        Enemy e = s.spawnEliteForTest("COLONIST", Elites.M_ARMORED);
        Enemy plain = s.addEnemy("COLONIST", 0, 0, false);
        assertEquals(3f, e.armor, 0f);
        assertEquals(0f, e.kbMul, 0f);
        float hp = e.hp;
        s.hurt(e, 20f, 0, 1, 1, 0, 1f);
        assertEquals("17 of 20 gets through", hp - 17f, e.hp, 1e-3f);
        hp = e.hp;
        s.hurt(e, 2f, 0, 1, 1, 0, 1f);
        assertEquals("a weak hit is not erased: 40% at least", hp - 0.8f, e.hp, 1e-3f);
        assertEquals(0f, e.kvx, 0f);
        s.hurt(plain, 20f, 0, 1, 1, 0, 1f);
        assertTrue("a plain enemy is pushed", plain.kvx > 0f);
    }

    // ------------------------------------------------------------------ the reward

    @Test
    public void aKilledEliteDropsOneItemAndAPileOfGems() throws Exception {
        Sim s = sim("FLATS", 18);
        s.time = 600;
        Enemy e = s.spawnEliteForTest("COLONIST", 0);
        e.x = s.px + 300;
        s.enemyN = 1; // no adds in the way
        int pickBefore = s.pickN;
        s.killNow(e);
        s.update(DT, new Input());
        int crates = 0, gems = 0;
        float gemXp = 0;
        for (int i = 0; i < s.pickN; i++) {
            Entities.Pickup p = s.picks[i];
            if (p.kind == Entities.K_EQUIP) crates++;
            if (p.kind == Entities.K_GEM) {
                gems++;
                gemXp += p.value;
            }
        }
        assertEquals("exactly one equipment drop", 1, crates);
        assertTrue("a pile of gems: " + gems, gems >= 5);
        assertTrue("worth about 0.7 levels of XP: " + gemXp, gemXp >= s.xpNeed * 0.6f);
        assertEquals(1, s.sound.emitted[SoundEvents.ELITE_DIE]);
        assertEquals(1, s.sound.emitted[SoundEvents.EQUIP_DROP]);
        assertEquals(1, s.eliteKilled);
        assertNull("nothing left to watch", s.eliteNow == null || s.eliteNow.dead ? null : s.eliteNow);
    }

    @Test
    public void eliteEnemyTypesKeepTheirArchetypeBehaviour() throws Exception {
        Sim s = sim("FLATS", 19);
        Enemy e = s.spawnEliteForTest("SERGEANT", Elites.M_ARMORED);
        s.enemyN = 1;
        e.x = 160;
        e.y = 0;
        e.actT = 0f;
        assertEquals(EnemyDef.ARCH_RANGED, e.type.arch);
        run(s, 4);
        assertTrue("it still shoots bolts like a sergeant", s.sound.emitted[SoundEvents.SERGEANT_BURST] >= 1);
    }
}
