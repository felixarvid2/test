package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.data.WaveRow;

import java.util.HashMap;
import java.util.Random;

/** Headless runs: the Sim raises the right sound events. */
public class SimSoundTest {
    private static final float DT = 1f / 60f;

    private Sim fresh(String stage, String starter) throws Exception {
        GameData d = TestData.load();
        return new Sim(d, d.stages.get(stage), starter, new HashMap<String, Double>());
    }

    private void runWalking(Sim s, double seconds) {
        Input in = new Input();
        Random rng = new Random(5);
        int step = 0;
        while (s.time < seconds && s.ended == 0) {
            if (step++ % 120 == 0) {
                in.stickX = rng.nextFloat() * 2 - 1;
                in.stickY = rng.nextFloat() * 2 - 1;
            }
            s.hp = s.maxHp;
            s.update(DT, in);
            while (s.pendingLevelUps > 0) s.pendingLevelUps--;
            s.sound.clear(); // nobody drains the queue here; the counters are what is checked
        }
    }

    @Test
    public void everyStarterWeaponHasItsOwnSound() throws Exception {
        String[] keys = {"WHIP", "MAGIC_MISSILE", "KNIFE", "AXE", "CROSS", "HOLYBOOK", "FIREBALL", "GARLIC", "HOLYWATER",
                "LIGHTNING"};
        int[] ids = {SoundEvents.WHIP, SoundEvents.MAGIC_MISSILE, SoundEvents.KNIFE, SoundEvents.AXE, SoundEvents.CROSS,
                SoundEvents.BIBLE, SoundEvents.FIREBALL, SoundEvents.GARLIC, SoundEvents.HOLY_WATER, SoundEvents.LIGHTNING};
        for (int i = 0; i < keys.length; i++) {
            Sim s = fresh("FOREST", keys[i]);
            runWalking(s, 40);
            assertTrue(keys[i] + " plays " + SoundEvents.NAMES[ids[i]], s.sound.emitted[ids[i]] > 0);
        }
    }

    @Test
    public void aRunHitsKillsAndPicksUp() throws Exception {
        Sim s = fresh("FOREST", "WHIP");
        runWalking(s, 90);
        assertTrue("death", s.sound.emitted[SoundEvents.ENEMY_DEATH] > 0);
        assertTrue("gem", s.sound.emitted[SoundEvents.GEM] > 0);
        assertTrue("hurt", s.sound.emitted[SoundEvents.PLAYER_HURT] > 0);
        assertTrue("level up", s.sound.emitted[SoundEvents.LEVEL_UP] > 0);
        assertTrue("rate limited", s.sound.limited > 0);
    }

    @Test
    public void aHitThatDoesNotKillPlaysTheHitSound() throws Exception {
        Sim s = fresh("FOREST", "WHIP");
        s.noSpawnsForTest();
        s.enemyN = 0;
        Entities.Enemy e = s.addEnemy("ZOMBIE", s.px + 60, s.py, false);
        e.hp = e.maxHp = 1e7f;
        s.facingRight = true;
        for (int i = 0; i < 120; i++) s.update(DT, new Input());
        assertTrue("hit", s.sound.emitted[SoundEvents.ENEMY_HIT] > 0);
        assertEquals(0, s.sound.emitted[SoundEvents.ENEMY_DEATH]);
    }

    private void pickup(Sim s, int kind, float value) {
        Entities.Pickup p = s.picks[s.pickN++];
        p.kind = kind;
        p.x = s.px;
        p.y = s.py;
        p.value = value;
        p.pulled = false;
    }

    @Test
    public void gemsInQuickSuccessionRaiseThePitchChain() throws Exception {
        Sim s = fresh("FOREST", "WHIP");
        s.noSpawnsForTest();
        s.enemyN = 0;
        for (int i = 0; i < 3; i++) pickup(s, Entities.K_GEM, 1);
        s.update(DT, new Input());
        for (int i = 0; i < 3; i++) {
            int e = s.sound.poll();
            assertEquals(SoundEvents.GEM, SoundEvents.idOf(e));
            assertEquals(i, SoundEvents.argOf(e));
        }
        // after a pause the chain starts over
        s.sound.clear();
        for (int i = 0; i < 60; i++) s.update(DT, new Input());
        pickup(s, Entities.K_GEM, 1);
        s.update(DT, new Input());
        assertEquals(0, SoundEvents.argOf(s.sound.poll()));
    }

