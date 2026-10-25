package se.felixarvid.thorsurvivors.audio;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.SoundPool;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.game.MetaProgress;
import se.felixarvid.thorsurvivors.game.Sim;
import se.felixarvid.thorsurvivors.game.SoundEvents;
import se.felixarvid.thorsurvivors.util.IO;

/**
 * Sound effects (SoundPool, USAGE_GAME) and music (MediaPlayer with fades), both fed from the game state.
 *
 * The game thread calls {@link #update} once per frame: it drains {@link SoundEvents} (no allocation) and picks the
 * music track. Music is driven by its own thread, which ticks every {@value #TICK_MS} ms to fade tracks in and out so
 * the game thread never blocks on a MediaPlayer. Every file is optional: whatever {@code audio/manifest.json} names
 * (or the default {@code audio/sfx/<id>.ogg}) and that is missing is just silent. Output follows whatever device the
 * system routes USAGE_GAME to, so nothing here depends on the dual screen.
 */
public final class AudioEngine {
    private static final int STREAMS = 16, TICK_MS = 40;
    private static final float FADE_OUT = 0.9f, FADE_IN = 1.4f, FADE_STINGER = 0.05f, DUCK = 0.45f;
    /** SoundPool priority per id: higher survives when all 16 streams are busy. */
    private static final int[] PRIORITY = new int[SoundEvents.COUNT];

    static {
        Arrays.fill(PRIORITY, 1);
        for (int id : new int[]{SoundEvents.ENEMY_HIT, SoundEvents.ENEMY_DEATH, SoundEvents.GARLIC,
                SoundEvents.GEM, SoundEvents.COIN}) PRIORITY[id] = 0;
        for (int id : new int[]{SoundEvents.PLAYER_HURT, SoundEvents.LEVEL_UP, SoundEvents.EVOLUTION,
                SoundEvents.CHEST_OPEN, SoundEvents.BOSS_SPAWN, SoundEvents.GAME_OVER, SoundEvents.VICTORY,
                SoundEvents.BOSS_INTRO, SoundEvents.THE_FIRST_ROAR, SoundEvents.ELITE_SPAWN}) {
            PRIORITY[id] = 2;
        }
    }

    private final AssetManager assets;
    private final Engine eng;
    private final MetaProgress meta;
    private final AudioManifest manifest;
    private final SoundPool pool;
    private final int[] soundId = new int[SoundEvents.COUNT];
    private final float[] baseVol = new float[SoundEvents.COUNT], pitchVar = new float[SoundEvents.COUNT];
    private final int[][] voices = new int[SoundEvents.COUNT][];
    private final int[] voiceHead = new int[SoundEvents.COUNT];
    private long rngState = 0x9E3779B97F4A7C15L ^ System.nanoTime();

    // music (state below is owned by the music thread except the volatile inputs)
    private final HandlerThread musicThread = new HandlerThread("audio-music");
    private final Handler music;
    private volatile String wantTrack;
    private volatile boolean paused, released;
    private volatile boolean flush;
    private final ArrayList<Voice> playing = new ArrayList<>();
    private String curTrack;
    private long lastTickMs;
    private volatile boolean ducked;
    private final Runnable tickTask = this::tick;

    private static final class Voice {
        MediaPlayer mp;
        float level, target, fadeSec, base;
        boolean dying;
        /** Set by {@link #pause}: this player was really playing then, so {@link #resume} may restart it. */
        boolean resumeOnResume;
    }

