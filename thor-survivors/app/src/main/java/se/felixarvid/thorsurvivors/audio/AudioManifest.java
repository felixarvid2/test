package se.felixarvid.thorsurvivors.audio;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * {@code audio/manifest.json}: id -> file and base volume, for sound effects and music tracks. Entries whose file does
 * not exist are left out (and listed in {@link #missing}), so sounds can be dropped in one by one and a missing one is
 * simply silent. Android-free so it can be unit-tested; the caller supplies the existence check.
 *
 * <pre>
 * { "sfx":   { "whip": { "file": "sfx/whip.ogg", "volume": 0.8, "pitchVar": 0.05 } },
 *   "music": { "menu": { "file": "music/menu.ogg", "volume": 0.7, "loop": true } } }
 * </pre>
 * Paths are relative to {@code audio/}. An sfx id without an entry falls back to {@code sfx/<id>.ogg} at volume 1.
 */
public final class AudioManifest {
    public interface FileCheck {
        boolean exists(String path);
    }

    public static final class Entry {
        public final String id, file;
        public final float volume, pitchVar;
        public final boolean loop;

        Entry(String id, String file, float volume, float pitchVar, boolean loop) {
            this.id = id;
            this.file = file;
            this.volume = volume;
            this.pitchVar = pitchVar;
            this.loop = loop;
        }
    }

    public static final float DEFAULT_PITCH_VAR = 0.06f;

    public final Map<String, Entry> sfx = new HashMap<>();
    public final Map<String, Entry> music = new HashMap<>();
    /** Files named by the manifest (or expected for a known sfx id) that were not found. */
    public final List<String> missing = new ArrayList<>();

    /** Builds the manifest. {@code json} may be null/invalid (everything then falls back to the default paths). */
    public static AudioManifest parse(String json, String[] sfxIds, FileCheck check) {
        AudioManifest m = new AudioManifest();
        JSONObject root = null;
        try {
            if (json != null) root = new JSONObject(json);
        } catch (JSONException e) {
            root = null; // a broken manifest must not stop the game: fall back to the default layout
        }
        read(m, root == null ? null : root.optJSONObject("sfx"), "sfx", m.sfx, false, check);
        read(m, root == null ? null : root.optJSONObject("music"), "music", m.music, true, check);
        for (String id : sfxIds) {
            if (m.sfx.containsKey(id)) continue;
            String file = "sfx/" + id + ".ogg";
            if (check.exists(file)) m.sfx.put(id, new Entry(id, file, 1f, DEFAULT_PITCH_VAR, false));
            else if (!m.missing.contains(file)) m.missing.add(file);
        }
        return m;
    }

    private static void read(AudioManifest m, JSONObject o, String dir, Map<String, Entry> out, boolean music,
                             FileCheck check) {
        if (o == null) return;
        for (Iterator<String> it = o.keys(); it.hasNext(); ) {
            String id = it.next();
            JSONObject e = o.optJSONObject(id);
            String file = e == null ? dir + "/" + id + ".ogg" : e.optString("file", dir + "/" + id + ".ogg");
            if (!check.exists(file)) {
                m.missing.add(file);
                continue;
            }
            float vol = e == null ? 1f : (float) e.optDouble("volume", 1.0);
            float pv = e == null ? DEFAULT_PITCH_VAR : (float) e.optDouble("pitchVar", DEFAULT_PITCH_VAR);
            boolean loop = e == null ? music : e.optBoolean("loop", music);
            out.put(id, new Entry(id, file, Math.max(0f, Math.min(1.5f, vol)), Math.max(0f, Math.min(0.5f, pv)),
                    loop));
        }
    }
}
