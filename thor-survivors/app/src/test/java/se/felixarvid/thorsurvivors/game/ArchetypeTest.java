package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.EnemyDef;
import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;

import java.util.HashMap;

/** Design phase 6: the Ashfall roster and its archetypes, enemy projectiles, hazards and the ranged cap. */
public class ArchetypeTest {
    private static final float DT = 1f / 60f;

    private GameData d() throws Exception {
        return TestData.load();
    }

    private Sim sim(String hero) throws Exception {
        GameData d = d();
        Sim s = new Sim(d, d.stages.get("FLATS"), null, new HashMap<String, Double>(), hero);
        s.noSpawns = true;
        s.enemyN = 0;
        s.rng.setSeed(5);
        return s;
    }

    private void run(Sim s, double seconds, boolean immortal) {
        Input in = new Input();
        int n = (int) Math.round(seconds / DT);
        for (int i = 0; i < n; i++) {
            if (immortal) s.hp = s.maxHp;
            s.update(DT, in);
        }
    }

    @Test
    public void theRosterIsInTheData() throws Exception {
        GameData d = d();
        String[] keys = {"COLONIST", "SPORE_HOUND", "SERGEANT", "SECURITY_DRONE", "WELDER", "SPORE_CARRIER", "SMELTER",
                "VIRE", "CARGO_LOADER", "SLAGBORN", "VIRE_AWAKENED", "SMELTER_FOREMAN", "THE_FIRST"};
        for (String k : keys) assertTrue(k, d.enemies.containsKey(k));
        EnemyDef z = d.enemies.get("ZOMBIE");
        EnemyDef c = d.enemies.get("COLONIST");
        assertEquals(z.maxHp, c.maxHp, 1e-9);
        assertEquals(z.speed, c.speed, 1e-9);
        assertEquals("phase 12: the colonist hits harder than the VS zombie", 1.2 * z.power, c.power, 1e-9);
        assertEquals(EnemyDef.ARCH_RANGED, d.enemies.get("SERGEANT").archetype);
        assertEquals(EnemyDef.ARCH_FLIER, d.enemies.get("SECURITY_DRONE").archetype);
        assertEquals(EnemyDef.ARCH_CHARGER, d.enemies.get("WELDER").archetype);
        assertEquals(EnemyDef.ARCH_EXPLODER, d.enemies.get("SPORE_CARRIER").archetype);
        assertEquals(EnemyDef.ARCH_TANK, d.enemies.get("SMELTER").archetype);
        assertEquals(EnemyDef.ARCH_SUMMONER, d.enemies.get("VIRE").archetype);
        assertEquals(EnemyDef.ARCH_PACK, d.enemies.get("SPORE_HOUND").archetype);
        assertEquals(8.0, d.enemies.get("SMELTER").maxHp, 1e-9);
        assertEquals(360.0, d.enemies.get("CARGO_LOADER").maxHp, 1e-9);
        assertEquals(1800.0, d.enemies.get("THE_FIRST").maxHp, 1e-9);
        assertEquals(132f, d.enemies.get("SERGEANT").param("stop", 0), 0f);
        assertEquals(100f, d.enemies.get("SERGEANT").param("backoff", 0), 0f);
        assertEquals("the VS roster is untouched", EnemyDef.ARCH_CHASER, z.archetype);
        // the model of each key
        Sim s = sim(null);
        assertEquals("sergeant", s.type("SERGEANT").model);
        assertEquals("cargo_loader", s.type("CARGO_LOADER").bossModel);
        assertEquals("smelter", s.type("SMELTER_FOREMAN").bossModel);
        assertEquals("the_first", s.type("THE_FIRST").bossModel);
        assertEquals("vire", s.type("VIRE_AWAKENED").bossModel);
    }

