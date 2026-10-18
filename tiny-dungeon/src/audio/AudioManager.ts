import type Phaser from 'phaser';
import type { MusicKey, SfxKey } from '../game/assets';

export interface PlayOpts {
  volume?: number;
  rate?: number;
  detune?: number;
}

const FADE_MS = 600;
const FADE_TICK_MS = 33;
const MAX_TOTAL = 14;
const DEFAULT_MAX_PER_KEY = 4;

/** Minimum ms between two plays of the same key. */
const THROTTLE_MS: Partial<Record<SfxKey, number>> = {
  hit: 45, crit: 45, enemyDeath: 35, coin: 40, xp: 30, swing: 40, shoot: 40, magic: 50,
  explosion: 70, playerHurt: 120, click: 40,
};
/** Max simultaneous instances per key (default DEFAULT_MAX_PER_KEY). */
const MAX_PER_KEY: Partial<Record<SfxKey, number>> = {
  hit: 3, crit: 3, enemyDeath: 3, coin: 3, xp: 3, explosion: 2, thunder: 2, levelUp: 1, victory: 1, defeat: 1,
};
/** Random detune range (cents, +/-) so rapid pickups do not sound identical. */
const RANDOM_DETUNE: Partial<Record<SfxKey, number>> = { coin: 120, xp: 120, hit: 40, enemyDeath: 60 };

type Sound = Phaser.Sound.BaseSound & { volume: number };

interface Fade {
  sound: Sound;
  from: number;
  to: number;
  start: number;
  done?: () => void;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * SFX and music on top of Phaser's sound manager. Everything is a silent no-op when a key was not
 * loaded or audio is locked/muted, so the game stays playable without audio.
 */
export class AudioManager {
  private game: Phaser.Game | null = null;
  private musicVol = 0.6;
  private sfxVol = 0.8;
  private hostEnabled = true;
  private paused = false;

  private lastPlay = new Map<SfxKey, number>();
  private active = new Map<SfxKey, number>();
  private activeTotal = 0;

  private wantedMusic: MusicKey | null = null;
  private current: { key: MusicKey; sound: Sound } | null = null;
  private fades = new Set<Fade>();
  private fadeTimer: ReturnType<typeof setInterval> | undefined;
  private unlockHooked = false;

  constructor(private readonly clock: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())) {}

  attach(game: Phaser.Game): void {
    this.game = game;
    this.hookUnlock();
    this.syncMusic();
  }

  setSettings(music: number, sfx: number): void {
    this.musicVol = clamp01(music);
    this.sfxVol = clamp01(sfx);
    if (this.current && this.canPlayMusic()) {
      // retarget: cancel fades on the live track and snap to the new level
      this.cancelFadesFor(this.current.sound);
      this.current.sound.volume = this.musicVol;
    }
    this.syncMusic();
  }

  setHostEnabled(enabled: boolean): void {
    this.hostEnabled = enabled;
    this.syncMusic();
  }

  play(key: SfxKey, opts: PlayOpts = {}): void {
    const sm = this.game?.sound;
    if (!sm || this.paused || !this.hostEnabled || this.sfxVol <= 0 || sm.locked) return;
    if (!this.hasAudio(key)) return;

    const t = this.clock();
    const gap = THROTTLE_MS[key] ?? 0;
    const last = this.lastPlay.get(key);
    if (gap > 0 && last !== undefined && t - last < gap) return;
    const n = this.active.get(key) ?? 0;
    if (n >= (MAX_PER_KEY[key] ?? DEFAULT_MAX_PER_KEY) || this.activeTotal >= MAX_TOTAL) return;

    const spread = RANDOM_DETUNE[key] ?? 0;
    const detune = (opts.detune ?? 0) + (spread ? (Math.random() * 2 - 1) * spread : 0);
    try {
      const sound = sm.add(key, {
        volume: clamp01((opts.volume ?? 1) * this.sfxVol),
        rate: opts.rate ?? 1,
        detune,
      });
      this.lastPlay.set(key, t);
      this.active.set(key, n + 1);
      this.activeTotal += 1;
      let released = false;
      const release = (): void => {
        if (released) return;
        released = true;
        this.active.set(key, Math.max(0, (this.active.get(key) ?? 1) - 1));
        this.activeTotal = Math.max(0, this.activeTotal - 1);
        try {
          sound.destroy();
        } catch {
          // already destroyed
        }
      };
      sound.once('complete', release);
      sound.once('stop', release);
      if (!sound.play()) release();
    } catch {
      // audio must never break the game
    }
  }

