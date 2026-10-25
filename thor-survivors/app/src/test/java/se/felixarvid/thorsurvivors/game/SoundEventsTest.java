package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeTrue;

import org.junit.Test;

import java.lang.reflect.Method;
import java.util.HashSet;

/** The event ring buffer: rate limiting per id, dropping the oldest when full, and no allocation. */
public class SoundEventsTest {
    @Test
    public void fiftyHitsInOneFrameMakeOnlyAFew() {
        SoundEvents q = new SoundEvents();
        for (int i = 0; i < 50; i++) q.emit(SoundEvents.KNIFE);
        assertEquals(SoundEvents.MAX_PER_WINDOW[SoundEvents.KNIFE], q.size());
        assertEquals(47, q.limited);
        // the next 100 ms window allows more
        q.advance(0.1f);
        for (int i = 0; i < 50; i++) q.emit(SoundEvents.KNIFE);
        assertEquals(2 * SoundEvents.MAX_PER_WINDOW[SoundEvents.KNIFE], q.size());
    }

    @Test
    public void enemyHitsAreSpacedOut() {
        SoundEvents q = new SoundEvents();
        int played = 0;
        for (int i = 0; i < 60; i++) { // one second of frames with 50 hits each
            for (int k = 0; k < 50; k++) q.emit(SoundEvents.ENEMY_HIT);
            q.advance(1f / 60f);
            while (q.poll() >= 0) played++;
        }
        assertTrue("played " + played, played >= 20 && played <= 30);
    }

    @Test
    public void everyIdHasItsOwnBudget() {
        SoundEvents q = new SoundEvents();
        for (int i = 0; i < 20; i++) {
            q.emit(SoundEvents.KNIFE);
            q.emit(SoundEvents.COIN);
            q.emit(SoundEvents.PLAYER_HURT);
        }
        assertEquals(SoundEvents.MAX_PER_WINDOW[SoundEvents.KNIFE] + SoundEvents.MAX_PER_WINDOW[SoundEvents.COIN]
                + SoundEvents.MAX_PER_WINDOW[SoundEvents.PLAYER_HURT], q.size());
    }

    @Test
    public void garlicIsHeavilyLimitedByAMinimumGap() {
        SoundEvents q = new SoundEvents();
        q.emit(SoundEvents.GARLIC);
        q.advance(0.15f);
        q.emit(SoundEvents.GARLIC); // a new window, but too soon after the last one
        assertEquals(1, q.size());
        q.advance(0.3f);
        q.emit(SoundEvents.GARLIC);
        assertEquals(2, q.size());
    }

    @Test
    public void aFullRingDropsTheOldestEvent() {
        SoundEvents q = new SoundEvents();
        int total = SoundEvents.CAPACITY + 5;
        for (int i = 0; i < total; i++) {
            q.emit(SoundEvents.UI_BACK, i); // 1 id per 0.1 s window: never rate limited
            q.advance(SoundEvents.WINDOW);
        }
        assertEquals(SoundEvents.CAPACITY, q.size());
        assertEquals(5, q.overwritten);
        int first = q.poll();
        assertEquals(SoundEvents.UI_BACK, SoundEvents.idOf(first));
        assertEquals(5, SoundEvents.argOf(first));
        int n = 1;
        int last = first;
        for (int e; (e = q.poll()) >= 0; n++) last = e;
        assertEquals(SoundEvents.CAPACITY, n);
        assertEquals(total - 1, SoundEvents.argOf(last));
        assertEquals(-1, q.poll());
    }

    /** Bytes allocated so far by this thread (HotSpot only; reflection because the android.jar hides java.management). */
    private static Method allocated(Object[] bean) {
        try {
            Class<?> mf = Class.forName("java.lang.management.ManagementFactory");
            bean[0] = mf.getMethod("getThreadMXBean").invoke(null);
            Class<?> sun = Class.forName("com.sun.management.ThreadMXBean");
            return sun.getMethod("getThreadAllocatedBytes", long.class);
        } catch (ReflectiveOperationException | RuntimeException | LinkageError e) {
            return null;
        }
    }

    @Test
    public void emitAndPollDoNotAllocate() throws Exception {
        SoundEvents q = new SoundEvents();
        Object[] bean = new Object[1];
        Method alloc = allocated(bean);
        assumeTrue(alloc != null);
        long tid = Thread.currentThread().getId();
        for (int i = 0; i < 20000; i++) { // warm up the JIT
            q.emit(i % SoundEvents.COUNT, i & 7);
            q.advance(0.01f);
            q.poll();
        }
        long before = (Long) alloc.invoke(bean[0], tid);
        for (int i = 0; i < 300000; i++) {
            q.emit(i % SoundEvents.COUNT, i & 7);
            q.advance(0.004f);
            if ((i & 3) == 0) q.poll();
        }
        long used = (Long) alloc.invoke(bean[0], tid) - before;
        assertTrue("allocated " + used + " bytes", used < 16 * 1024);
    }

    @Test
    public void packingPitchAndGain() {
        int p = 13 | (7 << 8);
        assertEquals(13, SoundEvents.idOf(p));
        assertEquals(7, SoundEvents.argOf(p));
        assertEquals(0, SoundEvents.gemSemitones(0));
        assertEquals(12, SoundEvents.gemSemitones(SoundEvents.GEM_MAX_CHAIN));
        assertEquals(12, SoundEvents.gemSemitones(99));
        assertEquals(0f, SoundEvents.stepGain(0), 0f);
        assertEquals(1f, SoundEvents.stepGain(MetaProgress.VOL_MAX), 0f);
    }

    @Test
    public void tablesCoverEveryId() {
        assertEquals(SoundEvents.COUNT, SoundEvents.NAMES.length);
        assertEquals(SoundEvents.COUNT, SoundEvents.MAX_PER_WINDOW.length);
        assertEquals(SoundEvents.COUNT, SoundEvents.MIN_GAP.length);
        assertEquals(SoundEvents.COUNT, SoundEvents.VOICES.length);
        assertEquals(SoundEvents.COUNT, new HashSet<>(java.util.Arrays.asList(SoundEvents.NAMES)).size());
        assertEquals("ui_back", SoundEvents.NAMES[SoundEvents.UI_BACK]);
        assertEquals("gem", SoundEvents.NAMES[SoundEvents.GEM]);
    }

    @Test
    public void theRateLimitStillWorksAfterDaysOfPlay() {
        SoundEvents q = new SoundEvents();
        q.advance(3_000_000f); // ~35 days: a float clock stops moving by 1/60 s long before this
        double t0 = q.now();
        for (int i = 0; i < 600; i++) q.advance(1f / 60f);
        assertTrue("clock advanced " + (q.now() - t0), q.now() - t0 > 9.9);
        int played = 0;
        for (int i = 0; i < 60; i++) {
            for (int k = 0; k < 10; k++) q.emit(SoundEvents.KNIFE);
            q.advance(1f / 60f);
            while (q.poll() >= 0) played++;
        }
        assertTrue("played " + played, played >= 20);
    }
}