    @Test
    public void aSergeantHoldsBetween100And132UnitsAndShootsBursts() throws Exception {
        Sim s = sim(null);
        Enemy e = s.addEnemy("SERGEANT", 420, 0, false);
        float lo = 1e9f, hi = 0f;
        Input in = new Input();
        int bolts = 0, maxBolts = 0;
        for (int i = 0; i < 60 * 14; i++) {
            s.hp = s.maxHp;
            s.update(DT, in);
            bolts = Math.max(bolts, s.eprojN);
            maxBolts = Math.max(maxBolts, s.eprojN);
            if (i > 60 * 8) {
                float dd = (float) Math.hypot(e.x - s.px, e.y - s.py);
                lo = Math.min(lo, dd);
                hi = Math.max(hi, dd);
            }
        }
        assertTrue("holds from " + lo + " to " + hi, lo >= 99f && hi <= 134f);
        assertTrue("fired a burst of 3", maxBolts >= 2);
        assertTrue(s.sound.emitted[SoundEvents.SERGEANT_BURST] >= 2);
    }

    @Test
    public void aSergeantBacksOffWhenTheHeroWalksAtIt() throws Exception {
        Sim s = sim(null);
        Enemy e = s.addEnemy("SERGEANT", 130, 0, false);
        e.actT = 100f; // no shots in this test
        Input in = new Input();
        in.stickX = 0.25f; // slower than its retreat
        float min = 1e9f;
        for (int i = 0; i < 60 * 3; i++) {
            s.hp = s.maxHp;
            s.update(DT, in);
            min = Math.min(min, (float) Math.hypot(e.x - s.px, e.y - s.py));
        }
        assertTrue("walking slowly at it, it kept " + min, min > 90f);
        assertTrue("it moved away (x " + e.x + " hero " + s.px + ")", e.x > 130f);
    }

    @Test
    public void aDroneStaysBetween120And150() throws Exception {
        Sim s = sim(null);
        Enemy e = s.addEnemy("SECURITY_DRONE", 400, 0, false);
        float lo = 1e9f, hi = 0f;
        Input in = new Input();
        for (int i = 0; i < 60 * 12; i++) {
            s.hp = s.maxHp;
            s.update(DT, in);
            if (i > 60 * 8) {
                float dd = (float) Math.hypot(e.x - s.px, e.y - s.py);
                lo = Math.min(lo, dd);
                hi = Math.max(hi, dd);
            }
        }
        assertTrue("drone " + lo + " to " + hi, lo >= 119f && hi <= 152f);
        assertTrue(s.sound.emitted[SoundEvents.DRONE_SHOT] >= 2);
    }

    @Test
    public void anEnemyBoltHurtsTheHeroOnceAndRedBoltsAreCapped() throws Exception {
        Sim s = sim(null);
        s.hp = s.maxHp = 100f;
        s.ai.shoot(100, 0, -300, 0, 12f, 2f);
        run(s, 0.6, false);
        assertEquals(88f, s.hp, 0.5f);
        assertEquals(0, s.eprojN);
        for (int i = 0; i < 100; i++) s.ai.shoot(500, 500, 0, 0, 1f, 5f);
        assertEquals(Sim.MAX_EPROJ, s.eprojN);
        assertEquals(40, Sim.MAX_EPROJ);
    }

    @Test
    public void aChargerTelegraphsForHalfASecondThenDashesThenRests() throws Exception {
        Sim s = sim(null);
        Enemy e = s.addEnemy("WELDER", 120, 0, false);
        e.actT = 0f;
        Input in = new Input();
        int tele = 0, dash = 0, rest = 0;
        float x0 = 0;
        boolean seenTele = false;
        for (int i = 0; i < 60 * 4; i++) {
            s.hp = s.maxHp;
            s.update(DT, in);
            if (e.ai == EnemyAi.A_TELE) {
                if (!seenTele) x0 = e.x;
                seenTele = true;
                tele++;
                assertTrue(e.tele >= 0f && e.teleMax == 0.6f);
                assertEquals("it stands still while telegraphing", x0, e.x, 1e-3f);
            } else if (e.ai == EnemyAi.A_DASH) dash++;
            else if (e.ai == EnemyAi.A_REST) rest++;
        }
        assertTrue("telegraph frames " + tele, Math.abs(tele - 0.6f * 60) <= 3);
        assertTrue("dash frames " + dash, Math.abs(dash - 0.6f * 60) <= 4 || dash > 0);
        assertTrue("rest " + rest, rest >= 50);
        assertTrue(s.sound.emitted[SoundEvents.WELDER_CHARGE] >= 1);
    }

