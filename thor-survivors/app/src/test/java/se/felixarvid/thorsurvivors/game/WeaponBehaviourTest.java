package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;
import se.felixarvid.thorsurvivors.game.Entities.Projectile;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

/** Pins the Vampire Survivors weapon behaviours on a stripped-down sim (no waves, stationary dummies). */
public class WeaponBehaviourTest {
    private static final float DT = 1f / 60f;
    private final Input in = new Input();

    /** A sim with one starter weapon at the given level, no wave spawns and no enemies. */
    private Sim sim(String weapon, int level) throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("FOREST"), weapon, new HashMap<String, Double>());
        s.noSpawns = true;
        s.enemyN = 0;
        s.inv.weapons[0].level = level;
        s.recomputeAll();
        s.rng.setSeed(7);
        return s;
    }

    private Enemy dummy(Sim s, float x, float y) {
        Enemy e = s.addEnemy("ZOMBIE", x, y, false);
        e.hp = e.maxHp = 1e5f; // float-exact for small damage numbers
        e.speed = 0;
        return e;
    }

    private void step(Sim s, float seconds) {
        int n = Math.round(seconds / DT);
        for (int i = 0; i < n; i++) {
            s.hp = s.maxHp;
            s.update(DT, in);
        }
    }

    private Projectile first(Sim s, int kind) {
        for (int i = 0; i < s.projN; i++) if (s.projs[i].kind == kind) return s.projs[i];
        return null;
    }

    private int count(Sim s, int kind) {
        int n = 0;
        for (int i = 0; i < s.projN; i++) if (s.projs[i].kind == kind) n++;
        return n;
    }

    @Test
    public void missileFliesStraightAtTheNearestEnemyAndNeverTurns() throws Exception {
        Sim s = sim("MAGIC_MISSILE", 1);
        Enemy near = dummy(s, 300, 0);
        dummy(s, -500, 100);
        Projectile p = null;
        for (int i = 0; i < 120 && p == null; i++) {
            step(s, DT);
            p = first(s, Entities.P_MISSILE);
        }
        assertTrue(p != null);
        float vx = p.vx, vy = p.vy;
        assertTrue("aimed at the nearest enemy (right)", vx > 0 && Math.abs(vy) < 1f);
        near.x = 0; near.y = -300; // moving the target must not bend the shot
        step(s, 0.1f);
        assertEquals(vx, p.vx, 1e-3f);
        assertEquals(vy, p.vy, 1e-3f);
        assertEquals(0f, p.y, 1e-2f);
    }

    @Test
    public void crossReturnsAlongItsLaunchLineAndPassesThePlayer() throws Exception {
        Sim s = sim("CROSS", 1);
        dummy(s, 250, 0);
        Projectile p = null;
        for (int i = 0; i < 120 && p == null; i++) {
            step(s, DT);
            p = first(s, Entities.P_CROSS);
        }
        assertTrue(p != null);
        float maxX = -1e9f, minX = 1e9f, maxAbsY = 0;
        boolean reversed = false;
        while (s.projN > 0 && first(s, Entities.P_CROSS) == p && p.life > 0.05f) {
            step(s, DT);
            maxX = Math.max(maxX, p.x);
            minX = Math.min(minX, p.x);
            maxAbsY = Math.max(maxAbsY, Math.abs(p.y));
            reversed |= p.returning;
        }
        assertTrue("went out", maxX > 150);
        assertTrue("reversed", reversed);
        assertTrue("kept going past the player (x < 0)", minX < -100);
        assertTrue("stayed on the launch line", maxAbsY < 1f);
    }

    @Test
    public void whipHitsOnlyTheFacingSideFirstAndTheOppositeSideSecond() throws Exception {
        Sim s = sim("WHIP", 2); // amount 2
        s.facingRight = true;
        Enemy right = dummy(s, 80, -6);
        Enemy left = dummy(s, -80, -14);
        Enemy far = dummy(s, 260, -6);
        Enemy above = dummy(s, 80, -120);
        step(s, 0.47f); // first strike at 0.4 s
        assertTrue("right side hit", right.hp < right.maxHp);
        assertEquals("opposite side not yet", left.maxHp, left.hp, 0f);
        step(s, 0.2f); // second strike 0.1 s later
        assertTrue("left side hit by the 2nd strike", left.hp < left.maxHp);
        assertEquals(far.maxHp, far.hp, 0f);
        assertEquals(above.maxHp, above.hp, 0f);
        // each enemy was hit once per strike: the right dummy only by strike 1 (<= one crit hit of 20)
        assertTrue(right.maxHp - right.hp <= 20.01f);
    }

    @Test
    public void whipStartsOnTheLeftWhenFacingLeft() throws Exception {
        Sim s = sim("WHIP", 1);
        s.facingRight = false;
        Enemy right = dummy(s, 80, -6);
        Enemy left = dummy(s, -80, -6);
        step(s, 0.5f);
        assertTrue(left.hp < left.maxHp);
        assertEquals(right.maxHp, right.hp, 0f);
    }

    @Test
    public void booksOrbitAtRadiusAndVanishAfterTheirDuration() throws Exception {
        Sim s = sim("HOLYBOOK", 2); // two books, area 1
        step(s, 0.5f);
        assertEquals(2, count(s, Entities.P_BOOK));
        for (int i = 0; i < s.projN; i++) {
            Projectile b = s.projs[i];
            assertEquals(75f, (float) Math.hypot(b.x - s.px, b.y - s.py), 0.5f);
        }
        float a0 = s.projs[0].orbitAngle;
        step(s, 0.2f);
        assertTrue("orbiting", s.projs[0].orbitAngle > a0 + 0.3f);
        step(s, 3.2f); // duration 3 s is over
        assertEquals(0, count(s, Entities.P_BOOK));
        step(s, 2f); // still on cooldown (interval 3 s after the duration)
        assertEquals(0, count(s, Entities.P_BOOK));
        step(s, 2f);
        assertEquals(2, count(s, Entities.P_BOOK));
    }

    @Test
    public void unholyVespersNeverDisappears() throws Exception {
        Sim s = sim("VESPERS", 1);
        step(s, 20f);
        assertEquals(4, count(s, Entities.P_BOOK));
    }

    @Test
    public void lightningStrikesAmountDistinctOnScreenEnemies() throws Exception {
        Sim s = sim("LIGHTNING", 2); // amount 3
        List<Enemy> onScreen = new ArrayList<>();
        for (int i = 0; i < 8; i++) onScreen.add(dummy(s, -350 + i * 100, 150 + (i % 2) * 60));
        List<Enemy> offScreen = new ArrayList<>();
        offScreen.add(dummy(s, 820, 0));
        offScreen.add(dummy(s, -820, 40));
        step(s, 0.47f);
        int hit = 0;
        for (Enemy e : onScreen) if (e.hp < e.maxHp) hit++;
        assertEquals(3, hit);
        for (Enemy e : offScreen) assertEquals(e.maxHp, e.hp, 0f);
    }

    @Test
    public void thunderLoopStrikesEachTargetTwice() throws Exception {
        Sim s = sim("LOOP", 1); // amount 6, power 6.5 -> 65 per strike, no crit
        List<Enemy> es = new ArrayList<>();
        for (int i = 0; i < 8; i++) es.add(dummy(s, -350 + i * 100, 150 + (i % 2) * 60));
        step(s, 0.47f);
        int once = 0;
        for (Enemy e : es) if (Math.abs(e.maxHp - e.hp - 65f) < 0.5f) once++;
        assertEquals(6, once);
        step(s, 0.3f); // second strike ~0.2 s later
        int twice = 0;
        for (Enemy e : es) if (Math.abs(e.maxHp - e.hp - 130f) < 0.5f) twice++;
        assertEquals(6, twice);
    }

    @Test
    public void holyWaterPuddleAppearsAfterTheFlightAndTicksAtHitBoxDelay() throws Exception {
        Sim s = sim("HOLYWATER", 1);
        dummy(s, 400, 400); // far away so it cannot be the target
        Projectile p = null;
        for (int i = 0; i < 120 && p == null; i++) {
            step(s, DT);
            p = first(s, Entities.P_PUDDLE);
        }
        assertTrue(p != null);
        assertEquals(Sim.FLASK_FLIGHT, p.flight, 1e-6f);
        assertEquals(40f, p.radius, 1e-3f);
        Enemy e = dummy(s, p.x, p.y); // stand in the landing spot
        float hp0 = e.hp;
        List<Float> hits = new ArrayList<>();
        float last = hp0;
        float t0 = (float) s.time;
        for (int i = 0; i < 120; i++) {
            step(s, DT);
            if (e.hp < last - 2.5f) hits.add((float) s.time - t0); // the flask's hit, not the Decay it leaves (a fraction of a point every 0.1 s)
            last = e.hp;
        }
        assertFalse(hits.isEmpty());
        assertTrue("no damage while the flask is airborne", hits.get(0) > 0.2f);
        assertTrue("3 ticks in 2 s from the landing: " + hits, hits.size() >= 3 && hits.size() <= 4);
        for (int i = 1; i < hits.size(); i++) assertEquals(0.5f, hits.get(i) - hits.get(i - 1), 0.04f);
    }

    @Test
    public void volleyFiresAmountShotsRepeatIntervalApartAndCooldownRunsFromVolleyStart() throws Exception {
        Sim s = sim("MAGIC_MISSILE", 4); // amount 3, interval 1000 ms, repeat 100 ms
        assertEquals(3, s.weapons[0].amount);
        assertEquals(1.0f, s.weapons[0].interval, 1e-4f);
        List<Float> shots = new ArrayList<>();
        int prev = 0;
        for (int i = 0; i < 88; i++) { // ~1.47 s
            step(s, DT);
            if (s.projN > prev) for (int k = prev; k < s.projN; k++) shots.add((float) s.time);
            prev = s.projN;
        }
        assertEquals("3 shots in the first volley + the 1st of the next: " + shots, 4, shots.size());
        assertEquals(0.4f, shots.get(0), 0.03f);
        assertEquals(0.1f, shots.get(1) - shots.get(0), 0.03f);
        assertEquals(0.1f, shots.get(2) - shots.get(1), 0.03f);
        assertEquals("next volley starts one interval after the previous volley started", 1.4f, shots.get(3), 0.03f);
    }

    @Test
    public void knockbackPushesAndBrieflyStaggersTheEnemy() throws Exception {
        Sim s = sim("WHIP", 1);
        s.px = 0;
        Enemy e = s.addEnemy("ZOMBIE", 200, 0, false);
        e.hp = e.maxHp = 1e5f; // float-exact for small damage numbers
        e.speed = 100f;
        s.hurt(e, 1f, 0, 1, 1f, 0, 1f);
        assertTrue("stagger " + e.stagger, e.stagger >= 0.1f && e.stagger <= 0.2f);
        s.weapons[0].cd = 99f; // keep the whip out of the way
        step(s, 0.1f);
        assertTrue("pushed away and not advancing during the stagger: " + e.x, e.x > 200f);
        step(s, 0.5f);
        assertEquals(0f, Math.max(0f, e.stagger), 0f);
        float x = e.x;
        step(s, 0.5f);
        assertTrue("advances again after the stagger", e.x < x - 20f);
    }

    @Test
    public void bossesBarelyMoveWhenHit() throws Exception {
        Sim s = sim("WHIP", 1);
        s.weapons[0].cd = 99f;
        Enemy boss = s.addEnemy("ZOMBIE", 200, 0, true);
        boss.hp = boss.maxHp = 1e5f;
        boss.speed = 0;
        s.hurt(boss, 1f, 0, 1, 1f, 0, 1f);
        step(s, 0.6f);
        assertEquals(0f, boss.stagger, 0f);
        assertTrue("moved " + (boss.x - 200), boss.x - 200f < 5f);
    }

    @Test
    public void separationKeepsStackedEnemiesApart() throws Exception {
        Sim s = sim("WHIP", 1);
        s.weapons[0].cd = 99f;
        Enemy a = dummy(s, 300, 0);
        Enemy b = dummy(s, 300, 0); // exactly stacked
        Enemy c = dummy(s, 300.5f, 0);
        step(s, 0.5f);
        float min = (a.radius + b.radius) * 0.79f; // the target spacing is 0.8 x (r1 + r2)
        assertTrue(Math.hypot(a.x - b.x, a.y - b.y) > min);
        assertTrue(Math.hypot(a.x - c.x, a.y - c.y) > min);
        assertTrue(Math.hypot(b.x - c.x, b.y - c.y) > min);
    }

    @Test
    public void facingSnapsToEightDirectionsAndSticksWhenStanding() throws Exception {
        Sim s = sim("KNIFE", 1);
        in.stickX = 1f;
        in.stickY = 0.4f; // ~21.8 degrees -> snaps to 0
        step(s, 0.1f);
        assertEquals(1f, s.faceX, 1e-3f);
        assertEquals(0f, s.faceY, 1e-3f);
        in.stickX = 0.7f;
        in.stickY = 0.7f;
        step(s, 0.1f);
        assertEquals(0.7071f, s.faceX, 1e-3f);
        assertEquals(0.7071f, s.faceY, 1e-3f);
        in.stickX = 0;
        in.stickY = 0;
        step(s, 0.1f);
        assertEquals(0.7071f, s.faceX, 1e-3f);
        in.clearMovement();
    }

    @Test
    public void knivesFlyInTheFacingDirection() throws Exception {
        Sim s = sim("KNIFE", 1);
        in.stickX = 0.7f;
        in.stickY = -0.7f;
        step(s, 0.3f);
        in.clearMovement();
        s.weapons[0].cd = 0f;
        Projectile k = null;
        for (int i = 0; i < 20 && k == null; i++) {
            step(s, DT);
            k = first(s, Entities.P_KNIFE);
        }
        assertTrue(k != null);
        assertTrue(k.vx > 0 && k.vy < 0);
        assertEquals(1f, Math.abs(k.vx / k.vy), 0.25f);
    }

    @Test
    public void axeArcsDownAndLeavesTheScreenAtTheBottom() throws Exception {
        Sim s = sim("AXE", 1);
        Projectile a = null;
        for (int i = 0; i < 120 && a == null; i++) {
            step(s, DT);
            a = first(s, Entities.P_AXE);
        }
        assertTrue(a != null);
        assertTrue("thrown upward", a.vy < 0);
        step(s, 3f);
        assertEquals("fell off the bottom", 0, count(s, Entities.P_AXE));
    }

    @Test
    public void deathSpiralShootsEvenlySpacedSpokes() throws Exception {
        Sim s = sim("SCYTHE", 1); // amount 9
        List<Float> ang = new ArrayList<>();
        int prev = 0;
        for (int i = 0; i < 80; i++) {
            step(s, DT);
            while (prev < s.projN) {
                Projectile p = s.projs[prev++];
                if (p.kind == Entities.P_AXE) ang.add((float) Math.atan2(p.vy, p.vx));
            }
        }
        assertEquals(9, ang.size());
        java.util.Collections.sort(ang);
        for (int i = 1; i < ang.size(); i++) assertEquals(2 * Math.PI / 9, ang.get(i) - ang.get(i - 1), 0.05);
    }

    @Test
    public void garlicHitsOnlyInsideItsAuraAndLowersKnockbackResistance() throws Exception {
        Sim s = sim("GARLIC", 1);
        Enemy in1 = dummy(s, 40, 0);
        Enemy out = dummy(s, 120, 0);
        assertEquals(50f, s.weapons[0].auraRadius, 1e-3f);
        float kb0 = in1.kbMul;
        step(s, 1.0f);
        assertTrue(in1.hp < in1.maxHp);
        assertEquals(out.maxHp, out.hp, 0f);
        assertTrue(in1.kbMul > kb0);
    }

    @Test
    public void fireballUsesAnOnScreenTargetAndHellfirePierces() throws Exception {
        Sim s = sim("FIREBALL", 1);
        dummy(s, 0, -250);
        Projectile p = null;
        for (int i = 0; i < 120 && p == null; i++) {
            step(s, DT);
            p = first(s, Entities.P_FIRE);
        }
        assertTrue(p != null);
        assertTrue(p.vy < 0 && Math.abs(p.vx) < 0.3f * Math.abs(p.vy));
        Sim h = sim("HELLFIRE", 1);
        dummy(h, 0, -250);
        Projectile q = null;
        for (int i = 0; i < 120 && q == null; i++) {
            step(h, DT);
            q = first(h, Entities.P_FIRE);
        }
        assertTrue(q != null && q.hitsLeft > 1000);
    }

    @Test
    public void allThirteenPassivesChangeTheStats() throws Exception {
        GameData d = TestData.load();
        String[] keys = {"POWER", "ARMOR", "MAXHEALTH", "REGEN", "COOLDOWN", "AREA", "SPEED", "DURATION", "AMOUNT",
                "MOVESPEED", "MAGNET", "LUCK", "GROWTH"};
        PlayerStats base = PlayerStats.compute(new Inventory(), new HashMap<String, Double>(), 0);
        for (String k : keys) {
            Inventory inv = new Inventory();
            assertTrue(k, inv.add(d.weapons.get(k)));
            PlayerStats p = PlayerStats.compute(inv, new HashMap<String, Double>(), 0);
            double a = base.might + base.armor + base.maxHpMul + base.regen + base.cooldownMul + base.areaMul + base.speedMul
                    + base.durationMul + base.amountBonus + base.moveSpeedMul + base.magnetMul + base.luck + base.growthMul;
            double b = p.might + p.armor + p.maxHpMul + p.regen + p.cooldownMul + p.areaMul + p.speedMul
                    + p.durationMul + p.amountBonus + p.moveSpeedMul + p.magnetMul + p.luck + p.growthMul;
            assertTrue(k + " has no effect", Math.abs(a - b) > 1e-9);
        }
    }

    @Test
    public void passivesFeedIntoWeaponStatsOnRecompute() throws Exception {
        GameData d = TestData.load();
        Sim s = sim("MAGIC_MISSILE", 1);
        float dmg = s.weapons[0].dmg, area = s.weapons[0].area, interval = s.weapons[0].interval;
        int amount = s.weapons[0].amount;
        float speed = s.weapons[0].speed, dur = s.weapons[0].duration;
        for (String k : new String[]{"POWER", "AREA", "COOLDOWN", "AMOUNT", "SPEED", "DURATION"}) s.inv.add(d.weapons.get(k));
        s.recomputeAll();
        assertTrue(s.weapons[0].dmg > dmg);
        assertTrue(s.weapons[0].area > area);
        assertTrue(s.weapons[0].interval < interval);
        assertEquals(amount + 1, s.weapons[0].amount);
        assertTrue(s.weapons[0].speed > speed);
        assertTrue(s.weapons[0].duration > dur);
    }

    @Test
    public void farBehindEnemiesAreRecycledAheadOfThePlayer() throws Exception {
        Sim s = sim("WHIP", 1);
        s.weapons[0].cd = 99f;
        Enemy e = dummy(s, -1100, 0); // far to the left
        step(s, DT);
        assertTrue("moved to the right edge: " + e.x, e.x > 500f);
        assertTrue(Math.abs(e.y) < 450f);
    }

    private int liveTexts(Sim s) {
        int n = 0;
        for (int i = 0; i < Sim.MAX_TEXT; i++) if (s.texts[i].life > 0) n++;
        return n;
    }

    @Test
    public void damageNumbersAddUpPerEnemyAndLiveHalfASecond() throws Exception {
        Sim s = sim("WHIP", 1);
        s.weapons[0].cd = 99f;
        Enemy a = dummy(s, 300, 0), b = dummy(s, 300, 200);
        for (int i = 0; i < 5; i++) { // five hits within 0.2 s on one enemy: one number, summed
            s.hurt(a, 10f, 0, 1, 0, 0, 0);
            step(s, 0.04f);
        }
        assertEquals(1, liveTexts(s));
        s.hurt(b, 7f, 0, 1, 0, 0, 0);
        assertEquals("a different enemy gets its own number", 2, liveTexts(s));
        Entities.DamageText t = null;
        for (int i = 0; i < Sim.MAX_TEXT; i++) if (s.texts[i].life > 0 && s.texts[i].owner == a.id) t = s.texts[i];
        assertEquals("50", new String(t.digits, 0, t.len));
        assertEquals(Sim.TEXT_LIFE, t.maxLife, 1e-6f);
        step(s, 0.2f); // 0.4 s after the first hit: outside the 0.3 s window
        s.hurt(a, 10f, 0, 1, 0, 0, 0);
        assertEquals("a late hit starts a new number", 3, liveTexts(s));
        step(s, 0.6f);
        assertEquals("numbers are gone after their short life", 0, liveTexts(s));
    }

    @Test
    public void lightningBoltIsShortLivedAndItsHitsDoNotTurnTheEnemyWhite() throws Exception {
        Sim s = sim("LIGHTNING", 1);
        Enemy e = dummy(s, 150, -50);
        Enemy w = dummy(s, 160, 150); // hit by something else: the normal white flash is untouched
        s.hurt(w, 1f, 0, 1, 0, 0, 0);
        assertFalse(w.softFlash);
        for (int i = 0; i < 120 && !e.softFlash; i++) step(s, DT);
        assertTrue("struck enemy shows the soft flash", e.softFlash);
        int bolts = 0;
        for (int i = 0; i < Sim.MAX_FX; i++) {
            if (s.fx[i].life > 0 && s.fx[i].kind == Entities.FX_BOLT) {
                bolts++;
                assertEquals(0.12f, s.fx[i].maxLife, 1e-6f);
            }
        }
        assertTrue(bolts >= 1);
        step(s, 0.2f);
        for (int i = 0; i < Sim.MAX_FX; i++) assertFalse("bolt gone after ~0.12 s", s.fx[i].life > 0 && s.fx[i].kind == Entities.FX_BOLT);
    }

    @Test
    public void viewIsZoomedInAndSpawnsStayJustOutsideIt() throws Exception {
        assertEquals(560f, Sim.VIEW_H, 0f);
        Sim s = sim("WHIP", 1);
        s.noSpawns = false;
        s.weapons[0].cd = 99f;
        float halfW = Sim.VIEW_H * 16f / 9f / 2f, halfH = Sim.VIEW_H / 2f;
        s.time = 60; // a wave row with regular spawns
        for (int i = 0; i < 600; i++) step(s, DT);
        assertTrue(s.enemyN > 5);
        for (int i = 0; i < s.enemyN; i++) {
            Enemy e = s.enemies[i];
            assertTrue("spawned/recycled within reach of the view: " + e.x + "," + e.y,
                    Math.abs(e.x - s.px) < halfW * 1.7f && Math.abs(e.y - s.py) < halfH * 2.6f);
        }
    }

    @Test
    public void aScytheHitsEachEnemyOnceEvenThroughACrowdOfSixty() throws Exception {
        Sim s = sim("SCYTHE", 1);
        for (int i = 0; i < 80 && count(s, Entities.P_AXE) < 9; i++) step(s, DT); // let the whole volley out
        Projectile p = first(s, Entities.P_AXE);
        assertTrue(p != null);
        for (int i = 0; i < s.projN; i++) { // keep only this spoke, in slot 0
            if (s.projs[i] == p) {
                s.projs[i] = s.projs[0];
                s.projs[0] = p;
            }
        }
        s.projN = 1;
        p.critChance = 0f;
        s.weapons[0].cd = 1e9f; // no further volleys
        p.radius = 150f; // wide enough to cover the whole crowd on every step of the pass
        List<Enemy> crowd = new ArrayList<>();
        for (int i = 0; i < 60; i++) crowd.add(dummy(s, p.x + (i % 10 - 4.5f) * 18f, p.y + (i / 10 - 2.5f) * 18f));
        step(s, 2.5f);
        int i = 0;
        for (Enemy e : crowd) {
            assertEquals("enemy " + i++ + " hit exactly once", p.dmg, e.maxHp - e.hp, 1e-2f);
        }
    }
}
