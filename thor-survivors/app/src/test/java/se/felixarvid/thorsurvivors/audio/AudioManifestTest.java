package se.felixarvid.thorsurvivors.audio;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.game.SoundEvents;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Manifest parsing (missing files are silent, not fatal), the shipped assets, and the spec document. */
public class AudioManifestTest {
    private static final String[] IDS = {"whip", "gem", "coin"};

    private static AudioManifest.FileCheck has(String... files) {
        final Set<String> s = new HashSet<>(Arrays.asList(files));
        return s::contains;
    }

    @Test
    public void entriesWithMissingFilesAreLeftOut() {
        String json = "{\"sfx\":{\"whip\":{\"file\":\"sfx/whip.ogg\",\"volume\":0.5,\"pitchVar\":0.1},"
                + "\"gem\":{\"file\":\"sfx/gem.ogg\"}},"
                + "\"music\":{\"menu\":{\"file\":\"music/menu.ogg\",\"volume\":0.7},"
                + "\"forest\":{\"file\":\"music/forest.ogg\",\"loop\":false}}}";
        AudioManifest m = AudioManifest.parse(json, IDS, has("sfx/whip.ogg", "music/forest.ogg"));
        assertEquals(0.5f, m.sfx.get("whip").volume, 1e-6);
        assertEquals(0.1f, m.sfx.get("whip").pitchVar, 1e-6);
        assertNull("file is not there: silent", m.sfx.get("gem"));
        assertNull(m.music.get("menu"));
        assertFalse(m.music.get("forest").loop);
        assertTrue(m.missing.contains("sfx/gem.ogg"));
        assertTrue(m.missing.contains("music/menu.ogg"));
    }

    @Test
    public void idsWithoutAnEntryUseTheDefaultPathWhenTheFileExists() {
        AudioManifest m = AudioManifest.parse("{\"sfx\":{}}", IDS, has("sfx/coin.ogg"));
        AudioManifest.Entry c = m.sfx.get("coin");
        assertNotNull(c);
        assertEquals("sfx/coin.ogg", c.file);
        assertEquals(1f, c.volume, 0f);
        assertNull(m.sfx.get("whip"));
        assertEquals(2, m.missing.size());
    }

    @Test
    public void noManifestOrABrokenOneNeverThrows() {
        for (String json : new String[]{null, "", "not json {", "[]", "{\"sfx\":3}"}) {
            AudioManifest m = AudioManifest.parse(json, IDS, has("sfx/gem.ogg"));
            assertEquals(1, m.sfx.size());
            assertTrue(m.music.isEmpty());
        }
        AudioManifest none = AudioManifest.parse(null, IDS, has());
        assertTrue(none.sfx.isEmpty());
        assertEquals(3, none.missing.size());
    }

    @Test
    public void volumesAreClamped() {
        AudioManifest m = AudioManifest.parse("{\"sfx\":{\"whip\":{\"file\":\"a.ogg\",\"volume\":9,\"pitchVar\":3}}}", IDS,
                has("a.ogg"));
        assertEquals(1.5f, m.sfx.get("whip").volume, 0f);
        assertEquals(0.5f, m.sfx.get("whip").pitchVar, 0f);
    }

    private static Path audioDir() {
        return Paths.get("src/main/assets/audio");
    }

    @Test
    public void shippedManifestListsEveryIdAndItsFilesExist() throws Exception {
        String json = new String(Files.readAllBytes(audioDir().resolve("manifest.json")), StandardCharsets.UTF_8);
        AudioManifest m = AudioManifest.parse(json, SoundEvents.NAMES, f -> Files.exists(audioDir().resolve(f)));
        assertTrue("missing " + m.missing, m.missing.isEmpty());
        assertEquals(SoundEvents.COUNT, m.sfx.size());
        for (String t : new String[]{"menu", "forest", "library", "boss", "gameover", "victory"}) {
            assertNotNull(t, m.music.get(t));
        }
        assertFalse(m.music.get("menu").file.isEmpty());
    }

    @Test
    public void shippedAudioStaysUnderTheSizeBudget() throws Exception {
        long total = 0;
        try (java.util.stream.Stream<Path> w = Files.walk(audioDir())) {
            for (Path p : (Iterable<Path>) w::iterator) if (Files.isRegularFile(p)) total += Files.size(p);
        }
        assertTrue("audio is " + total + " bytes", total < 3_000_000);
    }

    @Test
    public void specDocumentNamesEverySoundId() throws Exception {
        String spec = new String(Files.readAllBytes(Paths.get("../tools/AUDIO_SPEC.md")), StandardCharsets.UTF_8);
        for (String id : SoundEvents.NAMES) assertTrue(id, spec.contains("| `" + id + "` |"));
        for (String t : new String[]{"menu", "forest", "library", "boss", "gameover", "victory"}) {
            assertTrue(t, spec.contains("| `" + t + "` |"));
        }
    }

    @Test
    public void musicFollowsThePhase() {
        assertEquals("menu", MusicDirector.trackFor(Engine.PH_MENU, "FOREST", false, false));
        assertEquals("menu", MusicDirector.trackFor(Engine.PH_SHOP, "LIBRARY", true, false));
        assertEquals("forest", MusicDirector.trackFor(Engine.PH_PLAYING, "FOREST", false, false));
        assertEquals("library", MusicDirector.trackFor(Engine.PH_PAUSED, "LIBRARY", false, false));
        assertEquals("boss", MusicDirector.trackFor(Engine.PH_PLAYING, "LIBRARY", true, false));
        assertEquals("gameover", MusicDirector.trackFor(Engine.PH_RESULT, "FOREST", false, false));
        assertEquals("victory", MusicDirector.trackFor(Engine.PH_RESULT, "FOREST", false, true));
        assertTrue(MusicDirector.isStinger("victory"));
        assertFalse(MusicDirector.isStinger("boss"));
    }
}