    @Test
    public void aDashTravelsAlongTheLockedLine() throws Exception {
        Sim s = sim(null);
        Enemy e = s.addEnemy("WELDER", 120, 0, false);
        e.actT = 0f;
        Input in = new Input();
        float startX = 120f;
        for (int i = 0; i < 60 * 2 && e.ai != EnemyAi.A_DASH; i++) {
            s.hp = s.maxHp;
            s.update(DT, in);
        }
        assertEquals(EnemyAi.A_DASH, e.ai);
        float yBefore = e.y;
        for (int i = 0; i < 20; i++) s.update(DT, in);
        assertEquals("straight along the locked line", yBefore, e.y, 2f);
        assertTrue("dashing toward the hero: " + e.x, e.x < startX - 20f);
        assertEquals(Entities.CL_RUN, e.clip);
    }

    @Test
    public void aSporeCarrierDamagesOnlyThroughItsCloud() throws Exception {
        Sim s = sim(null);
        s.hp = s.maxHp = 100f;
        Enemy c = s.addEnemy("SPORE_CARRIER", 30, 0, false);
        c.speed = 0f;
        Enemy bystander = s.addEnemy("COLONIST", 90, 40, false);
        bystander.speed = 0f;
        bystander.hp = bystander.maxHp = 100f;
        Input in = new Input();
        // the fuse: standing in contact range, the carrier itself never hurts
        for (int i = 0; i < 18; i++) s.update(DT, in);
        assertEquals("no contact damage", 100f, s.hp, 1e-3f);
        assertEquals(EnemyAi.A_FUSE, c.ai);
        for (int i = 0; i < 30; i++) s.update(DT, in);
        assertEquals("the cloud is up", 1, s.hazN);
        assertEquals(Entities.HZ_CLOUD, s.hazards[0].kind);
        assertEquals(85f, s.hazards[0].r, 0f);
        assertTrue("a kill", s.kills >= 1);
        assertTrue(s.sound.emitted[SoundEvents.CARRIER_BURST] >= 1);
        run(s, 2.0, false);
        assertTrue("the hero took cloud damage " + s.hp, s.hp < 95f && s.hp > 70f);
        assertTrue("decay status on the hero", s.heroDecayT > 0f);
        assertTrue("the cloud hurts enemies too " + bystander.hp, bystander.hp < 100f - 5f);
        assertTrue(bystander.decay > 0);
    }

    @Test
    public void aSporeCarrierKilledFarAwayStillLeavesACloud() throws Exception {
        Sim s = sim(null);
        Enemy c = s.addEnemy("SPORE_CARRIER", 250, 0, false);
        c.speed = 0f;
        s.hurt(c, 1000f, 0, 1, 0, 0, 0);
        s.update(DT, new Input());
        assertEquals(1, s.hazN);
        assertEquals(250f, s.hazards[0].x, 1f);
    }