  playMusic(key: MusicKey): void {
    this.wantedMusic = key;
    this.syncMusic();
  }

  stopMusic(): void {
    this.wantedMusic = null;
    this.syncMusic();
  }

  pauseAll(): void {
    this.paused = true;
    this.game?.sound.pauseAll();
  }

  resumeAll(): void {
    this.paused = false;
    this.game?.sound.resumeAll();
  }

  // --- music ---

  private canPlayMusic(): boolean {
    const sm = this.game?.sound;
    return !!sm && !sm.locked && this.hostEnabled && this.musicVol > 0;
  }

  /** Makes the playing track match what was asked for, given lock/mute/volume. */
  private syncMusic(): void {
    if (!this.game) return;
    this.hookUnlock();
    const want = this.canPlayMusic() && this.wantedMusic && this.hasAudio(this.wantedMusic) ? this.wantedMusic : null;
    if (this.current?.key === want) return;

    const old = this.current;
    this.current = null;
    if (old) {
      this.cancelFadesFor(old.sound);
      // silenced hosts stop immediately; otherwise crossfade out
      if (!this.hostEnabled || this.musicVol <= 0) this.dispose(old.sound);
      else this.startFade(old.sound, old.sound.volume, 0, () => this.dispose(old.sound));
    }
    if (!want) return;
    try {
      const sound = this.game.sound.add(want, { loop: true, volume: 0 }) as Sound;
      sound.play();
      if (this.paused) this.game.sound.pauseAll();
      this.current = { key: want, sound };
      this.startFade(sound, 0, this.musicVol);
    } catch {
      this.current = null;
    }
  }

  private hookUnlock(): void {
    const sm = this.game?.sound;
    if (!sm || this.unlockHooked || !sm.locked) return;
    this.unlockHooked = true;
    sm.once('unlocked', () => {
      this.unlockHooked = false;
      this.syncMusic();
    });
  }

  private hasAudio(key: string): boolean {
    try {
      return !!this.game?.cache.audio.exists(key);
    } catch {
      return false;
    }
  }

  private dispose(sound: Sound): void {
    try {
      sound.stop();
      sound.destroy();
    } catch {
      // already gone
    }
  }

  private startFade(sound: Sound, from: number, to: number, done?: () => void): void {
    sound.volume = from;
    this.fades.add({ sound, from, to, start: this.clock(), done });
    if (this.fadeTimer === undefined) this.fadeTimer = setInterval(() => this.stepFades(), FADE_TICK_MS);
  }

  private cancelFadesFor(sound: Sound): void {
    for (const f of [...this.fades]) if (f.sound === sound) this.fades.delete(f);
    this.stopTimerIfIdle();
  }

  private stepFades(): void {
    const t = this.clock();
    for (const f of [...this.fades]) {
      const k = Math.min(1, (t - f.start) / FADE_MS);
      try {
        f.sound.volume = f.from + (f.to - f.from) * k;
      } catch {
        this.fades.delete(f);
        continue;
      }
      if (k >= 1) {
        this.fades.delete(f);
        f.done?.();
      }
    }
    this.stopTimerIfIdle();
  }

  private stopTimerIfIdle(): void {
    if (this.fades.size === 0 && this.fadeTimer !== undefined) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = undefined;
    }
  }
}
