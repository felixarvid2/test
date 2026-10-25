package se.felixarvid.thorsurvivors.audio;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.game.SoundEvents;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;

/** Manifest parsing (missing files are silent, not fatal), the shipped assets, and the spec document. */
public class AudioManifestTest {
    private static final String[] IDS = {"whip", "gem", "coin"};

    /** Music tracks the manifest ships; {@code final} (The First) is silent until the code asks for it. */
    private static final String[] TRACKS = {"menu", "forest", "library", "boss", "final", "gameover", "victory"};

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
        for (String t : TRACKS) {
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
        assertTrue("audio is " + total + " bytes", total < 5_000_000);
    }

    @Test
    public void shippedFilesAreOggWithinThePerFileLimits() throws Exception {
        for (String id : SoundEvents.NAMES) {
            Path f = audioDir().resolve("sfx/" + id + ".ogg");
            assertTrue(f + " is an Ogg file", startsWithOggS(f));
            assertTrue(id + " is " + Files.size(f) + " bytes", Files.size(f) < 60_000);
        }
        for (String id : pendingIds()) {
            Path f = audioDir().resolve("sfx/" + id + ".ogg");
            assertTrue(f + " is an Ogg file", startsWithOggS(f));
            assertTrue(id + " is " + Files.size(f) + " bytes", Files.size(f) < 60_000);
        }
        for (String t : TRACKS) {
            Path f = audioDir().resolve("music/" + t + ".ogg");
            assertTrue(f + " is an Ogg file", startsWithOggS(f));
            assertTrue(t + " is " + Files.size(f) + " bytes", Files.size(f) < 450_000);
        }
    }

    /**
     * Ids in the manifest's "pending" section: sounds for the design section 12 events that SoundEvents does not have
     * yet. The files are shipped and ready; move an id to "sfx" in manifest.json when the code starts playing it.
     */
    private static List<String> pendingIds() throws Exception {
        String json = new String(Files.readAllBytes(audioDir().resolve("manifest.json")), StandardCharsets.UTF_8);
        JSONObject pending = new JSONObject(json).optJSONObject("pending");
        List<String> ids = new ArrayList<>();
        if (pending != null) for (Iterator<String> it = pending.keys(); it.hasNext(); ) ids.add(it.next());
        return ids;
    }

    @Test
    public void pendingSoundsAreShippedDocumentedAndNotYetWired() throws Exception {
        String json = new String(Files.readAllBytes(audioDir().resolve("manifest.json")), StandardCharsets.UTF_8);
        JSONObject pending = new JSONObject(json).getJSONObject("pending");
        JSONObject sfx = new JSONObject(json).getJSONObject("sfx");
        String spec = new String(Files.readAllBytes(Paths.get("../tools/AUDIO_SPEC.md")), StandardCharsets.UTF_8);
        assertTrue("design section 12 lists about 36 new ids, 28 of them are wired now (5 still wait for the new weapons)", pending.length() >= 5);
        for (String id : pendingIds()) {
            String file = pending.getJSONObject(id).getString("file");
            assertTrue(id + " file " + file, Files.exists(audioDir().resolve(file)));
            assertFalse(id + " is listed twice (sfx and pending)", sfx.has(id));
            assertTrue(id + " is in the spec", spec.contains("| `" + id + "` |"));
        }
    }

    private static boolean startsWithOggS(Path f) throws Exception {
        byte[] b = Files.readAllBytes(f);
        return b.length > 4 && b[0] == 'O' && b[1] == 'g' && b[2] == 'g' && b[3] == 'S';
    }

    @Test
    public void creditsNameTheLicenceAndEveryMusicSource() throws Exception {
        String c = new String(Files.readAllBytes(audioDir().resolve("CREDITS.txt")), StandardCharsets.UTF_8);
        assertTrue("CC0 sources only", c.contains("CC0"));
        assertFalse("the placeholders are gone", c.contains("placeholders generated procedurally"));
        for (String s : new String[]{"nuclear_cave", "pulse_0", "dark_forces", "dark_cavern", "heavy_boss_battle_2",
                "victory_4", "Creepy Incoherent Chanting", "Heartbeat sounds"}) {
            assertTrue(s, c.contains(s));
        }
    }

    @Test
    public void specDocumentNamesEverySoundId() throws Exception {
        String spec = new String(Files.readAllBytes(Paths.get("../tools/AUDIO_SPEC.md")), StandardCharsets.UTF_8);
        for (String id : SoundEvents.NAMES) assertTrue(id, spec.contains("| `" + id + "` |"));
        for (String t : TRACKS) {
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
