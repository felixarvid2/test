package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.BranchDef;
import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.data.MainWeaponDef;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;
import se.felixarvid.thorsurvivors.game.Entities.Projectile;

import java.util.HashMap;
import java.util.Map;

/** Heroes, main weapons, aim and dodge (design phase 3): small deterministic scenes with stationary 1e6-HP dummies. */
public class MainWeaponTest {
    private static final float DT = 1f / 60f, BIG = 1e6f;
    private static final double DEG = Math.PI / 180.0;

    private final Input in = new Input();

    private Sim run(String hero, Map<String, Double> meta) throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("FOREST"), null, meta, hero);
        s.rng.setSeed(1);
        s.noSpawnsForTest();
        s.enemyN = 0;
        return s;
    }

    private Sim run(String hero) throws Exception {
        return run(hero, new HashMap<>());
    }

    /** A stationary dummy at (x, y) relative to the player at the origin. */
    private static Enemy dummy(Sim s, float x, float y) {
        Enemy e = s.addEnemy("ZOMBIE", x, y, false);
        e.hp = e.maxHp = BIG;
        e.speed = 0f;
        e.power = 0f;
        return e;
    }

    private static Enemy polar(Sim s, float dist, double deg) {
        return dummy(s, (float) (Math.cos(deg * DEG) * dist), (float) (Math.sin(deg * DEG) * dist));
    }

    private void stepUntilCount(Sim s, int count) {
        for (int i = 0; i < 600 && s.main.count < count; i++) s.update(DT, in);
        assertEquals(count, s.main.count);
    }

    private static boolean hit(Enemy e) {
        return e.hp < BIG;
    }

    // ------------------------------------------------------------------ data

    @Test
    public void dataDefinesThreeHeroesWithFourBranchesOfThreeTiers() throws Exception {
        GameData d = TestData.load();
        assertEquals(3, d.heroes.size());
        for (String h : GameData.HERO_ORDER) {
            MainWeaponDef mw = d.mainWeapons.get(d.heroes.get(h).main);
            assertNotNull(h, mw);
            assertEquals(h, MainWeaponDef.BRANCHES, mw.branches.size());
            for (BranchDef b : mw.branches) assertEquals(b.id, BranchDef.TIERS, b.tiers.length);
        }
    }

    @Test
    public void everyTierModIsAKnownParameter() throws Exception {
        GameData d = TestData.load();
        for (MainWeaponDef mw : d.mainWeapons.values()) {
            for (BranchDef b : mw.branches) {
                for (BranchDef.Tier t : b.tiers) {
                    for (String k : t.mods.keySet()) {
                        assertTrue(mw.key + "/" + b.id + " mod " + k, mw.params.containsKey(k) || k.equals("interval") || k.equals("critMul"));
                    }
                }
            }
        }
    }

    // ------------------------------------------------------------------ hero stats

    @Test
    public void heroBaseStatsReplaceTheDefaults() throws Exception {
        Sim b = run("BASTION"), p = run("SPECTRE"), x = run("XENOMANT");
        assertEquals(130f, b.maxHp, 0.01f);
        assertEquals(105f, p.maxHp, 0.01f); // phase 12: 80 -> 105
        assertEquals(95f, x.maxHp, 0.01f);
        assertEquals(1.0, b.stats.armor, 1e-9);
        assertEquals(0.3, b.stats.regen, 1e-9);
        assertEquals(0.5, p.stats.regen, 1e-9);
        assertEquals(1.0, p.stats.armor, 1e-9);
        assertEquals(0.2, x.stats.regen, 1e-9);
        assertEquals(0.92, b.stats.moveSpeedMul, 1e-9);
        assertEquals(1.10, p.stats.moveSpeedMul, 1e-9);
        assertEquals(0.05, b.stats.critChance, 1e-9);
        assertEquals(0.15, p.stats.critChance, 1e-9);
        assertEquals(2.0, p.stats.critMul, 1e-9);
        assertNotNull(b.main);
        // without a hero the plain VS player: 100 HP, no main weapon
        GameData d = TestData.load();
        Sim plain = new Sim(d, d.stages.get("FOREST"), "WHIP", new HashMap<>());
        assertEquals(100f, plain.maxHp, 0.01f);
        assertEquals(null, plain.main);
    }

    @Test
    public void heroGrowsPerLevel() throws Exception {
        Sim b = run("BASTION");
        b.level = 11;
        b.recomputeAll();
        assertEquals(1.10, b.stats.might, 1e-9);
        assertEquals(143f, b.maxHp, 0.01f);
        Sim p = run("SPECTRE");
        p.level = 11;
        p.recomputeAll();
        assertEquals(0.25, p.stats.critChance, 1e-9);
        assertEquals(1.10 * 1.05, p.stats.moveSpeedMul, 1e-9);
        Sim x = run("XENOMANT");
        x.level = 11;
        x.recomputeAll();
        assertEquals(1.10, x.stats.areaMul, 1e-9);
        assertEquals(1.10, x.stats.magnetMul, 1e-9);
    }

    // ------------------------------------------------------------------ aim

    @Test
    public void aimFallsBackToTheFacingDirection() throws Exception {
        Sim s = run("BASTION");
        in.stickY = -1f; // walk up: faces up
        s.update(DT, in);
        in.stickY = 0f;
        s.update(DT, in);
        assertFalse(s.aimActive);
        assertEquals(0f, s.aimX, 1e-4f);
        assertEquals(-1f, s.aimY, 1e-4f);
        in.aimStickX = 1f; // right stick overrides
        s.update(DT, in);
        assertTrue(s.aimActive);
        assertEquals(1f, s.aimX, 1e-4f);
        assertEquals(0f, s.aimY, 1e-4f);
        in.aimStickX = 0f;
        in.aLeft = true; // arrow keys aim too
        s.update(DT, in);
        assertTrue(s.aimActive);
        assertEquals(-1f, s.aimX, 1e-4f);
        in.aLeft = false;
        in.aimTouchY = 0.6f; // touch aim area
        s.update(DT, in);
        assertTrue(s.aimActive);
        assertEquals(1f, s.aimY, 1e-4f);
        in.aimTouchY = 0.1f; // below the minimum: no aim
        s.update(DT, in);
        assertFalse(s.aimActive);
    }

    @Test
    public void inputAimIsNormalisedAndHasADeadZone() {
        Input i = new Input();
        float[] out = new float[2];
        assertFalse(i.aim(out));
        i.aimStickX = 0.3f;
        i.aimStickY = 0.4f;
        assertTrue(i.aim(out));
        assertEquals(0.6f, out[0], 1e-5f);
        assertEquals(0.8f, out[1], 1e-5f);
        i.clearMovement();
        assertFalse(i.aim(out));
    }

    // ------------------------------------------------------------------ Hydraulic Hammer

    @Test
    public void coneHitsOnlyInsideTheCone() throws Exception {
        Sim s = run("BASTION");
        in.aimStickX = 1f; // aim +x
        Enemy front = polar(s, 50, 0), up = polar(s, 50, 30), down = polar(s, 50, -30);
        Enemy side1 = polar(s, 50, 70), side2 = polar(s, 50, -70), behind = polar(s, 50, 180), far = polar(s, 130, 0);
        stepUntilCount(s, 1);
        assertTrue(hit(front) && hit(up) && hit(down));
        assertFalse(hit(side1) || hit(side2) || hit(behind) || hit(far));
        assertEquals(100f, s.main.arcDegrees(), 0.01f);
    }

    @Test
    public void everyThirdSwingIsASlamWithAStun() throws Exception {
        Sim s = run("BASTION");
        in.aimStickX = 1f;
        Enemy behind = polar(s, 60, 180); // only a slam (circle) can reach it
        stepUntilCount(s, 1);
        assertFalse(hit(behind));
        stepUntilCount(s, 2);
        assertFalse(hit(behind));
        assertEquals(0f, behind.stun, 0f);
        stepUntilCount(s, 3);
        assertTrue("slam", hit(behind));
        assertTrue("stun", behind.stun > 0.3f && behind.stun <= 0.4f);
        assertEquals(3, s.main.slamEvery());
        assertEquals(Sim.AC_SLAM, s.mainClip);
    }

    @Test
    public void stunnedEnemiesDoNotMoveOrHurt() throws Exception {
        Sim s = run("BASTION");
        Enemy e = s.addEnemy("ZOMBIE", 40, 0, false);
        e.hp = e.maxHp = BIG;
        e.speed = 100f;
        e.stun = 1f;
        s.main.cd = 1e9f;
        float hp0 = s.hp;
        for (int i = 0; i < 30; i++) s.update(DT, in);
        assertEquals(40f, e.x, 0.01f);
        assertEquals(hp0, s.hp, 0.01f);
    }

    // ------------------------------------------------------------------ Twin Pistols

    @Test
    public void volleyIsThreeBulletsWithEightDegreesOfSpread() throws Exception {
        Sim s = run("SPECTRE");
        in.aimStickX = 1f;
        stepUntilCount(s, 1);
        double[] ang = new double[3];
        int n = 0;
        for (int i = 0; i < s.projN; i++) {
            Projectile p = s.projs[i];
            if (p.kind != Entities.P_MAIN) continue;
            assertEquals(Entities.SUB_BULLET, p.sub);
            ang[n++] = Math.atan2(p.vy, p.vx) / DEG;
        }
        assertEquals(3, n);
        java.util.Arrays.sort(ang);
        assertEquals(-8.0, ang[0], 0.1);
        assertEquals(0.0, ang[1], 0.1);
        assertEquals(8.0, ang[2], 0.1);
        assertEquals(Sim.AC_SHOOT, s.mainClip);
    }

    @Test
    public void pistolBulletsDoNotPierce() throws Exception {
        Sim s = run("SPECTRE");
        in.aimStickX = 1f;
        Enemy a = dummy(s, 60, 0), b = dummy(s, 100, 0);
        for (int i = 0; i < 90; i++) s.update(DT, in);
        assertTrue(hit(a));
        assertFalse(hit(b));
    }

    // ------------------------------------------------------------------ Lumen Caster

    @Test
    public void boltPiercesTwoEnemiesAndAppliesDecay() throws Exception {
        Sim s = run("XENOMANT");
        in.aimStickX = 1f;
        Enemy[] line = new Enemy[5];
        for (int i = 0; i < line.length; i++) line[i] = dummy(s, 60 + i * 40, 0);
        for (int i = 0; i < 84; i++) s.update(DT, in); // 1.4 s: one cast
        int hits = 0;
        for (Enemy e : line) if (hit(e)) hits++;
        assertEquals("pierce 2 = the first enemy and two more", 3, hits);
        assertTrue(line[0].decay >= 1);
    }

    @Test
    public void everyFourthCastIsASporeBurstOfSix() throws Exception {
        Sim s = run("XENOMANT");
        in.aimStickX = 1f;
        for (int cast = 1; cast <= 4; cast++) {
            s.projN = 0;
            stepUntilCount(s, cast);
            int bursts = 0, bolts = 0;
            for (int i = 0; i < s.projN; i++) {
                if (s.projs[i].sub == Entities.SUB_BURST) bursts++;
                if (s.projs[i].sub == Entities.SUB_BOLT) bolts++;
            }
            assertEquals(1, bolts);
            assertEquals("cast " + cast, cast == 4 ? 6 : 0, bursts);
        }
    }

    // ------------------------------------------------------------------ branches

    private static void take(Sim s, int branch, int tiers) {
        for (int t = 1; t <= tiers; t++) assertTrue(s.main.pick(branch, t));
        s.recomputeAll();
    }

    @Test
    public void tiersMustBeTakenInOrder() throws Exception {
        Sim s = run("BASTION");
        assertFalse(s.main.pick(0, 2));
        assertTrue(s.main.pick(0, 1));
        assertFalse(s.main.pick(0, 1));
        assertFalse(s.main.pick(0, 3));
        assertTrue(s.main.pick(0, 2));
    }

    @Test
    public void seismicShortensTheSlamCycle() throws Exception {
        Sim s = run("BASTION");
        take(s, 0, 1);
        assertEquals(2, s.main.slamEvery());
        take(s, 0, 0);
        Sim t = run("BASTION");
        take(t, 0, 3);
        assertEquals(90f * 1.4f, t.main.slamReach(), 0.01f);
    }

    @Test
    public void quickAndBarrageChangeTheVolley() throws Exception {
        Sim s = run("SPECTRE");
        float base = s.main.interval;
        assertEquals(3, s.main.bulletCount());
        take(s, 2, 1); // Quick Shot I: 2 bullets, -25% interval
        assertEquals(2, s.main.bulletCount());
        assertEquals(base * 0.75f, s.main.interval, 0.001f);
        Sim t = run("SPECTRE");
        take(t, 0, 1); // Pistol Barrage I
        assertEquals(5, t.main.bulletCount());
        Sim u = run("SPECTRE");
        take(u, 1, 1); // Piercing Shot I: one slug every 1.5 s
        assertEquals(1, u.main.bulletCount());
        assertEquals(1.5f, u.main.interval, 0.001f);
    }

    @Test
    public void furnaceCleaveBurnsTheEnemiesItHits() throws Exception {
        Sim s = run("BASTION");
        take(s, 2, 1);
        assertEquals(160f, s.main.arcDegrees(), 0.01f);
        in.aimStickX = 1f;
        Enemy e = polar(s, 50, 0);
        stepUntilCount(s, 1);
        assertEquals(1, e.burn);
        float hp = e.hp;
        s.main.cd = 1e9f;
        for (int i = 0; i < 30; i++) s.update(DT, in);
        assertTrue("burn deals damage over time", e.hp < hp);
    }

    @Test
    public void riotGuardCutsContactDamageAfterASwing() throws Exception {
        Sim s = run("BASTION");
        take(s, 3, 1);
        in.aimStickX = 1f;
        stepUntilCount(s, 1);
        assertTrue(s.guardT > 0.9f);
        s.main.cd = 1e9f;
        Enemy e = s.addEnemy("ZOMBIE", 0, 0, false);
        e.speed = 0f;
        e.power = 20f;
        e.hp = e.maxHp = BIG;
        float hp = s.hp;
        s.update(DT, in);
        assertEquals(hp - (20f - 1f) * 0.85f, s.hp, 0.01f); // armor 1 first, then -15%
    }

    @Test
    public void parasiteLinkTethersTwoEnemies() throws Exception {
        Sim s = run("XENOMANT");
        take(s, 2, 1);
        in.aimStickX = 1f;
        Enemy a = dummy(s, 80, 0), b = dummy(s, 80, 60);
        for (int i = 0; i < 40; i++) s.update(DT, in);
        assertEquals(1, s.main.linkN);
        float hpB = b.hp;
        for (int i = 0; i < 30; i++) s.update(DT, in);
        assertTrue("the linked enemy takes damage", b.hp < hpB);
    }

    @Test
    public void grasmpingTendrilsRootEnemies() throws Exception {
        Sim s = run("XENOMANT");
        take(s, 1, 1);
        in.aimStickX = 1f;
        Enemy e = s.addEnemy("ZOMBIE", 120, 0, false);
        e.hp = e.maxHp = BIG;
        e.speed = 0f;
        e.power = 0f;
        stepUntilCount(s, 4);
        assertTrue("rooted", e.root > 0f);
    }

    // ------------------------------------------------------------------ dodge

    @Test
    public void dodgeDashesNinetyUnitsAndIsInvulnerable() throws Exception {
        Sim s = run("BASTION");
        s.main.cd = 1e9f;
        in.stickX = 1f;
        in.dodgeReq = true;
        float x0 = s.px;
        Enemy e = s.addEnemy("ZOMBIE", 0, 0, false);
        e.speed = 0f;
        e.power = 30f;
        e.hp = e.maxHp = BIG;
        float hp = s.hp;
        s.update(DT, in);
        assertTrue(s.invuln > 0.2f);
        for (int i = 0; i < 15; i++) { // a little over 0.25 s in all
            e.x = s.px;
            e.y = s.py; // keep it on top of the player the whole time
            s.update(DT, in);
        }
        assertEquals(90f, s.px - x0, 1.5f);
        assertEquals("no damage while dodging", hp, s.hp, 0.001f);
        assertTrue(s.dodgeT <= 0f);
    }

    @Test
    public void dodgeHasOneChargeAndAScaledCooldown() throws Exception {
        Map<String, Double> meta = new HashMap<>();
        meta.put("cooldown", -0.25);
        Sim s = run("SPECTRE", meta);
        s.main.cd = 1e9f;
        in.dodgeReq = true;
        s.update(DT, in);
        assertEquals(3f, s.dodgeCdMax, 1e-4f); // 4 s x 0.75
        float x = s.px;
        for (int i = 0; i < 30; i++) s.update(DT, in);
        in.dodgeReq = true; // still cooling down: ignored
        s.update(DT, in);
        assertFalse(in.dodgeReq);
        float x1 = s.px;
        s.update(DT, in);
        assertEquals("no second dash", x1, s.px, 1e-3f);
        assertTrue(s.dodgeCd > 0);
        for (int i = 0; i < 200; i++) s.update(DT, in); // 3.4 s: ready again
        assertTrue(s.dodgeCd <= 0f);
        in.dodgeReq = true;
        s.update(DT, in);
        assertTrue(s.dodgeT > 0f);
        assertTrue(s.px != x);
    }

    @Test
    public void dodgeUsesTheMoveDirectionElseTheFacing() throws Exception {
        Sim s = run("BASTION");
        s.main.cd = 1e9f;
        in.stickY = 1f;
        s.update(DT, in); // face down
        in.stickY = 0f;
        in.dodgeReq = true;
        s.update(DT, in);
        assertEquals(0f, s.dodgeDx, 1e-3f);
        assertEquals(1f, s.dodgeDy, 1e-3f);
    }

    @Test
    public void newSoundIdsExistWithLimits() {
        String[] ids = {"hammer_swing", "hammer_slam", "pistol_shot", "caster_bolt", "spore_burst", "dodge"};
        int[] ev = {SoundEvents.HAMMER_SWING, SoundEvents.HAMMER_SLAM, SoundEvents.PISTOL_SHOT, SoundEvents.CASTER_BOLT,
                SoundEvents.SPORE_BURST, SoundEvents.DODGE};
        for (int i = 0; i < ids.length; i++) assertEquals(ids[i], SoundEvents.NAMES[ev[i]]);
        SoundEvents q = new SoundEvents();
        for (int i = 0; i < 20; i++) q.emit(SoundEvents.DODGE);
        assertEquals(1, q.emitted[SoundEvents.DODGE]);
    }
}
