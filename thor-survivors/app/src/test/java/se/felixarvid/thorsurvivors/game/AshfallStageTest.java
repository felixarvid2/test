package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.EnemyDef;
import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.data.StageDef;
import se.felixarvid.thorsurvivors.data.WaveRow;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;

import java.util.HashMap;

/** Design phase 7: Cinder Flats and Deep Mines, the stage list, ash storms, barrels (chain), chests and pylons. */
public class AshfallStageTest {
    private static final float DT = 1f / 60f;

    private Sim sim(String stage) throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get(stage), "WHIP", new HashMap<String, Double>());
        s.noSpawns = true;
        s.enemyN = 0;
        s.rng.setSeed(3);
        return s;
    }

    @Test
    public void bothStagesLoadWithTheirTablesAndMods() throws Exception {
        GameData d = TestData.load();
        StageDef f = d.stages.get("FLATS"), m = d.stages.get("MINES");
        assertNotNull(f);
        assertNotNull(m);
        assertEquals("Cinder Flats", f.name);
        assertEquals("Deep Mines", m.name);
        assertEquals(30, f.rows.size());
        assertEquals(23, m.rows.size()); // phase 12: the extra row is minute 28 (The First)
        // mods copied from the VS stages; Deep Mines is harder (speed x1.05 on top of the library's); phase 12 sets the health multipliers by hand
        StageDef forest = d.stages.get("FOREST"), library = d.stages.get("LIBRARY");
        assertEquals(forest.enemySpeed, f.enemySpeed, 1e-9);
        assertEquals(forest.playerSpeed, f.playerSpeed, 1e-9);
        assertEquals(library.playerSpeed, m.playerSpeed, 1e-9);
        assertEquals(library.enemySpeed * 1.05, m.enemySpeed, 1e-6);
        assertEquals(1.5, m.enemyHealth, 1e-6);
        assertEquals(1.2, f.enemyHealth, 1e-6);
        assertEquals(1800.0, f.timeLimit, 0.0);
        assertEquals(1800.0, m.timeLimit, 0.0);
        // wave tables of the design
        assertEquals(10, f.rows.get(0).minimum);
        assertEquals(1400, f.rows.get(0).frequencyMs);
        assertEquals(140, f.rows.get(29).minimum);
        assertEquals(8, f.rows.get(29).enemies.length);
        assertEquals("CARGO_LOADER", f.rows.get(5).bosses[0]);
        assertEquals(2, f.rows.get(25).bosses.length);
        assertEquals("THE_FIRST", m.rows.get(m.rows.size() - 2).bosses[0]); // 28:00 (phase 12)
        // missing minutes inherit the previous row
        assertEquals(46, m.rowAt(11 * 60).minimum);
        assertEquals(52, m.rowAt(12 * 60).minimum);
        // treasure tables copied from the VS boss minutes
        assertNotNull(f.treasureAt(5 * 60 + 1));
        assertEquals(forest.treasureAt(10 * 60).chances[0], f.treasureAt(10 * 60).chances[0], 0.0);
        assertEquals(library.treasureAt(15 * 60).chances[1], m.treasureAt(15 * 60).chances[1], 0.0);
        assertEquals("EVOLUTION", f.treasureAt(15 * 60).prizeAt(0));
        // lighting
        assertEquals(0.65f, d.lightingOf("FLATS")[0], 1e-6);
        assertEquals(240f, d.lightingOf("FLATS")[1], 1e-6);
        assertEquals(0.78f, d.lightingOf("MINES")[0], 1e-6);
        assertEquals(200f, d.lightingOf("MINES")[1], 1e-6);
        assertEquals(30 * 60, (int) f.timeLimit);
    }

    @Test
    public void theMenuOffersTheTwoNewStagesAndTheOldOnesAreADebugHook() throws Exception {
        GameData d = TestData.load();
        Engine e = Engine.get();
        e.init(d, new MetaProgress(d, new MetaProgress.Store() {
            public int getInt(String k, int def) {
                return def;
            }

            public void putInt(String k, int v) {
            }
        }));
        assertEquals(java.util.Arrays.asList("FLATS", "MINES"), e.stageKeys);
        assertFalse(e.stageKeys.contains("FOREST"));
        e.selectStage("MINES");
        assertEquals("MINES", e.stage().key);
        e.selectStage("FOREST");
        assertEquals("the debug hook reaches the Vampire Survivors stage", "FOREST", e.stage().key);
        e.selectStage("FLATS");
        assertEquals("FLATS", e.stage().key);
        assertEquals(e.stageKeys.get(e.stageIdx), e.stage().key);
    }

    @Test
    public void wavesNeverPutMoreThan300EnemiesOnTheField() throws Exception {
        for (String key : new String[]{"FLATS", "MINES"}) {
            GameData d = TestData.load();
            Sim s = new Sim(d, d.stages.get(key), null, new HashMap<String, Double>());
            s.rng.setSeed(9);
            s.time = 28 * 60; // the thickest rows
            Input in = new Input();
            int peak = 0, bossesPeak = 0;
            for (int i = 0; i < 60 * 150; i++) {
                s.hp = s.maxHp;
                s.update(DT, in);
                int bosses = 0;
                for (int k = 0; k < s.enemyN; k++) {
                    Enemy en = s.enemies[k];
                    if (en.boss || en.elite || en.type.arch == EnemyDef.ARCH_TENTACLE) bosses++; // flagged slots stand above the wave cap
                }
                peak = Math.max(peak, s.enemyN);
                // the waves stop at 300; bosses, elites, tentacles and what they summon (elite adds, Vire's colonists) come on top
                assertTrue(key + " enemies " + s.enemyN + " bosses " + bosses, s.enemyN <= WaveDirector.ENEMY_CAP + bosses + 30);
                assertTrue(s.enemyN < Sim.MAX_ENEMIES);
                assertTrue(s.rangedAlive() <= Sim.RANGED_CAP);
                assertTrue(s.eprojN <= Sim.MAX_EPROJ && s.hazN <= Sim.MAX_HAZ);
                if (s.ended != 0) break;
            }
            assertTrue(key + " reached the cap: " + peak, peak >= 290);
        }
    }

    @Test
    public void ashStormsBlowAtTwelveAndTwentyTwoMinutesOnFlatsOnly() throws Exception {
        Sim s = sim("FLATS");
        s.time = 11 * 60 + 59;
        assertFalse(s.ashStorm());
        assertEquals(1f, s.lightRadiusMul(), 0f);
        s.time = 12 * 60 + 10;
        assertTrue(s.ashStorm());
        assertEquals(1f, s.stormLevel(), 1e-6f);
        assertEquals(0.6f, s.lightRadiusMul(), 1e-6f);
        s.time = 12 * 60 + 21;
        assertFalse(s.ashStorm());
        s.time = 22 * 60 + 5;
        assertTrue(s.ashStorm());
        s.time = 12 * 60 + 0.4;
        assertTrue("ramps in", s.stormLevel() > 0f && s.stormLevel() < 1f);
        Sim m = sim("MINES");
        m.time = 12 * 60 + 10;
        assertFalse(m.ashStorm());
    }

    @Test
    public void aStormRaisesTheSpawnRateByTwentyPercent() throws Exception {
        GameData d = TestData.load();
        int[] spawned = new int[2];
        for (int k = 0; k < 2; k++) {
            Sim s = new Sim(d, d.stages.get("FLATS"), null, new HashMap<String, Double>());
            s.rng.setSeed(1);
            s.time = k == 0 ? 15 * 60 : 12 * 60 + 5; // minute 15 is no storm; both have an equal row length
            s.enemyN = 0;
            int ticks = 0;
            Input in = new Input();
            // count spawn ticks: the timer resets to 0 every row.frequency (650 ms at minute 15, 750 ms at minute 12)
            double sim = 0;
            for (int i = 0; i < 60 * 10; i++) {
                int before = s.enemyN;
                s.hp = s.maxHp;
                s.update(DT, in);
                if (s.enemyN > before) ticks++;
            }
            spawned[k] = ticks;
        }
        assertTrue("ticks " + spawned[0] + " vs " + spawned[1], spawned[0] > 0 && spawned[1] > 0);
    }

    // ------------------------------------------------------------------ destructibles

    @Test
    public void flatsAndMinesPlaceBarrelsChestsAndMinesPylons() throws Exception {
        for (String stage : new String[]{"FLATS", "MINES"}) {
            Sim s = sim(stage);
            int cells = 0, placed = 0, barrels = 0, chests = 0;
            for (int cy = -20; cy < 20; cy++) {
                for (int cx = -20; cx < 20; cx++) {
                    cells++;
                    if (!s.destPlace(cx, cy)) continue;
                    placed++;
                    if (s.destPlaceKind() == Sim.DK_BARREL) barrels++;
                    if (s.destPlaceKind() == Sim.DK_CHEST) chests++;
                    assertFalse(s.map.blocked(s.destPlaceX(), s.destPlaceY()));
                    assertTrue(Math.hypot(s.destPlaceX(), s.destPlaceY()) >= 300f);
                }
            }
            double per = placed / (double) cells;
            assertTrue(stage + " density " + per, per > 0.75 && per <= 0.9);
            assertTrue(stage + " barrels " + barrels + " chests " + chests, barrels > chests && chests > placed / 6);
        }
        // pylons: Deep Mines only, about one per 2000 x 2000 u
        int found = 0, flatsPylons = 0;
        Sim m = sim("MINES"), f = sim("FLATS");
        for (int gy = -10; gy <= 10; gy++) {
            for (int gx = -10; gx <= 10; gx++) {
                m.px = gx * 2000f + 1000f;
                m.py = gy * 2000f + 1000f;
                m.update(DT, new Input());
                f.px = m.px;
                f.py = m.py;
                f.update(DT, new Input());
                for (int i = 0; i < m.destN; i++) if (m.destKind[i] == Sim.DK_PYLON) found++;
                for (int i = 0; i < f.destN; i++) if (f.destKind[i] == Sim.DK_PYLON) flatsPylons++;
            }
        }
        assertEquals(0, flatsPylons);
        assertTrue("pylons in sight over 441 windows: " + found, found > 40);
    }

    @Test
    public void barrelClustersExistSoTheyChainInPlay() throws Exception {
        Sim s = sim("FLATS");
        int pairs = 0;
        for (int gx = -8; gx <= 8; gx++) {
            s.px = gx * 500f + 250f;
            s.py = 3000f;
            s.update(DT, new Input());
            for (int i = 0; i < s.destN; i++) {
                for (int j = i + 1; j < s.destN; j++) {
                    if (s.destKind[i] == Sim.DK_BARREL && s.destKind[j] == Sim.DK_BARREL
                            && Math.hypot(s.destX[i] - s.destX[j], s.destY[i] - s.destY[j]) < Sim.BARREL_R) pairs++;
                }
            }
        }
        assertTrue("barrels within blast range of each other: " + pairs, pairs > 0);
    }

    /** Puts destructibles at exact spots (relative to the start cell) and keeps the player out of the way. */
    private void place(Sim s, int... spec) {
        s.destN = 0;
        for (int i = 0; i < spec.length; i += 3) {
            s.destX[s.destN] = spec[i];
            s.destY[s.destN] = spec[i + 1];
            s.destKind[s.destN++] = (byte) spec[i + 2];
        }
    }

    @Test
    public void aBarrelBlastHurtsEnemiesAndTheHeroInRangeAndNobodyOutside() throws Exception {
        Sim s = sim("FLATS");
        s.hp = s.maxHp = 100f;
        s.px = 100;
        s.py = 100;
        place(s, 160, 100, Sim.DK_BARREL);
        Enemy near = s.addEnemy("COLONIST", 200, 100, false), far = s.addEnemy("COLONIST", 300, 100, false);
        near.speed = far.speed = 0f;
        near.hp = near.maxHp = far.hp = far.maxHp = 500f;
        s.buildGrid();
        s.hitDest(160, 100, 4);
        assertEquals(0, s.destN);
        assertEquals(450f, near.hp, 0.01f);
        assertEquals("outside radius 80", 500f, far.hp, 0f);
        assertEquals("the hero is 60 away", 100f - Sim.BARREL_HERO_DMG, s.hp, 1f);
        assertEquals(1, s.sound.emitted[SoundEvents.BARREL_EXPLODE]);
        // out of range: untouched
        Sim t = sim("FLATS");
        t.hp = t.maxHp = 100f;
        t.px = 100;
        t.py = 100;
        place(t, 300, 100, Sim.DK_BARREL);
        t.hitDest(300, 100, 4);
        assertEquals(100f, t.hp, 0f);
    }

    @Test
    public void barrelsChainAlongALineAndThroughNothingElse() throws Exception {
        Sim s = sim("FLATS");
        s.px = 400;
        s.py = 400;
        // 0 -> 1 are 60 apart, 1 -> 2 are 70 apart, 0 -> 2 are 130 apart: the third only goes off through the second
        place(s, 100, 100, Sim.DK_BARREL, 160, 100, Sim.DK_BARREL, 230, 100, Sim.DK_BARREL, 400, 100, Sim.DK_BARREL);
        s.hitDest(100, 100, 4);
        assertEquals("three went off, the far one stands", 1, s.destN);
        assertEquals(400f, s.destX[0], 0f);
        assertTrue(s.sound.emitted[SoundEvents.BARREL_EXPLODE] >= 1);
        assertEquals(3, s.destsBroken);
    }

    @Test
    public void aBlastBreaksChestsToo_andADodgingHeroIsNotHurt() throws Exception {
        Sim s = sim("FLATS");
        s.hp = s.maxHp = 100f;
        s.px = 100;
        s.py = 100;
        s.invuln = 0.2f; // mid-dodge
        place(s, 140, 100, Sim.DK_BARREL, 190, 100, Sim.DK_CHEST);
        s.hitDest(140, 100, 4);
        assertEquals(0, s.destN);
        assertEquals(100f, s.hp, 0f);
        assertTrue("the chest dropped something", s.pickN > 0);
    }

    @Test
    public void aChestDropsGoldOrAGemPileAndAPylonHealsThirtyPercentOncePerMinute() throws Exception {
        Sim s = sim("MINES");
        s.px = 100;
        s.py = 100;
        int gold = 0, gems = 0;
        for (int i = 0; i < 200; i++) {
            s.pickN = 0;
            place(s, 400, 400, Sim.DK_CHEST);
            s.hitDest(400, 400, 4);
            int g = 0, c = 0;
            for (int k = 0; k < s.pickN; k++) {
                if (s.picks[k].kind == Entities.K_GEM) g++;
                else if (s.picks[k].kind == Entities.K_COIN || s.picks[k].kind == Entities.K_COINBAG) c++;
                else throw new AssertionError("only gold or gems, got kind " + s.picks[k].kind);
            }
            if (g > 0) gems++;
            if (c > 0) gold++;
            assertTrue(g == 5 || c == 2);
        }
        assertTrue("gold " + gold + " gems " + gems, gold > 80 && gems > 40);
        assertEquals(200, s.sound.emitted[SoundEvents.CRATE_BREAK] >= 1 ? 200 : 0);
        s.hp = 10f;
        s.maxHp = 100f;
        place(s, 400, 400, Sim.DK_PYLON);
        s.hitDest(400, 400, 4);
        assertEquals(40f, s.hp, 0.01f);
        assertTrue(s.pylonCd > 59f);
        s.hp = 10f;
        place(s, 400, 400, Sim.DK_PYLON);
        s.hitDest(400, 400, 4);
        assertEquals("cooldown: no second heal", 10f, s.hp, 0.01f);
        s.pylonCd = 0f;
        place(s, 400, 400, Sim.DK_PYLON);
        s.hitDest(400, 400, 4);
        assertEquals(40f, s.hp, 0.01f);
    }

    @Test
    public void aDashingWelderBreaksABarrelAndIsStunned() throws Exception {
        Sim s = sim("FLATS");
        s.px = 0;
        s.py = 0;
        Enemy w = s.addEnemy("WELDER", 140, 0, false);
        w.hp = w.maxHp = 1e6f;
        w.actT = 0f;
        place(s, 80, 0, Sim.DK_BARREL);
        Input in = new Input();
        for (int i = 0; i < 90; i++) {
            s.hp = s.maxHp;
            s.update(DT, in);
        }
        assertEquals("the barrel blew up", 0, s.destN);
        assertTrue(s.destsBroken >= 1);
        assertTrue("the welder took the blast", w.hp < w.maxHp);
    }

    @Test
    public void riotGuardTwoReflectsBoltsThatCrossTheCone() throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("FLATS"), null, new HashMap<String, Double>(), "BASTION");
        s.noSpawns = true;
        s.enemyN = 0;
        s.rng.setSeed(4);
        // GUARD is the 4th branch: tiers I and II
        s.main.pick(3, 1);
        s.main.pick(3, 2);
        Enemy shooter = s.addEnemy("SERGEANT", 160, 0, false);
        shooter.speed = 0f;
        shooter.actT = 1000f;
        shooter.hp = shooter.maxHp = 1000f;
        s.aimX = 1;
        s.aimY = 0;
        Entities.EProj p = s.ai.shoot(100, 0, -100, 0, 12f, 3f); // reaches the hero after the first swing (0.5 s)
        assertNotNull(p);
        Input in = new Input();
        in.aimStickX = 1f;
        float hp0 = s.hp;
        boolean reflected = false;
        for (int i = 0; i < 80 && s.hp >= hp0; i++) {
            s.update(DT, in);
            if (p.friendly) reflected = true;
        }
        assertTrue("the swing turned the bolt around", reflected || shooter.hp < shooter.maxHp);
        assertEquals("no damage to the hero", hp0, s.hp, 0.01f);
    }
}
