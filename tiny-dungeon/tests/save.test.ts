import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_VERSION } from '../src/save/schema';
import { MAX_CLAIMS, SaveManager, defaultSave, migrate } from '../src/save/SaveManager';
import { FakePlatform } from './helpers';

describe('migrate', () => {
  it('returns valid defaults for empty / null / garbage', () => {
    const def = defaultSave();
    for (const raw of [undefined, null, '', 'not json {', '[1,2]', 42, true, [], {}]) {
      expect(migrate(raw)).toEqual(def);
    }
  });

  it('defaultSave is valid and stable through JSON', () => {
    const d = defaultSave();
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.heroes).toEqual(['knight']);
    expect(d.selectedHero).toBe('knight');
    expect(d.settings).toMatchObject({ musicVolume: 0.6, sfxVolume: 0.8, screenShake: true, damageNumbers: true, joystick: 'floating' });
    expect(migrate(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it('repairs wrong types, NaN and negatives', () => {
    const s = migrate({
      gold: NaN, meta: { a: -3, b: 2.7, c: 'x' }, heroes: 'knight', selectedHero: 5,
      stats: { runs: -1, totalKills: 'many', bestRoom: Infinity, bestRoomByHero: { knight: 4, wizard: 9 } },
      settings: { musicVolume: 7, sfxVolume: -2, screenShake: 'yes', joystick: 'weird' },
      daily: { '2025-01-01': { bestRoom: -4, kills: 'x' }, bogus: {}, '2025-01-02': 5 },
      rewards: { day: 3, claimsToday: -1, claimed: { a: 'x', b: 5 }, tokens: 2.9 },
      cosmetics: { owned: ['skin_gold', 3, 'skin_gold'], equipped: { knight: 'skin_gold', ghost: 'x', mage: 7 } },
      lastRun: { runId: 5 },
    });
    expect(s.gold).toBe(0);
    expect(s.meta).toEqual({ b: 2 });
    expect(s.heroes).toEqual(['knight']);
    expect(s.selectedHero).toBe('knight');
    expect(s.stats.runs).toBe(0);
    expect(s.stats.totalKills).toBe(0);
    expect(s.stats.bestRoom).toBe(0);
    expect(s.stats.bestRoomByHero).toEqual({ knight: 4 });
    expect(s.settings.musicVolume).toBe(1);
    expect(s.settings.sfxVolume).toBe(0);
    expect(s.settings.screenShake).toBe(true);
    expect(s.settings.joystick).toBe('floating');
    expect(s.daily).toEqual({ '2025-01-01': { bestRoom: 0, kills: 0, attempts: 0 } });
    expect(s.rewards).toEqual({ day: '', claimsToday: 0, claimed: { b: 5 }, tokens: 2 });
    expect(s.cosmetics).toEqual({ owned: ['skin_gold'], equipped: { knight: 'skin_gold' } });
    expect(s.lastRun).toBeNull();
  });

  it('drops unknown heroes and keeps the selection consistent', () => {
    const s = migrate({ heroes: ['mage', 'dragon', 'mage'], selectedHero: 'ranger' });
    expect(s.heroes).toEqual(['knight', 'mage']);
    expect(s.selectedHero).toBe('knight');
    expect(migrate({ heroes: ['knight', 'ranger'], selectedHero: 'ranger' }).selectedHero).toBe('ranger');
  });

  it('upgrades an old (version 0 / missing) save and keeps its progress', () => {
    const s = migrate({ gold: 120, version: 0, meta: { hp: 2 }, heroes: ['knight', 'mage'], selectedHero: 'mage' });
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.gold).toBe(120);
    expect(s.meta).toEqual({ hp: 2 });
    expect(s.selectedHero).toBe('mage');
  });

  it('accepts a JSON string', () => {
    expect(migrate(JSON.stringify({ gold: 7 })).gold).toBe(7);
  });

  it('prunes daily results to 30 days and the ledger to the newest claims', () => {
    const daily: Record<string, unknown> = {};
    for (let i = 1; i <= 45; i++) daily[`2025-02-${String(i).padStart(2, '0')}`] = { bestRoom: i, kills: 1, attempts: 1 };
    const claimed: Record<string, number> = {};
    for (let i = 0; i < 500; i++) claimed[`run${i}:revive`] = i;
    const s = migrate({ daily, rewards: { claimed } });
    const days = Object.keys(s.daily);
    expect(days).toHaveLength(30);
    expect(days[0]).toBe('2025-02-16');
    expect(Object.keys(s.rewards.claimed)).toHaveLength(MAX_CLAIMS);
    expect(s.rewards.claimed['run499:revive']).toBe(499);
    expect(s.rewards.claimed['run0:revive']).toBeUndefined();
  });

  it('ignores __proto__ keys', () => {
    const s = migrate('{"meta":{"__proto__":3,"x":1}}');
    expect(Object.keys(s.meta)).toEqual(['x']);
  });

  it('round trips stably', () => {
    const once = migrate({ gold: 5, heroes: ['knight', 'ranger'], settings: { musicVolume: 0.3 } });
    expect(migrate(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });
});

describe('SaveManager', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('loads defaults when nothing is saved', async () => {
    const m = new SaveManager(new FakePlatform(null));
    expect(await m.load()).toEqual(defaultSave());
  });

  it('starts from defaults and warns on corrupted JSON', async () => {
    const p = new FakePlatform('{oops');
    const m = new SaveManager(p);
    expect(await m.load()).toEqual(defaultSave());
    expect(p.warnings.length).toBe(1);
  });

  it('loads and migrates stored data', async () => {
    const m = new SaveManager(new FakePlatform(JSON.stringify({ gold: 33 })));
    await m.load();
    expect(m.data.gold).toBe(33);
  });

  it('debounce coalesces writes', async () => {
    const p = new FakePlatform(null);
    const m = new SaveManager(p);
    await m.load();
    m.data.gold = 1;
    const a = m.save();
    m.data.gold = 2;
    const b = m.save();
    expect(a).toBe(b);
    await vi.advanceTimersByTimeAsync(499);
    expect(p.writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);
    await a;
    expect(p.writes).toHaveLength(1);
    expect(JSON.parse(p.writes[0]).gold).toBe(2);
  });

  it('flush writes immediately and cancels the pending debounce', async () => {
    const p = new FakePlatform(null);
    const m = new SaveManager(p);
    await m.load();
    m.data.gold = 9;
    const pending = m.save();
    await m.flush();
    await pending;
    expect(p.writes).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(p.writes).toHaveLength(1);
  });

  it('writes never overlap', async () => {
    const p = new FakePlatform(null);
    p.saveDelayMs = 50;
    const m = new SaveManager(p);
    await m.load();
    const all = [m.flush(), m.flush(), m.flush()];
    m.data.gold = 4;
    all.push(m.save());
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all(all);
    expect(p.writes.length).toBeGreaterThanOrEqual(3);
    expect(p.maxInFlight).toBe(1);
  });

  it('does not write before load (would clobber the real save)', async () => {
    const p = new FakePlatform('{"gold":5}');
    const m = new SaveManager(p);
    await m.flush();
    expect(p.writes).toHaveLength(0);
    expect(p.stored).toBe('{"gold":5}');
  });

  it('refuses to write more than 2 MiB', async () => {
    const p = new FakePlatform(null);
    const m = new SaveManager(p);
    await m.load();
    m.data.unlocks = ['x'.repeat(2.2 * 1024 * 1024)];
    await m.flush();
    expect(p.writes).toHaveLength(0);
    expect(p.errors).toHaveLength(1);
  });

  it('reset restores defaults and persists them', async () => {
    const p = new FakePlatform(JSON.stringify({ gold: 50 }));
    const m = new SaveManager(p);
    await m.load();
    await m.reset();
    expect(m.data.gold).toBe(0);
    expect(JSON.parse(p.stored!).gold).toBe(0);
  });

  it('onChange fires on save and unsubscribes', async () => {
    const m = new SaveManager(new FakePlatform(null));
    await m.load();
    const cb = vi.fn();
    const off = m.onChange(cb);
    void m.save();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    void m.save();
    expect(cb).toHaveBeenCalledTimes(1);
    await m.flush();
  });
});
