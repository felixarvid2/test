package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;

/** Music and effects volume steps are stored through the Store (PrefsStore on Android). */
public class VolumeSettingsTest {
    @Test
    public void defaultsStepWrapAndPersist() throws Exception {
        MetaProgressTest.MemStore st = new MetaProgressTest.MemStore();
        MetaProgress mp = new MetaProgress(TestData.load(), st);
        assertEquals(2, mp.musicVol);
        assertEquals(MetaProgress.VOL_MAX, mp.sfxVol);
        mp.stepMusic(1);
        mp.stepSfx(1); // wraps from the top to off
        assertEquals(3, mp.musicVol);
        assertEquals(0, mp.sfxVol);
        mp.stepMusic(1);
        assertEquals(0, mp.musicVol);
        mp.stepSfx(-1);
        assertEquals(MetaProgress.VOL_MAX, mp.sfxVol);
        mp.stepMusic(1);
        MetaProgress again = new MetaProgress(TestData.load(), st);
        assertEquals(1, again.musicVol);
        assertEquals(MetaProgress.VOL_MAX, again.sfxVol);
        st.putInt("volMusic", 99); // garbage in the prefs is clamped
        assertEquals(MetaProgress.VOL_MAX, new MetaProgress(TestData.load(), st).musicVol);
    }
}