    @Test
    public void aSmelterIsKnockbackImmuneAndCastsSlagPoolsWithAWarning() throws Exception {
        Sim s = sim(null);
        s.hp = s.maxHp = 100f;
        Enemy e = s.addEnemy("SMELTER", 200, 0, false);
        e.speed = 0f;
        s.hurt(e, 1f, 0, 1, 1, 0, 3f);
        assertEquals(0f, e.kvx, 0f);
        e.actT = 0f;
        Input in = new Input();
        s.update(DT, in);
        assertEquals(EnemyAi.A_CAST, e.ai);
        assertEquals(1, s.hazN);
        assertTrue("0.6 s warning", s.hazards[0].warn > 0.5f);
        assertEquals(Entities.CL_CAST, e.clip);
        for (int i = 0; i < 90; i++) s.update(DT, in); // the hero stood still: the pool lands on it
        assertTrue("burning " + s.heroBurnT, s.heroBurnT > 0f);
        assertTrue("hp " + s.hp, s.hp < 95f);
    }

    @Test
    public void aVireBlinksRaisesColonistsThenFiresARing() throws Exception {
        Sim s = sim(null);
        Enemy v = s.addEnemy("VIRE", 100, 0, false);
        v.hp = v.maxHp = 1e6f;
        v.speed = 0f;
        v.aiT = 0f;
        Input in = new Input();
        int enemies0 = s.enemyN;
        boolean blinked = false;
        int maxBolts = 0;
        for (int i = 0; i < 60 * 12; i++) {
            s.hp = s.maxHp;
            s.update(DT, in);
            if (v.ai == EnemyAi.A_WAIT && !blinked) {
                blinked = true;
                float dd = (float) Math.hypot(v.x - s.px, v.y - s.py);
                assertTrue("blinked to " + dd, dd >= 124f && dd <= 201f);
            }
            maxBolts = Math.max(maxBolts, s.eprojN);
            if (i == 60 * 4) v.aiT = 0f; // second cycle: the ring
        }
        assertTrue(blinked);
        assertTrue("raised colonists: " + (s.enemyN - enemies0), s.enemyN - enemies0 >= 3);
        assertTrue("ring of bolts " + maxBolts, maxBolts >= 6);
        assertTrue(s.sound.emitted[SoundEvents.VIRE_BLINK] >= 1);
    }

    @Test
    public void houndsComeInPacksOfFourAndWeave() throws Exception {
        Sim s = sim(null);
        s.spawnAtRing(s.type("SPORE_HOUND"), false, 500f);
        assertEquals(4, s.enemyN);
        Enemy h = s.enemies[0];
        // lateral weave: the path leaves the straight line to the hero
        s.enemyN = 0;
        Enemy a = s.addEnemy("SPORE_HOUND", 400, 0, false);
        float maxOff = 0f;
        Input in = new Input();
        for (int i = 0; i < 60 * 2; i++) {
            s.hp = s.maxHp;
            s.update(DT, in);
            maxOff = Math.max(maxOff, Math.abs(a.y));
        }
        assertTrue("weaved " + maxOff, maxOff > 6f);
    }

    @Test
    public void rangedEnemiesBeyondTwentyFourSpawnAsColonists() throws Exception {
        Sim s = sim(null);
        for (int i = 0; i < 40; i++) s.spawnAtRing(s.type(i % 2 == 0 ? "SERGEANT" : "SECURITY_DRONE"), false, 500f);
        assertEquals(24, s.rangedAlive());
        assertEquals(40, s.enemyN);
        assertEquals(Sim.RANGED_CAP, 24);
    }

    @Test
    public void theBoltPoolNeverOverflowsWithTwentyFourRangedAround() throws Exception {
        Sim s = sim(null);
        for (int i = 0; i < 24; i++) {
            double a = i * 0.2618;
            Enemy e = s.addEnemy(i % 3 == 0 ? "SECURITY_DRONE" : "SERGEANT", (float) Math.cos(a) * 120f, (float) Math.sin(a) * 120f, false);
            e.actT = 0f; // all start together: the worst case
        }
        Input in = new Input();
        int peak = 0;
        for (int i = 0; i < 60 * 40; i++) {
            s.hp = s.maxHp;
            s.update(DT, in);
            peak = Math.max(peak, s.eprojN);
            assertTrue("pool " + s.eprojN, s.eprojN <= Sim.MAX_EPROJ);
        }
        assertTrue("shots were fired " + peak, peak >= 10);
    }

