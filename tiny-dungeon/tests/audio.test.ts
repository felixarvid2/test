import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { AudioManager } from '../src/audio/AudioManager';

class FakeSound {
  volume = 0;
  playing = false;
  destroyed = false;
  private handlers = new Map<string, Array<() => void>>();
  constructor(readonly key: string, readonly config: Record<string, unknown>) {
    this.volume = Number(config.volume ?? 1);
  }
  once(ev: string, fn: () => void) { (this.handlers.get(ev) ?? this.handlers.set(ev, []).get(ev)!).push(fn); return this; }
  emit(ev: string) { for (const f of this.handlers.get(ev) ?? []) f(); this.handlers.delete(ev); }
  play() { this.playing = true; return true; }
  stop() { this.playing = false; this.emit('stop'); return true; }
  destroy() { this.destroyed = true; }
}

class FakeGame {
  handlers = new Map<string, Array<() => void>>();
  sounds: FakeSound[] = [];
  locked = false;
  paused = 0;
  sound = {
    get locked() { return self.locked; },
    add: (key: string, config: Record<string, unknown> = {}) => { const s = new FakeSound(key, config); this.sounds.push(s); return s; },
    once: (ev: string, fn: () => void) => { (this.handlers.get(ev) ?? this.handlers.set(ev, []).get(ev)!).push(fn); },
    pauseAll: () => { this.paused += 1; },
    resumeAll: () => { this.paused -= 1; },
  };
  cache = { audio: { exists: (k: string) => this.loaded.has(k) } };
  constructor(public loaded: Set<string>) { self = this; }
  unlock() { this.locked = false; for (const f of this.handlers.get('unlocked') ?? []) f(); this.handlers.delete('unlocked'); }
}
let self: FakeGame;

describe('AudioManager', () => {
  let t = 0;
  let game: FakeGame;
  let audio: AudioManager;
  const attach = (loaded: string[], locked = false) => {
    game = new FakeGame(new Set(loaded));
    game.locked = locked;
    audio = new AudioManager(() => t);
    audio.attach(game as unknown as Phaser.Game);
  };

  beforeEach(() => { t = 1000; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it('is a silent no-op before attach and for unloaded keys', () => {
    const a = new AudioManager();
    expect(() => { a.play('hit'); a.playMusic('music_menu'); a.stopMusic(); a.pauseAll(); a.resumeAll(); }).not.toThrow();
    attach([]);
    audio.play('hit');
    audio.playMusic('music_menu');
    expect(game.sounds).toHaveLength(0);
  });

  it('throttles per key', () => {
    attach(['hit', 'enemyDeath']);
    audio.play('hit'); t += 20; audio.play('hit');
    expect(game.sounds.filter((s) => s.key === 'hit')).toHaveLength(1);
    t += 30; audio.play('hit');
    expect(game.sounds.filter((s) => s.key === 'hit')).toHaveLength(2);
    audio.play('enemyDeath'); t += 10; audio.play('enemyDeath');
    expect(game.sounds.filter((s) => s.key === 'enemyDeath')).toHaveLength(1);
  });

  it('caps simultaneous instances and frees slots on complete', () => {
    attach(['click', 'chest']);
    for (let i = 0; i < 10; i++) { t += 100; audio.play('chest'); }
    const chests = game.sounds.filter((s) => s.key === 'chest');
    expect(chests).toHaveLength(4);
    chests[0].emit('complete');
    expect(chests[0].destroyed).toBe(true);
    audio.play('chest');
    expect(game.sounds.filter((s) => s.key === 'chest')).toHaveLength(5);
  });

  it('scales volume by the sfx slider, detunes coins, and skips at sfx 0', () => {
    attach(['coin', 'chest']);
    audio.setSettings(0.5, 0.5);
    audio.play('chest', { volume: 0.5, rate: 1.2 });
    expect(game.sounds[0].config).toMatchObject({ volume: 0.25, rate: 1.2 });
    audio.play('coin');
    expect(game.sounds[1].config.detune).not.toBe(0);
    audio.setSettings(0.5, 0);
    audio.play('chest');
    expect(game.sounds).toHaveLength(2);
  });

  it('respects host mute and pause', () => {
    attach(['chest', 'music_menu']);
    audio.setHostEnabled(false);
    audio.play('chest');
    audio.playMusic('music_menu');
    expect(game.sounds).toHaveLength(0);
    audio.setHostEnabled(true);
    expect(game.sounds.map((s) => s.key)).toEqual(['music_menu']);
    audio.pauseAll();
    audio.play('chest');
    expect(game.sounds).toHaveLength(1);
    audio.resumeAll();
    audio.play('chest');
    expect(game.sounds).toHaveLength(2);
  });

  it('waits for the audio unlock before starting music', () => {
    attach(['music_menu', 'chest'], true);
    audio.playMusic('music_menu');
    audio.play('chest');
    expect(game.sounds).toHaveLength(0);
    game.unlock();
    expect(game.sounds).toHaveLength(1);
    expect(game.sounds[0]).toMatchObject({ key: 'music_menu', playing: true });
    expect(game.sounds[0].config.loop).toBe(true);
  });

  it('crossfades between tracks over ~600 ms and removes the old one', () => {
    attach(['music_menu', 'music_dungeon']);
    audio.setSettings(0.6, 0.8);
    audio.playMusic('music_menu');
    const [menu] = game.sounds;
    t += 700; vi.advanceTimersByTime(700);
    expect(menu.volume).toBeCloseTo(0.6);
    audio.playMusic('music_dungeon');
    const dungeon = game.sounds[1];
    t += 300; vi.advanceTimersByTime(300);
    expect(menu.volume).toBeGreaterThan(0);
    expect(menu.volume).toBeLessThan(0.6);
    expect(dungeon.volume).toBeGreaterThan(0);
    t += 400; vi.advanceTimersByTime(400);
    expect(menu.destroyed).toBe(true);
    expect(dungeon.volume).toBeCloseTo(0.6);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not restart the same track and skips music at volume 0 (resuming when raised)', () => {
    attach(['music_menu']);
    audio.playMusic('music_menu');
    audio.playMusic('music_menu');
    expect(game.sounds).toHaveLength(1);
    audio.setSettings(0, 0.8);
    expect(game.sounds[0].destroyed).toBe(true);
    audio.setSettings(0.4, 0.8);
    expect(game.sounds).toHaveLength(2);
    audio.stopMusic();
    t += 700; vi.advanceTimersByTime(700);
    expect(game.sounds[1].destroyed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