    @Test
    public void coinFoodAndLevelUpHaveSounds() throws Exception {
        Sim s = fresh("FOREST", "WHIP");
        s.noSpawnsForTest();
        s.enemyN = 0;
        pickup(s, Entities.K_COIN, 1);
        pickup(s, Entities.K_ROAST, 0);
        pickup(s, Entities.K_GEM, 1e6f);
        s.update(DT, new Input());
        assertEquals(1, s.sound.emitted[SoundEvents.COIN]);
        assertEquals(1, s.sound.emitted[SoundEvents.FOOD_HEAL]);
        assertEquals(1, s.sound.emitted[SoundEvents.LEVEL_UP]);
    }

    @Test
    public void chestAndEvolutionSounds() throws Exception {
        GameData d = TestData.load();
        Sim s = fresh("FOREST", "WHIP");
        s.pendingChests = 2;
        s.openChest();
        assertEquals(1, s.sound.emitted[SoundEvents.CHEST_OPEN]);
        assertEquals(0, s.sound.emitted[SoundEvents.EVOLUTION]);
        while (s.inv.levelUp("WHIP") > 0) { /* to max */ }
        s.inv.add(d.weapons.get("MAXHEALTH"));
        s.sound.advance(1f);
        s.openChest();
        assertEquals(1, s.sound.emitted[SoundEvents.EVOLUTION]);
        assertEquals(2, s.sound.emitted[SoundEvents.CHEST_OPEN]);
    }

    @Test
    public void brazierBreakAndBossSpawn() throws Exception {
        Sim s = fresh("FOREST", "WHIP");
        s.noSpawnsForTest();
        s.enemyN = 0;
        s.px = s.destX[0] - 70;
        s.py = s.destY[0];
        s.facingRight = true;
        for (int i = 0; i < 120 && s.destsBroken == 0; i++) s.update(DT, new Input());
        assertEquals(1, s.sound.emitted[SoundEvents.BRAZIER_BREAK]);

        GameData d = TestData.load();
        Sim b = fresh("FOREST", "WHIP");
        b.update(DT, new Input());
        int minute = -1;
        for (WaveRow r : d.stages.get("FOREST").rows) {
            for (String boss : r.bosses) if (!boss.equals("BOSS_XLDEATH")) minute = minute < 0 ? r.minute : minute;
        }
        assertTrue("the forest has a boss row", minute > 0);
        b.hp = b.maxHp = 1e9f;
        b.time = minute * 60.0;
        b.update(DT, new Input());
        assertTrue("boss", b.sound.emitted[SoundEvents.BOSS_SPAWN] > 0);
    }

    @Test
    public void damageToThePlayerMakesOneSoundPerHit() throws Exception {
        Sim s = fresh("FOREST", "WHIP");
        s.noSpawnsForTest();
        s.enemyN = 0;
        s.addEnemy("ZOMBIE", s.px + 5, s.py, false);
        for (int i = 0; i < 30; i++) s.update(DT, new Input());
        assertEquals(1, s.sound.emitted[SoundEvents.PLAYER_HURT]);
    }

    @Test
    public void noBossSpawnSoundWhenThePoolIsFull() throws Exception {
        GameData d = TestData.load();
        Sim b = fresh("FOREST", "WHIP");
        b.update(DT, new Input());
        int minute = -1;
        for (WaveRow r : d.stages.get("FOREST").rows) {
            for (String boss : r.bosses) if (!boss.equals("BOSS_XLDEATH")) minute = minute < 0 ? r.minute : minute;
        }
        b.hp = b.maxHp = 1e9f;
        while (b.enemyN < Sim.MAX_ENEMIES) b.addEnemy("ZOMBIE", b.px + 900, b.py, false);
        b.sound.clear();
        int before = b.sound.emitted[SoundEvents.BOSS_SPAWN];
        b.time = minute * 60.0;
        b.update(DT, new Input());
        assertEquals(before, b.sound.emitted[SoundEvents.BOSS_SPAWN]);
    }

    @Test
    public void noMuzzleSoundWhenTheProjectilePoolIsFull() throws Exception {
        Sim s = fresh("FOREST", "KNIFE");
        s.noSpawnsForTest();
        s.enemyN = 0;
        for (int i = 0; i < Sim.MAX_PROJ; i++) { // long-lived axes parked on the player keep the pool full
            Entities.Projectile p = s.projs[i];
            p.kind = Entities.P_AXE;
            p.x = s.px;
            p.y = s.py;
            p.vx = p.vy = p.gravity = 0;
            p.life = p.maxLife = 100f;
            p.hitsLeft = 1;
        }
        s.projN = Sim.MAX_PROJ;
        for (int i = 0; i < 120; i++) s.update(DT, new Input());
        assertEquals(Sim.MAX_PROJ, s.projN);
        assertEquals(0, s.sound.emitted[SoundEvents.KNIFE]);
    }
}
