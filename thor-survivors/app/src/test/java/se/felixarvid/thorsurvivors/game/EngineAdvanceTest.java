package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.GameData;

import java.util.HashMap;

/** Engine.advance: real frame time is split into steps of at most 1/60 s and clamped after a stall. */
public class EngineAdvanceTest {
    private Engine started() throws Exception {
        Engine e = Engine.get();
        GameData d = TestData.load();
        MetaProgress fresh = new MetaProgress(d, new MetaProgressTest.MemStore());
        e.init(d, fresh);
        e.meta = fresh; // Engine is a JVM-wide singleton: don't inherit another test's gold or power-ups
        e.input.clearMovement();
        e.phase = Engine.PH_MENU;
        e.nextRunSeed = 1L; // deterministic run
        e.input.post(Input.CMD_START, 0, 0, 0);
        e.advance(1f / 60f);
        assertEquals(Engine.PH_PLAYING, e.phase);
        return e;
    }

    @Test
    public void simTimeTracksRealTimeAtAnyRefreshRate() throws Exception {
        for (float hz : new float[]{60f, 90f, 120f, 144f}) {
            Engine e = started();
            e.sim.hp = e.sim.maxHp = 1e9f;
            double t0 = e.sim.time;
            int frames = (int) hz; // one second of frames
            for (int i = 0; i < frames; i++) e.advance(1f / hz);
            assertEquals("hz " + hz, 1.0, e.sim.time - t0, 0.02);
        }
    }

    @Test
    public void stallIsClampedAndUnevenFramesStillAdvanceEveryFrame() throws Exception {
        Engine e = started();
        e.sim.hp = e.sim.maxHp = 1e9f;
        double t0 = e.sim.time;
        e.advance(5f);
        assertEquals(Engine.MAX_FRAME, e.sim.time - t0, 1e-3);
        for (float dt : new float[]{0.0079f, 0.0088f, 0.0083f, 0.0170f}) {
            double before = e.sim.time;
            e.advance(dt);
            assertTrue("every frame advances", e.sim.time > before);
        }
    }
}
