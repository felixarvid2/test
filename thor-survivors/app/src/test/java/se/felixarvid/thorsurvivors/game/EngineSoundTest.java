package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.GameData;

/** Menu sounds, the volume settings and the end-of-run stingers. */
public class EngineSoundTest {
    private Engine menu() throws Exception {
        Engine e = Engine.get();
        GameData d = TestData.load();
        MetaProgress fresh = new MetaProgress(d, new MetaProgressTest.MemStore());
        e.init(d, fresh);
        e.meta = fresh; // Engine is a JVM-wide singleton: don't inherit another test's gold or power-ups
        e.input.clearMovement();
        e.phase = Engine.PH_MENU;
        e.focus = 0;
        e.sound.clear();
        return e;
    }

    private static int[] drain(SoundEvents q) {
        int[] ids = new int[q.size()];
        for (int i = 0; i < ids.length; i++) ids[i] = SoundEvents.idOf(q.poll());
        return ids;
    }

    @Test
    public void menuMoveConfirmAndBack() throws Exception {
        Engine e = menu();
        e.input.post(Input.CMD_NAV, Input.DOWN, 0, 0);
        e.advance(1f / 60f);
        assertEquals(Engine.MENU_STAGE, e.focus);
        int[] ids = drain(e.sound);
        assertEquals(1, ids.length);
        assertEquals(SoundEvents.UI_MOVE, ids[0]);

        e.phase = Engine.PH_SHOP;
        e.advance(0.2f);
        e.input.post(Input.CMD_BACK, 0, 0, 0);
        e.advance(1f / 60f);
        assertEquals(Engine.PH_MENU, e.phase);
        assertEquals(SoundEvents.UI_BACK, drain(e.sound)[0]);

        e.advance(0.2f);
        e.focus = Engine.MENU_SHOP;
        e.input.post(Input.CMD_CONFIRM, 0, 0, 0);
        e.advance(1f / 60f);
        assertEquals(Engine.PH_SHOP, e.phase);
        assertEquals(SoundEvents.UI_CONFIRM, drain(e.sound)[0]);
    }

    @Test
    public void volumeRowsCycleAndPersist() throws Exception {
        Engine e = menu();
        int m0 = e.meta.musicVol, s0 = e.meta.sfxVol;
        e.focus = Engine.MENU_MUSIC;
        e.input.post(Input.CMD_NAV, Input.RIGHT, 0, 0);
        e.focus = Engine.MENU_MUSIC;
        e.advance(1f / 60f);
        assertEquals((m0 + 1) % (MetaProgress.VOL_MAX + 1), e.meta.musicVol);
        e.focus = Engine.MENU_SFX;
        e.input.post(Input.CMD_TAP, Engine.PH_MENU, Engine.MENU_SFX, -1);
        e.advance(1f / 60f);
        assertEquals((s0 + MetaProgress.VOL_MAX) % (MetaProgress.VOL_MAX + 1), e.meta.sfxVol);
        assertTrue("you hear the new level", e.sound.size() > 0);
    }

    @Test
    public void runEndPlaysGameOverOrVictory() throws Exception {
        Engine e = menu();
        e.nextRunSeed = 1L; // deterministic run
        e.input.post(Input.CMD_START, 0, 0, 0);
        e.advance(1f / 60f);
        assertEquals(Engine.PH_PLAYING, e.phase);
        e.sound.clear();
        e.sim.hp = 0.5f;
        e.sim.time = 1e9; // never mind the time
        e.sim.ended = 1;
        e.advance(1f / 60f);
        assertEquals(Engine.PH_RESULT, e.phase);
        int[] ids = drain(e.sound);
        assertEquals(SoundEvents.GAME_OVER, ids[ids.length - 1]);
    }

    private Engine in(Engine e, int phase) {
        e.phase = phase;
        e.focus = 0;
        e.advance(0.2f);
        e.sound.clear();
        return e;
    }

    @Test
    public void aFailedPurchaseOnlyPlaysBack() throws Exception {
        Engine e = in(menu(), Engine.PH_SHOP);
        e.meta.gold = 0;
        e.input.post(Input.CMD_CONFIRM, 0, 0, 0);
        e.advance(1f / 60f);
        int[] ids = drain(e.sound);
        assertEquals(1, ids.length);
        assertEquals(SoundEvents.UI_BACK, ids[0]);
    }

    @Test
    public void aSuccessfulPurchaseOnlyPlaysConfirm() throws Exception {
        Engine e = in(menu(), Engine.PH_SHOP);
        e.meta.gold = 1_000_000;
        e.input.post(Input.CMD_CONFIRM, 0, 0, 0);
        e.advance(1f / 60f);
        int[] ids = drain(e.sound);
        assertEquals(1, ids.length);
        assertEquals(SoundEvents.UI_CONFIRM, ids[0]);
    }

    @Test
    public void backWhereItDoesNothingIsSilent() throws Exception {
        for (int ph : new int[]{Engine.PH_LEVELUP, Engine.PH_CHEST}) {
            Engine e = in(menu(), ph);
            e.input.post(Input.CMD_BACK, 0, 0, 0);
            e.advance(1f / 60f);
            assertEquals(ph, e.phase);
            assertEquals(0, e.sound.size());
        }
    }

    @Test
    public void sidewaysOnARowThatDoesNotCycleIsSilent() throws Exception {
        Engine e = in(menu(), Engine.PH_MENU);
        e.focus = Engine.MENU_START;
        e.input.post(Input.CMD_NAV, Input.RIGHT, 0, 0);
        e.advance(1f / 60f);
        e.focus = Engine.MENU_SHOP;
        e.input.post(Input.CMD_NAV, Input.LEFT, 0, 0);
        e.advance(1f / 60f);
        assertEquals(0, e.sound.size());

        in(e, Engine.PH_SHOP); // clamped at the left edge
        e.input.post(Input.CMD_NAV, Input.LEFT, 0, 0);
        e.advance(1f / 60f);
        assertEquals(0, e.sound.size());
        e.input.post(Input.CMD_NAV, Input.RIGHT, 0, 0); // a real move still sounds
        e.advance(1f / 60f);
        assertEquals(SoundEvents.UI_MOVE, drain(e.sound)[0]);
    }
}