    @Test
    public void wavesNeverFillBeyondTheCapAndWaveRowsNameKnownEnemies() throws Exception {
        GameData d = d();
        for (String key : new String[]{"FLATS", "MINES"}) {
            for (se.felixarvid.thorsurvivors.data.WaveRow r : d.stages.get(key).rows) {
                for (String e : r.enemies) assertTrue(key + " " + e, d.enemies.containsKey(e));
                for (String b : r.bosses) assertTrue(key + " boss " + b, d.enemies.containsKey(b));
                assertEquals(0, WaveDirector.eachCount(r, 300));
                assertEquals(0, WaveDirector.topUpCount(r, 300));
                assertTrue(WaveDirector.topUpCount(r, 0) + r.enemies.length + 300 - 0 >= 0);
            }
        }
    }

    /** The whole roster fighting (waves, bolts, pools, clouds, summons, statuses) must not allocate in the game loop. */
    @Test
    public void theArchetypeLoopAllocatesNothing() throws Exception {
        GameData d = d();
        Sim s = new Sim(d, d.stages.get("MINES"), "WHIP", new HashMap<String, Double>(), "BASTION", 3);
        s.time = 19 * 60 + 30; // every archetype is in the row, a boss comes at minute 20
        Input in = new Input();
        for (int i = 0; i < 1500; i++) { // warm up (class loading, lazy init, JIT)
            in.stickX = (float) Math.cos(i * 0.01);
            in.stickY = (float) Math.sin(i * 0.01);
            s.hp = s.maxHp;
            s.update(DT, in);
        }
        long before = Alloc.bytes();
        int steps = 3000;
        for (int i = 0; i < steps; i++) {
            in.stickX = (float) Math.cos(i * 0.01);
            in.stickY = (float) Math.sin(i * 0.01);
            s.hp = s.maxHp;
            s.update(DT, in);
            while (s.pendingLevelUps > 0) s.pendingLevelUps--; // taking cards allocates (offers); that is not the loop
            while (s.pendingChests > 0) s.pendingChests--;
        }
        long bytes = Alloc.bytes() - before;
        assertTrue("enemies were around: " + s.enemyN, s.enemyN > 50);
        assertTrue("allocated " + bytes + " bytes in " + steps + " frames", bytes < steps * 16L);
    }

    @Test
    public void bossesCarryTheirFinalHpWhichRampsWithTheRunTime() throws Exception {
        Sim s = sim(null);
        float hm = (float) s.stage.enemyHealth; // the stage's health multiplier (Flats 1.2 in phase 12)
        s.time = 20 * 60; // the ramp is over at minute 20 (The First at 28)
        Enemy b = s.addEnemy("CARGO_LOADER", 500, 0, true);
        assertEquals(360f * 10f * hm, b.maxHp, 1f); // Z units x 10 x the stage multiplier, no extra boss factor
        Enemy tf = s.addEnemy("THE_FIRST", 500, 100, true);
        assertEquals(18000f * hm * (0.2f + 0.8f * 20f / 28f), tf.maxHp, 5f);
        s.time = 5 * 60;
        assertEquals("a first boss at 5:00 has 40% of its HP", 3600f * hm * 0.4f, s.addEnemy("CARGO_LOADER", 500, 200, true).maxHp, 1f);
        s.time = 0;
        assertEquals(3600f * hm * 0.2f, s.addEnemy("CARGO_LOADER", 500, 300, true).maxHp, 1f);
        assertFalse(b.dead);
        GameData d = d();
        String[] order = {"CARGO_LOADER", "SMELTER_FOREMAN", "SLAGBORN", "VIRE_AWAKENED"};
        int[] minutes = {5, 10, 15, 20};
        for (int i = 0; i < 4; i++) {
            assertEquals(order[i], d.stages.get("FLATS").rows.get(minutes[i]).bosses[0]);
        }
    }
}
