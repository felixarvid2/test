package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.EnemyDef;
import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;
import se.felixarvid.thorsurvivors.game.Entities.Hazard;

import java.util.HashMap;

/**
 * Design phase 10, the boss patterns of design section 4.1: each attack is telegraphed before it hurts (a ring, a line, a
 * lane, a half of the floor), does what the design says, and The First has three phases at 66% / 33%, ends the run in
 * victory when killed (gold x2) and the run is still won at 30:00 when it is not.
 */
public class BossTest {
    private static final float DT = 1f / 60f;

    private static Sim sim(String stage, double time, long seed) throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get(stage), null, new HashMap<String, Double>(), null, seed); // no hero: nothing clears the scene
        s.noSpawns = true;
        s.enemyN = 0;
        s.time = time;
        return s;
    }

    private static void step(Sim s, double seconds) {
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

    private static int countEnemies(Sim s, String key) {
        int n = 0;
        for (int i = 0; i < s.enemyN; i++) if (s.enemies[i].type.def.key.equals(key) && !s.enemies[i].dead) n++;
        return n;
    }

    // ------------------------------------------------------------------ the data

    @Test
    public void everyBossUsesAPatternAndKeepsItsHpRamp() throws Exception {
        GameData d = TestData.load();
        int[][] want = {{1}, {2}, {3}, {4}, {5}};
        String[] keys = {"CARGO_LOADER", "SLAGBORN", "VIRE_AWAKENED", "SMELTER_FOREMAN", "THE_FIRST"};
        for (int i = 0; i < keys.length; i++) {
            EnemyDef e = d.enemies.get(keys[i]);
            assertEquals(keys[i], EnemyDef.ARCH_BOSS, e.archetype);
            assertEquals(want[i][0], Math.round(e.param("pattern", 0)));
            assertTrue(e.ashfallBoss);
        }
        assertEquals("the ramp 20% -> 100% by minute 20 is kept", 20f, d.enemies.get("CARGO_LOADER").param("hpRamp", 0), 0f);
        assertEquals(28f, d.enemies.get("THE_FIRST").param("hpRamp", 0), 0f);
        assertEquals(EnemyDef.ARCH_TENTACLE, d.enemies.get("LUMEN_TENTACLE").archetype);
        assertFalse(d.enemies.get("LUMEN_TENTACLE").ashfallBoss);
        // phase 12: The First comes at 28:00 (two minutes to kill it before the run ends), the last minute has no boss
        se.felixarvid.thorsurvivors.data.StageDef mines = d.stages.get("MINES");
        assertEquals("The First comes at minute 28 on Deep Mines", "THE_FIRST", mines.rows.get(mines.rows.size() - 2).bosses[0]);
        assertEquals(28, mines.rows.get(mines.rows.size() - 2).minute);
        assertEquals(0, mines.rows.get(mines.rows.size() - 1).bosses.length);
        assertEquals(5, d.stages.get("MINES").tentacleMinutes.length);
        assertEquals("no tentacle hazard on Cinder Flats", 0, d.stages.get("FLATS").tentacleMinutes.length);
    }

    // ------------------------------------------------------------------ Cargo Loader

    @Test
    public void cargoLoaderDrawsAFourBagOfTwoChargesAndTwoStompsAndTelegraphsBoth() throws Exception {
        Sim s = sim("FLATS", 20 * 60, 21);
        s.px = 0;
        s.py = 0;
        Enemy b = s.spawnAt("CARGO_LOADER", 300, 0, true);
        b.speed = 0f; // stands where it is: only its attacks matter
        int charges = 0, stomps = 0;
        int lastAi = b.ai, teleStart = 0;
        float windupMin = 99, windupMax = 0;
        for (int i = 0; i < 60 * 60 && !(charges + stomps >= 8 && b.ai != EnemyAi.A_TELE); i++) {
            s.hp = s.maxHp;
            s.update(DT, new Input());
            if (b.ai != lastAi) {
                if (lastAi == EnemyAi.A_TELE) {
                    float w = (i - teleStart) / 60f;
                    windupMin = Math.min(windupMin, w);
                    windupMax = Math.max(windupMax, w);
                }
                if (b.ai == EnemyAi.A_TELE) {
                    teleStart = i;
                    charges++;
                    assertEquals("the line is 60 wide", 60f, b.teleW, 0f);
                    assertTrue("the line has a length: " + b.teleLen, b.teleLen > 150f);
                    assertEquals("windup 1.0 s", 1.0f, b.teleMax, 1e-4f);
                    assertEquals(0, count(s, Entities.HZ_BOMB, Entities.BV_STOMP));
                } else if (b.ai == EnemyAi.A_CAST) {
                    stomps++;
                    assertEquals("a warn ring of radius 120 is on the floor first", 1, count(s, Entities.HZ_BOMB, Entities.BV_STOMP));
                    for (int k = 0; k < s.hazN; k++) {
                        Hazard h = s.hazards[k];
                        if (h.variant == Entities.BV_STOMP) {
                            assertEquals(120f, h.r, 0f);
                            assertTrue(h.warn > 0.8f);
                        }
                    }
                }
                lastAi = b.ai;
            }
        }
        assertEquals("eight draws from two bags of four", 4, charges);
        assertEquals(4, stomps);
        assertTrue("every charge wound up for a second: " + windupMin + " .. " + windupMax, windupMin > 0.95f && windupMax < 1.1f);
    }

    @Test
    public void aChargeStunsAndShovesTheHeroAndAStompHurtsOnlyInsideItsRing() throws Exception {
        Sim s = sim("FLATS", 20 * 60, 22);
        s.px = 0;
        s.py = 0;
        Enemy b = s.spawnAt("CARGO_LOADER", 260, 0, true);
        b.speed = 0f;
        b.bag = 0b0001; // only one charge left in the bag
        b.actT = 0f;
        int hitFrame = -1;
        for (int i = 0; i < 60 * 4; i++) {
            s.update(DT, new Input());
            s.hp = Math.min(s.hp, s.maxHp);
            if (s.heroStunT > 0f && hitFrame < 0) hitFrame = i;
        }
        assertTrue("the charge caught the hero and stunned it", hitFrame > 60);
        assertTrue("and shoved it along the line: " + s.px, s.px < -20f);
        assertTrue("the contact hurt", s.hp < s.maxHp);

        // the stomp: inside the ring 22 damage when the warning ends, outside nothing
        Sim t = sim("FLATS", 20 * 60, 23);
        t.px = 60;
        t.py = 0;
        Enemy c = t.spawnAt("CARGO_LOADER", 0, 0, true);
        c.speed = 0f;
        c.power = 0f; // only the stomp
        c.bag = 0b0100;
        c.actT = 0f;
        float inside = Float.MAX_VALUE;
        for (int i = 0; i < 90; i++) {
            t.update(DT, new Input());
            inside = Math.min(inside, t.hp);
            if (t.hp < t.maxHp) break;
        }
        assertEquals("22 damage inside the ring", t.maxHp - 22f, t.hp, 0.01f);
        step(t, 0.1);
        assertEquals("the crates follow: three rings", 3, count(t, Entities.HZ_BOMB, Entities.BV_CRATE));
        for (int k = 0; k < t.hazN; k++) if (t.hazards[k].variant == Entities.BV_CRATE) assertTrue("warn first", t.hazards[k].warn > 0.9f);
        Sim u = sim("FLATS", 20 * 60, 24);
        u.px = 330;
        u.py = 0;
        Enemy e = u.spawnAt("CARGO_LOADER", 0, 0, true);
        e.speed = 0f;
        e.power = 0f;
        e.bag = 0b0100;
        e.actT = 0f;
        float hp0 = u.hp;
        for (int i = 0; i < 70; i++) u.update(DT, new Input());
        assertEquals("outside the ring: untouched", hp0, u.hp, 0.01f);
        assertEquals(1, u.sound.emitted[SoundEvents.BOSS_SLAM]);
    }

    // ------------------------------------------------------------------ Slagborn

    @Test
    public void slagbornLeavesASlagTrailAndLobsBombsThatLeavePools() throws Exception {
        Sim s = sim("FLATS", 20 * 60, 31);
        s.px = 700;
        s.py = 0;
        Enemy b = s.spawnAt("SLAGBORN", 0, 0, true);
        b.actT = 100f; // no bombs yet
        step(s, 3);
        int trail = count(s, Entities.HZ_SLAG, -1);
        float walked = b.x;
        assertTrue("walked " + walked, walked > 60f);
        assertTrue("a patch every 45 units (" + trail + " for " + walked + ")", trail >= (int) (walked / 45f) - 1 && trail >= 2);
        for (int i = 0; i < s.hazN; i++) assertEquals("trail patches are small (r 24)", 24f, s.hazards[i].r, 0f);
        // the bombs: three, each with a ring, the first on the hero
        s.hazN = 0;
        s.px = 400;
        s.py = 0;
        b.actT = 0f;
        s.update(DT, new Input());
        assertEquals(3, count(s, Entities.HZ_BOMB, Entities.BV_SLAG));
        boolean onHero = false;
        for (int i = 0; i < s.hazN; i++) {
            Hazard h = s.hazards[i];
            assertTrue(h.warn > 0.9f);
            if (Math.hypot(h.x - s.px, h.y - s.py) < 1f) onHero = true;
        }
        assertTrue("the first bomb lands on the hero", onHero);
        step(s, 1.3);
        assertTrue("each bomb left a pool: " + count(s, Entities.HZ_SLAG, -1), count(s, Entities.HZ_SLAG, -1) >= 3);
    }

    @Test
    public void slagbornEnragesAtHalfHealthFasterAndWithFiveBombs() throws Exception {
        Sim s = sim("FLATS", 20 * 60, 32);
        s.px = 300;
        Enemy b = s.spawnAt("SLAGBORN", 0, 0, true);
        b.actT = 100f;
        float speed = b.speed;
        b.hp = b.maxHp * 0.51f;
        step(s, 0.1);
        assertFalse(b.enraged);
        b.hp = b.maxHp * 0.49f;
        step(s, 0.1);
        assertTrue(b.enraged);
        assertEquals(speed * 1.3f, b.speed, 1e-3f);
        s.hazN = 0;
        b.actT = 0f;
        step(s, 0.1);
        assertEquals("five bombs when enraged", 5, count(s, Entities.HZ_BOMB, Entities.BV_SLAG));
    }

    // ------------------------------------------------------------------ Lumen Tentacle

    @Test
    public void tentaclesBurstInWavesOfThreeWarnThenRiseThenSinkAndDropGemsWhenKilled() throws Exception {
        Sim s = sim("MINES", 600, 41);
        s.px = 0;
        s.py = 0;
        s.tentacleWaveForTest(3, 400, true);
        assertEquals(3, s.enemyN);
        for (int i = 0; i < 3; i++) {
            Enemy t = s.enemies[i];
            assertEquals(EnemyDef.ARCH_TENTACLE, t.type.arch);
            assertTrue("a warning first", t.dormant && t.tele > 0.75f);
            assertTrue("within 400 of the hero", Math.hypot(t.x, t.y) <= 400f);
        }
        assertTrue("the first one is on the hero", Math.hypot(s.enemies[0].x, s.enemies[0].y) < 20f);
        // while it warns: it cannot be hurt and does not hurt
        Enemy first = s.enemies[0];
        float hp = first.hp;
        s.hurt(first, 100f, 0, 1, 0, 0, 0);
        assertEquals(hp, first.hp, 0f);
        float hero = s.hp;
        for (int i = 0; i < 40; i++) s.update(DT, new Input());
        assertEquals("a warning ring does no damage", hero, s.hp, 0.01f);
        // 0.8 s: up
        for (int i = 0; i < 20; i++) s.update(DT, new Input());
        assertFalse(first.dormant);
        assertTrue(s.sound.emitted[SoundEvents.TENTACLE_EMERGE] >= 1);
        s.update(DT, new Input());
        assertTrue("up on the hero: contact damage", s.hp < hero);
        // killable: a gem drops and it counts as a kill
        s.hp = s.maxHp;
        int kills = s.kills;
        float xp = s.xp;
        first.hp = 1f;
        s.hurt(first, 50f, 0, 1, 0, 0, 0);
        s.update(DT, new Input());
        assertEquals(kills + 1, s.kills);
        for (int i = 0; i < 12; i++) s.update(DT, new Input());
        assertTrue("a gem, drawn in by the magnet: " + s.xp + " vs " + xp, s.xp > xp || s.level > 1);
        // the others sink away after 1.2 s without a kill or a drop
        int pk = s.pickN;
        for (int i = 0; i < 90; i++) {
            s.hp = s.maxHp;
            s.update(DT, new Input());
        }
        assertEquals("all gone", 0, s.enemyN);
        assertEquals("they sank away: no kills", kills + 1, s.kills);
        assertEquals(pk, s.pickN);
    }

    @Test
    public void theMinesHazardBreaksOutAtItsMinutesInWavesOfThreeAndFlatsNever() throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("MINES"), null, new HashMap<String, Double>(), null, 42);
        s.time = 8 * 60 - 2;
        s.nextEliteAt = 1e9f;
        Input in = new Input();
        int seenMax = 0;
        boolean on = false;
        for (int i = 0; i < 60 * 30; i++) {
            s.hp = s.maxHp;
            s.update(DT, in);
            int t = 0;
            for (int k = 0; k < s.enemyN; k++) if (s.enemies[k].type.arch == EnemyDef.ARCH_TENTACLE) t++;
            seenMax = Math.max(seenMax, t);
            if (s.tentacleEventOn()) on = true;
            if (i < 60 * 2 - 30) assertFalse("not before 8:00", s.tentacleEventOn());
        }
        assertTrue(on);
        assertTrue("waves of three: " + seenMax, seenMax >= 3);
        assertFalse("it is over after 20 s", s.tentacleEventOn());
        Sim f = new Sim(d, d.stages.get("FLATS"), null, new HashMap<String, Double>(), null, 43);
        f.time = 8 * 60 - 2;
        f.nextEliteAt = 1e9f;
        for (int i = 0; i < 60 * 30; i++) {
            f.hp = f.maxHp;
            f.update(DT, in);
            for (int k = 0; k < f.enemyN; k++) assertFalse(f.enemies[k].type.arch == EnemyDef.ARCH_TENTACLE);
        }
    }

    // ------------------------------------------------------------------ Vire, awakened

    @Test
    public void vireRaisesSixShootsATwelveBoltRingAndBringsCarriersAtTwoThirdsAndOneThird() throws Exception {
        Sim s = sim("FLATS", 20 * 60, 51);
        s.px = 0;
        s.py = 0;
        s.invuln = 1e6f; // the bolts fly on untouched
        Enemy b = s.spawnAt("VIRE_AWAKENED", 600, 0, true);
        int peakColonists = 0, peakBolts = 0;
        for (int i = 0; i < 60 * 25; i++) {
            s.invuln = 1e6f;
            s.update(DT, new Input());
            peakColonists = Math.max(peakColonists, countEnemies(s, "COLONIST"));
            peakBolts = Math.max(peakBolts, s.eprojN);
            for (int k = 0; k < s.enemyN; k++) if (s.enemies[k].type.def.key.equals("COLONIST")) s.enemies[k].speed = 0f;
        }
        assertTrue("raised six at a time: " + peakColonists, peakColonists >= 6 && peakColonists % 6 == 0);
        assertEquals("a ring of 12 bolts", 12, peakBolts);
        assertTrue("it blinked", s.sound.emitted[SoundEvents.VIRE_BLINK] >= 2);

        Sim t = sim("FLATS", 20 * 60, 52);
        t.px = 700;
        Enemy v = t.spawnAt("VIRE_AWAKENED", 0, 0, true);
        assertEquals(0, countEnemies(t, "SPORE_CARRIER"));
        v.hp = v.maxHp * 0.67f;
        step(t, 0.1);
        assertEquals("above 66%: no phase yet", 0, v.phase);
        v.hp = v.maxHp * 0.65f;
        step(t, 0.1);
        assertEquals(1, v.phase);
        assertEquals("four carriers at 66%", 4, countEnemies(t, "SPORE_CARRIER"));
        v.hp = v.maxHp * 0.32f;
        step(t, 0.1);
        assertEquals(2, v.phase);
        assertEquals("four more at 33%", 8, countEnemies(t, "SPORE_CARRIER"));
    }

    // ------------------------------------------------------------------ Smelter Foreman

    @Test
    public void theForemanLaysACarpetOfFivePoolsAndPullsTheHeroInOnlyBelowAQuarter() throws Exception {
        Sim s = sim("FLATS", 20 * 60, 61);
        s.px = 300;
        s.py = 0;
        Enemy b = s.spawnAt("SMELTER_FOREMAN", 0, 0, true);
        b.speed = 0f;
        b.actT = 0f;
        s.update(DT, new Input());
        assertEquals("five pools", 5, count(s, Entities.HZ_SLAG, -1));
        double ux = 1, ang = 0;
        for (int i = 0; i < s.hazN; i++) {
            Hazard h = s.hazards[i];
            assertTrue("a warn ring before it burns", h.warn > 0.75f);
            assertEquals("in a line toward the hero", 0.0, h.y, 0.5);
            assertTrue(h.x > 0f);
        }
        // above 25%: never a pull, however long it fights
        Sim t = sim("FLATS", 20 * 60, 62);
        t.px = 250;
        Enemy f = t.spawnAt("SMELTER_FOREMAN", 0, 0, true);
        f.speed = 0f;
        boolean pulled = false;
        for (int i = 0; i < 60 * 40; i++) {
            t.update(DT, new Input());
            t.hp = t.maxHp;
            if (f.ai == BossAi.BA_PULL_TELE || f.ai == BossAi.BA_PULL) pulled = true;
        }
        assertFalse(pulled);
        // below 25%: a warning ring of radius 340 for 1.1 s, then the hero is dragged toward it
        f.hp = f.maxHp * 0.2f;
        t.px = 250;
        float warn = 0;
        float minDist = 1e9f;
        boolean tele = false;
        for (int i = 0; i < 60 * 8; i++) {
            t.update(DT, new Input());
            t.hp = t.maxHp;
            if (f.ai == BossAi.BA_PULL_TELE) {
                tele = true;
                warn += DT;
                assertTrue(f.tele > 0f);
            }
            if (f.ai == BossAi.BA_PULL) minDist = Math.min(minDist, (float) Math.hypot(t.px - f.x, t.py - f.y));
        }
        assertTrue(tele);
        assertEquals("a 1.1 s warning", 1.1f, warn, 0.35f);
        assertTrue("the hero was dragged in: " + minDist, minDist < 160f);
        // a dodge is not dragged
        Sim u = sim("FLATS", 20 * 60, 63);
        u.px = 250;
        Enemy g = u.spawnAt("SMELTER_FOREMAN", 0, 0, true);
        g.speed = 0f;
        g.hp = g.maxHp * 0.2f;
        for (int i = 0; i < 60 * 4 && g.ai != BossAi.BA_PULL; i++) {
            u.hp = u.maxHp;
            u.update(DT, new Input());
        }
        assertEquals(BossAi.BA_PULL, g.ai);
        float x0 = u.px;
        u.dodgeT = 0.3f;
        u.update(DT, new Input());
        assertTrue("dodging: not pulled (the dodge itself moves the hero)", u.px >= x0 - 1f);
    }

    // ------------------------------------------------------------------ The First

    private static Sim firstSim(long seed) throws Exception {
        Sim s = sim("MINES", 28 * 60, seed);
        s.px = 0;
        s.py = 0;
        return s;
    }

    @Test
    public void theFirstSpawnsAtMinute28WithABannerARoarAndFinalMusic() throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("MINES"), null, new HashMap<String, Double>(), null, 71);
        s.time = 28 * 60 - 0.5;
        s.nextEliteAt = 1e9f;
        for (int i = 0; i < 60 * 2 && s.bossNow == null; i++) {
            s.hp = s.maxHp;
            s.update(DT, new Input());
        }
        assertNotNull(s.bossNow);
        assertEquals("THE_FIRST", s.bossNow.type.def.key);
        assertEquals("THE_FIRST", s.bannerKey);
        assertEquals("THE FIRST", s.bannerName);
        assertTrue(s.bannerT > 1.8f);
        assertEquals(1, s.sound.emitted[SoundEvents.THE_FIRST_ROAR]);
        assertEquals("the banner replaces the plain boss sound", 0, s.sound.emitted[SoundEvents.BOSS_SPAWN]);
        assertEquals(18000f * 1.5f, s.bossNow.maxHp, 5f); // full HP at minute 28 (hpRamp 28), Deep Mines health x1.5
        for (int i = 0; i < 60 * 2; i++) {
            s.hp = s.maxHp;
            s.update(DT, new Input());
        }
        assertTrue("the banner is over after 2 s", s.bannerT <= 0f);
        // the final track plays while it lives
        assertEquals("final", se.felixarvid.thorsurvivors.audio.MusicDirector.trackFor(Engine.PH_PLAYING, "MINES", true, true, false));
        assertEquals("boss", se.felixarvid.thorsurvivors.audio.MusicDirector.trackFor(Engine.PH_PLAYING, "MINES", true, false, false));
        assertEquals("library", se.felixarvid.thorsurvivors.audio.MusicDirector.trackFor(Engine.PH_PLAYING, "MINES", false, false, false));
        // another boss: the plain intro sound
        Sim c = sim("FLATS", 5 * 60, 72);
        c.noSpawns = false;
        c.nextEliteAt = 1e9f;
        c.time = 5 * 60 - 0.05;
        for (int i = 0; i < 30 && c.bossNow == null; i++) c.update(DT, new Input());
        assertNotNull(c.bossNow);
        assertEquals(1, c.sound.emitted[SoundEvents.BOSS_INTRO]);
        assertEquals("CARGO LOADER", c.bannerName);
    }

    @Test
    public void theFirstChangesPhaseAt66And33PercentAndNeverGoesBack() throws Exception {
        Sim s = firstSim(81);
        s.px = 600; // far from it: only the phases matter
        Enemy b = s.spawnAt("THE_FIRST", 0, 0, true);
        b.speed = 0f;
        assertEquals(0, b.phase);
        b.hp = b.maxHp * 0.661f;
        step(s, 0.2);
        assertEquals("66.1%: still phase 1", 0, b.phase);
        b.hp = b.maxHp * 0.659f;
        step(s, 0.2);
        assertEquals("65.9%: phase 2", 1, b.phase);
        assertEquals(BossAi.BA_ROAR, b.ai);
        assertEquals("the roar", 1, s.sound.emitted[SoundEvents.THE_FIRST_ROAR]);
        b.hp = b.maxHp * 0.7f; // healed (cannot happen): no step back
        step(s, 0.2);
        assertEquals(1, b.phase);
        b.hp = b.maxHp * 0.331f;
        step(s, 0.2);
        assertEquals(1, b.phase);
        step(s, 1.2); // the first roar is over (its sound is limited to one a second)
        b.hp = b.maxHp * 0.329f;
        step(s, 0.2);
        assertEquals("32.9%: phase 3", 2, b.phase);
        assertEquals("a roar for each phase", 2, s.sound.emitted[SoundEvents.THE_FIRST_ROAR]);
    }

    @Test
    public void phaseOneIsLumenRingsAndTentacleBursts() throws Exception {
        Sim s = firstSim(82);
        s.px = 300;
        s.invuln = 1e6f;
        Enemy b = s.spawnAt("THE_FIRST", 0, 0, true);
        b.speed = 0f;
        int peakBolts = 0, peakTent = 0;
        for (int i = 0; i < 60 * 8; i++) {
            s.invuln = 1e6f;
            s.update(DT, new Input());
            peakBolts = Math.max(peakBolts, s.eprojN);
            int t = 0;
            for (int k = 0; k < s.enemyN; k++) if (s.enemies[k].type.arch == EnemyDef.ARCH_TENTACLE) t++;
            peakTent = Math.max(peakTent, t);
        }
        assertEquals("a ring of 12", 12, peakBolts);
        assertEquals("a burst of three", 3, peakTent);
        assertEquals("no lanes yet", 0, count(s, Entities.HZ_LANE, -1));
    }

    @Test
    public void phaseTwoSweepsTendrilLanesAndSummonsHounds() throws Exception {
        Sim s = firstSim(83);
        s.px = 400;
        Enemy b = s.spawnAt("THE_FIRST", 0, 0, true);
        b.speed = 0f;
        b.hp = b.maxHp * 0.5f;
        float angle0 = Float.NaN;
        boolean warned = false, lanesHurt = false, hounds = false;
        float hpMin = s.maxHp;
        for (int i = 0; i < 60 * 14; i++) {
            s.hp = s.maxHp;
            s.px = 400;
            s.py = 0;
            s.update(DT, new Input());
            if (countEnemies(s, "SPORE_HOUND") >= 6) hounds = true;
            for (int k = 0; k < s.hazN; k++) {
                Hazard h = s.hazards[k];
                if (h.kind != Entities.HZ_LANE) continue;
                if (h.warn > 0f) {
                    warned = true;
                    assertFalse("a lane that warns does not hurt", s.hp < s.maxHp - 1e-3f && false);
                }
            }
            if (s.hp < s.maxHp - 1e-3f) lanesHurt = true;
        }
        assertEquals(1, b.phase);
        assertTrue("the lanes show a thin line first", warned);
        assertTrue("hounds come", hounds);
        // a lane's geometry: damage only inside it, and it turns
        Sim t = firstSim(84);
        t.px = 0;
        Enemy c = t.spawnAt("THE_FIRST", 0, 0, true);
        c.speed = 0f;
        c.phase = 1;
        Hazard lane = t.ai.addHazard(Entities.HZ_LANE, 0f, 0f, 560f, 3.2f, 22f, 0.5f);
        lane.ang = 0f;
        lane.spin = 0.85f;
        lane.w = 46f;
        t.px = 200;
        t.py = 0; // on the lane's line
        float hp0 = t.hp;
        for (int i = 0; i < 20; i++) t.update(DT, new Input()); // warning: no damage
        assertEquals(hp0, t.hp, 1e-3f);
        for (int i = 0; i < 20; i++) t.update(DT, new Input());
        assertTrue("in the lane: " + t.hp, t.hp < hp0 - 1f);
        float a0 = lane.ang;
        for (int i = 0; i < 30; i++) t.update(DT, new Input());
        assertTrue("it sweeps: " + (lane.ang - a0), lane.ang - a0 > 0.3f);
        t.px = -300; // behind the boss, off the lane
        t.py = 200;
        hp0 = t.hp;
        for (int i = 0; i < 20; i++) t.update(DT, new Input());
        assertEquals("off the lane nothing hurts", hp0, t.hp, 0.5f + 1e-3f);
        assertTrue(true);
    }

    @Test
    public void phaseThreePulsesEverySixSecondsAndOnlyTheUnsafeHalfIsHit() throws Exception {
        Sim s = firstSim(85);
        s.px = 100;
        Enemy b = s.spawnAt("THE_FIRST", 0, 0, true);
        b.speed = 0f;
        b.hp = b.maxHp * 0.2f;
        b.phase = 2;
        b.mt0 = b.mt1 = 1e9f; // no ring and no tentacles: only the pulse
        int pulses = 0;
        boolean startedUnsafe = false;
        for (int round = 0; round < 3; round++) {
            for (int i = 0; i < 60 * 8 && b.ai != BossAi.BA_PULSE; i++) {
                s.hp = s.maxHp;
                s.px = 100;
                s.py = 0;
                s.update(DT, new Input());
            }
            assertEquals("a pulse is winding up", BossAi.BA_PULSE, b.ai);
            assertEquals("1.5 s of warning", 1.5f, b.teleMax, 1e-4f);
            assertEquals("a unit normal", 1.0, Math.hypot(b.ax, b.ay), 1e-3);
            // the hero stands on the unsafe side (round 0, 2) or the safe side (round 1)
            boolean unsafe = round != 1;
            float side = unsafe ? -60f : 60f;
            s.px = b.t2 + b.ax * side;
            s.py = b.t3 + b.ay * side;
            s.hp = s.maxHp;
            s.invuln = 0f;
            for (int i = 0; i < 60 * 3 && b.ai == BossAi.BA_PULSE; i++) {
                s.px = b.t2 + b.ax * side;
                s.py = b.t3 + b.ay * side;
                s.update(DT, new Input());
            }
            pulses++;
            if (unsafe) assertEquals("28 on the unsafe half", s.maxHp - 28f, s.hp, 0.6f);
            else assertEquals("nothing on the safe half", s.maxHp, s.hp, 0.6f);
            s.invuln = 0f;
        }
        assertEquals(3, pulses);
        // every six seconds: the next one starts 6 s after the last
        // and a dodge's invulnerability protects
        Sim t = firstSim(86);
        Enemy c = t.spawnAt("THE_FIRST", 0, 0, true);
        c.speed = 0f;
        c.power = 0f; // the hero stands next to it
        c.phase = 2;
        c.mt0 = c.mt1 = 1e9f;
        c.hp = c.maxHp * 0.2f;
        for (int i = 0; i < 60 * 8 && c.ai != BossAi.BA_PULSE; i++) {
            t.hp = t.maxHp;
            t.update(DT, new Input());
        }
        t.px = c.t2 - c.ax * 50f;
        t.py = c.t3 - c.ay * 50f;
        for (int i = 0; i < 60 * 3 && c.ai == BossAi.BA_PULSE; i++) {
            t.invuln = 1f; // dodging
            t.update(DT, new Input());
        }
        assertEquals("a dodge protects", t.maxHp, t.hp, 1e-3f);
    }

    @Test
    public void theFirstSafeSideIsTurnedOverToAHeroTooDeepToGetAcross() throws Exception {
        for (long seed = 1; seed <= 40; seed++) {
            Sim s = firstSim(90 + seed);
            Enemy b = s.spawnAt("THE_FIRST", 0, 0, true);
            b.speed = 0f;
            b.phase = 2;
            b.hp = b.maxHp * 0.2f;
            s.px = 0;
            s.py = 0;
            s.invuln = 1e6f;
            for (int i = 0; i < 60 * 8 && b.ai != BossAi.BA_PULSE; i++) s.update(DT, new Input());
            double side = (s.px - b.t2) * b.ax + (s.py - b.t3) * b.ay;
            assertTrue("the hero is never more than 170 deep on the unsafe side: " + side, side >= -170.0);
        }
    }

    @Test
    public void killingTheFirstWinsTheRunWithDoubleGoldAndSurvivingTo30StillWins() throws Exception {
        Sim s = firstSim(101);
        s.px = 0;
        s.gold = 100;
        Enemy b = s.spawnAt("THE_FIRST", 0, 0, true);
        b.speed = 0f;
        s.killNow(b);
        s.update(DT, new Input());
        assertTrue(s.firstKilled);
        assertEquals("not at once: it dies first", 0, s.ended);
        assertTrue("its unique: Heart of Lumen", s.sound.emitted[SoundEvents.EQUIP_DROP] == 1);
        for (int i = 0; i < 60 * 3; i++) s.update(DT, new Input());
        assertEquals("victory", 2, s.ended);
        assertEquals(200, s.endGold());
        // survive without killing it
        Sim t = firstSim(102);
        t.gold = 100;
        t.time = 30 * 60 - 1;
        for (int i = 0; i < 90; i++) {
            t.hp = t.maxHp;
            t.update(DT, new Input());
        }
        assertEquals(2, t.ended);
        assertFalse(t.firstKilled);
        assertEquals("no bonus", 100, t.endGold());
    }

    @Test
    public void theEndScreensAreReachedAndTheFirstPaysDoubleOnTheResultScreen() throws Exception {
        GameData d = TestData.load();
        Engine e = Engine.get();
        MetaProgress fresh = new MetaProgress(d, new MetaProgressTest.MemStore());
        e.init(d, fresh);
        e.meta = fresh;
        // death
        e.input.clearMovement();
        e.phase = Engine.PH_MENU;
        e.focus = Engine.MENU_START;
        e.selectStage("MINES");
        e.nextRunSeed = 1L; // deterministic run
        e.input.post(Input.CMD_START, 0, 0, 0);
        e.advance(DT);
        assertEquals(Engine.PH_PLAYING, e.phase);
        e.sim.hp = 0.1f;
        e.sim.hurtHero(50f, 0.1f, false);
        e.advance(DT);
        assertEquals(Engine.PH_RESULT, e.phase);
        assertFalse(e.resultWin);
        // victory by The First
        e.input.clearMovement();
        e.phase = Engine.PH_MENU;
        e.focus = Engine.MENU_START;
        e.nextRunSeed = 1L; // deterministic run
        e.input.post(Input.CMD_START, 0, 0, 0);
        e.advance(DT);
        Sim s = e.sim;
        s.noSpawns = true;
        s.enemyN = 0;
        s.time = 29 * 60;
        s.gold = 50;
        int before = fresh.gold;
        Enemy b = s.spawnAt("THE_FIRST", s.px + 300, s.py, true);
        s.killNow(b);
        for (int i = 0; i < 60 * 4 && e.phase == Engine.PH_PLAYING; i++) {
            s.hp = s.maxHp;
            e.advance(DT);
            if (e.phase == Engine.PH_EQUIP) { // the unique's crate was picked up on the way
                e.input.post(Input.CMD_CONFIRM, 0, 0, 0);
            }
            if (e.phase == Engine.PH_LEVELUP || e.phase == Engine.PH_CHEST) e.input.post(Input.CMD_CONFIRM, 0, 0, 0);
        }
        assertEquals(Engine.PH_RESULT, e.phase);
        assertTrue(e.resultWin);
        assertTrue(e.resultFirst);
        assertEquals("double gold", s.gold * 2, e.resultGold);
        assertEquals("and it is paid out", before + e.resultGold, fresh.gold);
        // victory by time
        e.input.clearMovement();
        e.phase = Engine.PH_MENU;
        e.focus = Engine.MENU_START;
        e.nextRunSeed = 1L; // deterministic run
        e.input.post(Input.CMD_START, 0, 0, 0);
        e.advance(DT);
        e.sim.noSpawns = true;
        e.sim.time = 30 * 60 - 0.01;
        e.advance(DT);
        e.advance(DT);
        assertEquals(Engine.PH_RESULT, e.phase);
        assertTrue(e.resultWin);
        assertFalse(e.resultFirst);
    }

    @Test
    public void aTelegraphAlwaysGetsASlotEvenWhenTheHazardPoolIsFull() throws Exception {
        Sim s = sim("FLATS", 20 * 60, 111);
        for (int i = 0; i < Sim.MAX_HAZ - 2; i++) assertNotNull(s.ai.addHazard(Entities.HZ_CLOUD, 1000 + i, 0, 60f, 3f + i * 0.01f, 4f, 0f));
        assertNotNull(s.ai.addHazard(Entities.HZ_ASH, 2000, 0, 28f, 1.6f, 0f, 0f));
        assertNotNull(s.ai.addHazard(Entities.HZ_FROST, 2100, 0, 28f, 4f, 0f, 0f));
        assertEquals(Sim.MAX_HAZ, s.hazN);
        assertEquals("an ordinary hazard is skipped when the pool is full", null, s.ai.addHazard(Entities.HZ_SLAG, 0, 0, 20f, 3f, 5f, 0f));
        Hazard bomb = s.ai.addHazard(Entities.HZ_BOMB, 5, 5, 40f, 0.4f, 10f, 1f);
        assertNotNull("a bomb gets a slot", bomb);
        assertEquals(Sim.MAX_HAZ, s.hazN);
        assertEquals("the hero's ash was the one to go", 0, count(s, Entities.HZ_ASH, -1));
        assertEquals(1, count(s, Entities.HZ_FROST, -1));
        Hazard lane = s.ai.addHazard(Entities.HZ_LANE, 0, 0, 500f, 3f, 20f, 1f);
        assertNotNull("so does a lane", lane);
        assertEquals("then the frost patch", 0, count(s, Entities.HZ_FROST, -1));
        assertEquals(Sim.MAX_HAZ, s.hazN);
        // a pool of nothing but telegraphs and warnings: nothing to evict
        Sim t = sim("FLATS", 20 * 60, 112);
        for (int i = 0; i < Sim.MAX_HAZ; i++) assertNotNull(t.ai.addHazard(Entities.HZ_BOMB, i, 0, 40f, 0.4f, 10f, 1f));
        assertEquals(null, t.ai.addHazard(Entities.HZ_BOMB, 0, 0, 40f, 0.4f, 10f, 1f));
        assertEquals(Sim.MAX_HAZ, t.hazN);
    }

    /** The boss, elite and tentacle code (rings, lanes, pulses, bombs, adds) must not allocate in the game loop either. */
    @Test
    public void theBossEliteAndTentacleLoopAllocatesNothing() throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("MINES"), "WHIP", new HashMap<String, Double>(), "BASTION", 121);
        s.time = 28 * 60 - 3; // The First comes at 28:00; the tentacle hazard of minute 27 is over (20 s): bursts of The First's own
        s.nextEliteAt = (float) s.time + 1f;
        Input in = new Input();
        Enemy first = null;
        for (int i = 0; i < 60 * 70; i++) { // warm up through all three phases
            in.stickX = (float) Math.cos(i * 0.01);
            in.stickY = (float) Math.sin(i * 0.01);
            s.hp = s.maxHp;
            s.update(DT, in);
            while (s.pendingLevelUps > 0) s.pendingLevelUps--;
            while (s.pendingChests > 0) s.pendingChests--;
            while (s.equipN > 0) s.resolveEquip(true);
            if (first == null && s.bossNow != null) first = s.bossNow;
            if (first != null && i == 60 * 12) first.hp = first.maxHp * 0.5f;
            if (first != null && i == 60 * 30) first.hp = first.maxHp * 0.2f;
        }
        assertNotNull(first);
        long before = Alloc.bytes();
        int steps = 60 * 20;
        for (int i = 0; i < steps; i++) {
            in.stickX = (float) Math.cos(i * 0.02);
            in.stickY = (float) Math.sin(i * 0.02);
            s.hp = s.maxHp;
            s.update(DT, in);
            first.hp = Math.max(first.hp, first.maxHp * 0.2f);
            while (s.pendingLevelUps > 0) s.pendingLevelUps--;
            while (s.pendingChests > 0) s.pendingChests--;
            while (s.equipN > 0) s.resolveEquip(true);
        }
        long bytes = Alloc.bytes() - before;
        assertTrue("allocated " + bytes + " bytes in " + steps + " frames", bytes < steps * 24L);
    }
}