    public AudioEngine(Context ctx, Engine eng) {
        this.assets = ctx.getApplicationContext().getAssets();
        this.eng = eng;
        this.meta = eng.meta;
        manifest = loadManifest();
        pool = new SoundPool.Builder()
                .setMaxStreams(STREAMS)
                .setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_GAME)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build())
                .build();
        for (int i = 0; i < SoundEvents.COUNT; i++) {
            voices[i] = new int[SoundEvents.VOICES[i]];
            AudioManifest.Entry e = manifest.sfx.get(SoundEvents.NAMES[i]);
            if (e == null) continue;
            baseVol[i] = e.volume;
            pitchVar[i] = e.pitchVar;
            try (AssetFileDescriptor afd = assets.openFd("audio/" + e.file)) {
                soundId[i] = pool.load(afd, 1);
            } catch (IOException | RuntimeException ex) {
                soundId[i] = 0; // unreadable file: silent
            }
        }
        musicThread.start();
        music = new Handler(musicThread.getLooper());
        music.post(tickTask);
    }

    private AudioManifest loadManifest() {
        final Set<String> files = new HashSet<>();
        for (String dir : new String[]{"sfx", "music"}) {
            try {
                String[] l = assets.list("audio/" + dir);
                if (l != null) for (String f : l) files.add(dir + "/" + f);
            } catch (IOException ignored) {
                // no such directory: nothing to load
            }
        }
        String json = null;
        try (InputStream in = assets.open("audio/manifest.json")) {
            json = IO.readUtf8(in);
        } catch (IOException ignored) {
            // no manifest: default paths
        }
        return AudioManifest.parse(json, SoundEvents.NAMES, files::contains);
    }

    public AudioManifest manifest() {
        return manifest;
    }

    // ------------------------------------------------------------------ game thread

    private long bossCheckNs;
    private boolean bossAlive, finalAlive;

    /** Once per frame on the game thread: play the queued events and choose the music. */
    public void update() {
        if (released) return;
        SoundEvents q = eng.sound;
        if (flush) { // back from the background: stale events would play as one burst
            flush = false;
            q.clear();
        }
        float gain = SoundEvents.stepGain(meta.sfxVol);
        for (int e; (e = q.poll()) >= 0; ) {
            if (gain > 0f) play(SoundEvents.idOf(e), SoundEvents.argOf(e), gain);
        }
        long now = System.nanoTime();
        if (now - bossCheckNs > 400_000_000L) { // a 320-entry scan twice a second is plenty
            bossCheckNs = now;
            bossAlive = false;
            finalAlive = false;
            Sim bs = eng.sim;
            if (bs != null && eng.phase != Engine.PH_RESULT && eng.phase != Engine.PH_MENU
                    && eng.phase != Engine.PH_SHOP) {
                for (int i = 0; i < bs.enemyN; i++) {
                    if (bs.enemies[i].boss && !bs.enemies[i].dead) {
                        bossAlive = true;
                        if (bs.enemies[i].type.pattern == 5) finalAlive = true; // The First: the final track
                    }
                }
            }
        }
        Sim s = eng.sim;
        String stage = s == null ? "FLATS" : s.stage.key;
        String t = MusicDirector.trackFor(eng.phase, stage, bossAlive, finalAlive, eng.resultWin);
        if (MusicDirector.FINAL.equals(t) && !manifest.music.containsKey(t)) t = MusicDirector.trackFor(eng.phase, stage, bossAlive, false, eng.resultWin);
        if (MusicDirector.BOSS.equals(t) && !manifest.music.containsKey(t)) t = MusicDirector.stageTrack(stage);
        wantTrack = t;
        ducked = eng.phase == Engine.PH_PAUSED || eng.phase == Engine.PH_LEVELUP || eng.phase == Engine.PH_CHEST
                || eng.phase == Engine.PH_EQUIP;
    }

    private float rnd() { // xorshift in [0, 1): no allocation, unlike a fresh Random per call
        rngState ^= rngState << 13;
        rngState ^= rngState >>> 7;
        rngState ^= rngState << 17;
        return (rngState >>> 40) / (float) (1L << 24);
    }

    private void play(int id, int arg, float gain) {
        int sid = soundId[id];
        if (sid == 0) return;
        float vol = baseVol[id] * gain * (0.92f + 0.08f * rnd());
        float rate = 1f + (rnd() * 2f - 1f) * pitchVar[id];
        if (id == SoundEvents.GEM) rate *= (float) Math.pow(2.0, SoundEvents.gemSemitones(arg) / 12.0);
        rate = Math.max(0.5f, Math.min(2f, rate));
        int[] v = voices[id];
        int h = voiceHead[id];
        if (v[h] != 0) pool.stop(v[h]); // voice stealing: cut the oldest of this sound
        v[h] = pool.play(sid, Math.min(1f, vol), Math.min(1f, vol), PRIORITY[id], 0, rate);
        voiceHead[id] = (h + 1) % v.length;
    }

    // ------------------------------------------------------------------ lifecycle (UI thread)

    public void pause() {
        paused = true;
        if (released) return;
        pool.autoPause();
        music.post(() -> {
            for (Voice v : playing) {
                v.resumeOnResume = false; // isPlaying() can throw in a bad state, so it stays inside safe()
                safe(() -> {
                    if (v.mp.isPlaying()) {
                        v.mp.pause();
                        v.resumeOnResume = true;
                    }
                });
            }
        });
    }

    public void resume() {
        if (released) return;
        flush = true;
        paused = false;
        pool.autoResume();
        music.post(() -> {
            for (Voice v : playing) { // a finished stinger was not playing at pause time and stays finished
                if (!v.resumeOnResume) continue;
                v.resumeOnResume = false;
                safe(() -> v.mp.start());
            }
            lastTickMs = SystemClock.uptimeMillis();
            music.removeCallbacks(tickTask);
            music.post(tickTask);
        });
    }

    public void release() {
        if (released) return;
        released = true;
        music.removeCallbacksAndMessages(null);
        music.post(() -> {
            for (Voice v : playing) free(v);
            playing.clear();
            musicThread.quitSafely();
        });
        pool.release();
    }

    // ------------------------------------------------------------------ music thread

    private void tick() {
        if (released || paused) return;
        long ms = SystemClock.uptimeMillis();
        float dt = lastTickMs == 0 ? TICK_MS / 1000f : Math.min(0.25f, (ms - lastTickMs) / 1000f);
        lastTickMs = ms;
        String want = wantTrack;
        int musicVol = meta.musicVol;
        if (musicVol <= 0) { // music OFF: no player at all; raising it again starts the current phase's track
            for (Voice v : playing) free(v);
            playing.clear();
            curTrack = null;
        } else if (want == null ? curTrack != null : !want.equals(curTrack)) {
            switchTo(want);
        }
        float gain = SoundEvents.stepGain(musicVol) * (ducked ? DUCK : 1f);
        for (int i = playing.size() - 1; i >= 0; i--) {
            Voice v = playing.get(i);
            float step = dt / Math.max(0.01f, v.fadeSec);
            if (v.level < v.target) v.level = Math.min(v.target, v.level + step);
            else if (v.level > v.target) v.level = Math.max(v.target, v.level - step);
            if (v.dying && v.level <= 0f) {
                free(v);
                playing.remove(i);
                continue;
            }
            float vol = v.level * v.base * gain;
            final MediaPlayer mp = v.mp;
            safe(() -> mp.setVolume(vol, vol));
        }
        music.postDelayed(tickTask, TICK_MS);
    }

    private void switchTo(String track) {
        curTrack = track;
        for (Voice v : playing) {
            v.dying = true;
            v.target = 0f;
            v.fadeSec = FADE_OUT;
        }
        AudioManifest.Entry e = track == null ? null : manifest.music.get(track);
        if (e == null) return; // missing file: silence
        boolean stinger = MusicDirector.isStinger(track);
        MediaPlayer mp = new MediaPlayer();
        try (AssetFileDescriptor afd = assets.openFd("audio/" + e.file)) {
            mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
            mp.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            mp.setLooping(e.loop && !stinger);
            mp.setVolume(0f, 0f);
            mp.prepare();
            mp.start();
        } catch (IOException | RuntimeException ex) {
            try {
                mp.release();
            } catch (RuntimeException ignored) {
                // already gone
            }
            return;
        }
        Voice v = new Voice();
        v.mp = mp;
        v.base = e.volume;
        v.target = 1f;
        v.fadeSec = stinger ? FADE_STINGER : FADE_IN;
        playing.add(v);
    }

    private static void free(Voice v) {
        safe(() -> v.mp.stop());
        safe(() -> v.mp.release());
    }

    private static void safe(Runnable r) {
        try {
            r.run();
        } catch (RuntimeException ignored) {
            // a MediaPlayer in a bad state must never take the game down
        }
    }
}
