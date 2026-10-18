import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_VERSION, START_TOWERS } from '../../src/save/schema';
import { SaveManager, defaultSave, migrate, pruneClaimed, type Catalog } from '../../src/save/SaveManager';
import { REWARD_CONFIG } from '../../src/rewards/config';
import { FakePlatform } from '../platform/fakePlatform';

const catalog: Catalog = { metaMax: { hp: 5, dmg: 3 }, achievementIds: ['a1', 'a2'] };
const mig = (raw: unknown) => migrate(raw, catalog);

describe('migrate', () => {
  it('returns valid defaults for empty / null / garbage', () => {
    const def = defaultSave();
    for (const raw of [undefined, null, '', 'not json {', '[1,2]', 42, true, [], {}]) {
      expect(mig(raw)).toEqual(def);
    }
  });

  it('defaultSave matches the documented shape and is stable through JSON', () => {
    const d = defaultSave();
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.version).toBe(1);
    expect(d.unlockedTowers).toEqual(['arrow', 'cannon', 'frost']);
    expect(d.discoveredTowers).toEqual([]);
    expect(d.settings).toMatchObject({
      musicVolume: 0.6, sfxVolume: 0.8, muted: false, screenShake: true, damageNumbers: true, showRanges: true,
    });
    expect(d.bestRun).toBeNull();
    expect(d.daily).toBeNull();
    expect(d.rewards).toEqual({ claimed: {}, counts: {} });
    expect(d.tutorial).toEqual({ firstRunDone: false, mergeHintShown: false });
    expect(d.stats.runs).toBe(0);
    expect(mig(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it('start towers are a fresh object each time (no shared mutable state)', () => {
    const a = defaultSave();
    a.unlockedTowers.push('fire');
    expect(defaultSave().unlockedTowers).toEqual([...START_TOWERS]);
  });

  it('repairs wrong types, NaN and negatives per field', () => {
    const s = mig({
      gems: NaN,
      metaLevels: { hp: -3, dmg: 2.7, nope: 4, x: 'x' },
      unlockedTowers: 'fire',
      discoveredTowers: ['arrow', 5, 'arrow', 'unicorn', 'fire'],
      achievements: ['a1', 7, 'a1', 'ghost', ''],
      stats: { runs: -1, bestWave: 'many', enemiesKilled: Infinity, towerKills: { arrow: 4.9, ghost: 9, fire: -1 }, synergyCounts: { s1: 2, s2: 'x', s3: 0 } },
      settings: { musicVolume: 7, sfxVolume: -2, muted: 'yes', screenShake: 'no', showRanges: false },
      bestRun: { wave: 'x' },
      daily: { key: 'tuesday', bestWave: 3 },
      rewards: { claimed: { a: 'x', b: 5, c: -1 }, counts: { revive: { day: 'bad', n: 1 }, reroll: { day: '2026-01-02', n: 2.9 }, junk: 5 } },
      tutorial: { firstRunDone: 1, mergeHintShown: true },
    });
    expect(s.gems).toBe(0);
    expect(s.metaLevels).toEqual({ dmg: 2 });
    expect(s.unlockedTowers).toEqual(['arrow', 'cannon', 'frost']);
    expect(s.discoveredTowers).toEqual(['arrow', 'fire']);
    expect(s.achievements).toEqual(['a1']);
    expect(s.stats.runs).toBe(0);
    expect(s.stats.bestWave).toBe(0);
    expect(s.stats.enemiesKilled).toBe(0);
    expect(s.stats.towerKills).toEqual({ arrow: 4 });
    expect(s.stats.synergyCounts).toEqual({ s1: 2 });
    expect(s.settings.musicVolume).toBe(1);
    expect(s.settings.sfxVolume).toBe(0);
    expect(s.settings.muted).toBe(false);
    expect(s.settings.screenShake).toBe(true);
    expect(s.settings.showRanges).toBe(false);
    expect(s.bestRun).toBeNull();
    expect(s.daily).toBeNull();
    expect(s.rewards).toEqual({ claimed: { b: 5 }, counts: { reroll: { day: '2026-01-02', n: 2 } } });
    expect(s.tutorial).toEqual({ firstRunDone: false, mergeHintShown: true });
  });

  it('clamps numbers: meta level to its max, gems to a sane ceiling, volumes to 0..1', () => {
    const s = mig({ gems: 1e30, metaLevels: { hp: 99, dmg: 1 }, settings: { musicVolume: 0.25 } });
    expect(s.gems).toBe(1_000_000_000);
    expect(s.metaLevels).toEqual({ hp: 5, dmg: 1 });
    expect(s.settings.musicVolume).toBe(0.25);
  });

  it('always keeps the start towers and drops unknown tower ids', () => {
    const s = mig({ unlockedTowers: ['fire', 'dragon', 'fire', 'lightning'] });
    expect(s.unlockedTowers).toEqual(['arrow', 'cannon', 'frost', 'fire', 'lightning']);
    expect(mig({ unlockedTowers: [] }).unlockedTowers).toEqual(['arrow', 'cannon', 'frost']);
  });

  it('keeps ids when the content catalog is empty (unknown, not invalid)', () => {
    const s = migrate({ metaLevels: { anything: 3 }, achievements: ['whatever'] }, { metaMax: {}, achievementIds: [] });
    expect(s.metaLevels).toEqual({ anything: 3 });
    expect(s.achievements).toEqual(['whatever']);
  });

  it('keeps a valid bestRun and daily record', () => {
    const bestRun = { wave: 12, kills: 340, merges: 50, gems: 80, date: '2026-03-04' };
    const daily = { key: '2026-03-04', bestWave: 9, attempts: 2 };
    const s = mig({ bestRun, daily });
    expect(s.bestRun).toEqual(bestRun);
    expect(s.daily).toEqual(daily);
    expect(mig({ bestRun: { ...bestRun, date: 'x', wave: 0.5 } }).bestRun).toBeNull();
    expect(mig({ bestRun: { ...bestRun, date: 'x' } }).bestRun).toEqual({ ...bestRun, date: '' });
  });

  it('upgrades an old (version 0 / missing) save and keeps its progress', () => {
    const s = mig({ gems: 120, version: 0, metaLevels: { hp: 2 }, unlockedTowers: ['fire'] });
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.gems).toBe(120);
    expect(s.metaLevels).toEqual({ hp: 2 });
    expect(s.unlockedTowers).toContain('fire');
  });

  it('reads a save from a newer version best-effort instead of discarding it', () => {
    const s = mig({ version: 99, gems: 5, futureField: { a: 1 } });
    expect(s.gems).toBe(5);
    expect(s.version).toBe(SAVE_VERSION);
    expect('futureField' in s).toBe(false);
  });

  it('accepts a JSON string', () => {
    expect(mig(JSON.stringify({ gems: 7 })).gems).toBe(7);
  });

  it('prunes the claim ledger to the newest claims', () => {
    const claimed: Record<string, number> = {};
    for (let i = 0; i < 500; i++) claimed[`run${i}:revive`] = i;
    const s = mig({ rewards: { claimed } });
    expect(Object.keys(s.rewards.claimed)).toHaveLength(REWARD_CONFIG.maxClaims);
    expect(s.rewards.claimed['run499:revive']).toBe(499);
    expect(s.rewards.claimed['run0:revive']).toBeUndefined();
    const small = { a: 1 };
    expect(pruneClaimed(small)).toBe(small);
  });

  it('ignores __proto__ keys', () => {
    const s = mig('{"metaLevels":{"__proto__":3,"hp":1}}');
    expect(Object.keys(s.metaLevels)).toEqual(['hp']);
  });

  it('round trips stably', () => {
    const once = mig({ gems: 5, unlockedTowers: ['fire'], settings: { musicVolume: 0.3 }, discoveredTowers: ['fire'] });
    expect(mig(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });
});

describe('SaveManager', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = (stored: string | null = null) => {
    const p = new FakePlatform(stored);
    return { p, m: new SaveManager(p, catalog) };
  };

  it('loads defaults when nothing is saved', async () => {
    const { m } = make(null);
    expect(await m.load()).toEqual(defaultSave());
  });

  it('starts from defaults and warns on corrupted JSON', async () => {
    const { p, m } = make('{oops');
    expect(await m.load()).toEqual(defaultSave());
    expect(p.warnings).toHaveLength(1);
    expect(p.warnings[0]).toMatch(/corrupted/i);
  });

  it('survives a platform whose loadData rejects', async () => {
    const { p, m } = make(null);
    p.loadData = async () => { throw new Error('storage down'); };
    expect(await m.load()).toEqual(defaultSave());
    expect(p.warnings).toHaveLength(1);
  });

  it('loads and migrates stored data', async () => {
    const { m } = make(JSON.stringify({ gems: 33, unlockedTowers: ['fire', 'bogus'] }));
    await m.load();
    expect(m.data.gems).toBe(33);
    expect(m.data.unlockedTowers).toEqual(['arrow', 'cannon', 'frost', 'fire']);
  });

  it('debounce coalesces writes', async () => {
    const { p, m } = make(null);
    await m.load();
    m.data.gems = 1;
    const a = m.save();
    m.data.gems = 2;
    const b = m.save();
    expect(a).toBe(b);
    await vi.advanceTimersByTimeAsync(499);
    expect(p.writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);
    await a;
    expect(p.writes).toHaveLength(1);
    expect(JSON.parse(p.writes[0]).gems).toBe(2);
  });

  it('flush writes immediately and cancels the pending debounce', async () => {
    const { p, m } = make(null);
    await m.load();
    m.data.gems = 9;
    const pending = m.save();
    await m.flush();
    await pending;
    expect(p.writes).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(p.writes).toHaveLength(1);
  });

  it('update applies, notifies and schedules a debounced save', async () => {
    const { p, m } = make(null);
    await m.load();
    const seen: number[] = [];
    m.onChange((d) => seen.push(d.gems));
    const done = m.update((d) => { d.gems = 5; });
    expect(m.data.gems).toBe(5);
    expect(seen).toEqual([5]);
    expect(p.writes).toHaveLength(0);
    void m.update((d) => { d.gems += 1; });
    await vi.advanceTimersByTimeAsync(600);
    await done;
    expect(p.writes).toHaveLength(1);
    expect(JSON.parse(p.writes[0]).gems).toBe(6);
  });

  it('update still notifies when the mutator throws, and rethrows', async () => {
    const { m } = make(null);
    await m.load();
    const cb = vi.fn();
    m.onChange(cb);
    expect(() => m.update(() => { throw new Error('boom'); })).toThrow('boom');
    expect(cb).toHaveBeenCalledTimes(1);
    await m.flush();
  });

  it('writes never overlap', async () => {
    const { p, m } = make(null);
    p.saveDelayMs = 50;
    await m.load();
    const all = [m.flush(), m.flush(), m.flush()];
    m.data.gems = 4;
    all.push(m.save());
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all(all);
    expect(p.writes.length).toBeGreaterThanOrEqual(3);
    expect(p.maxInFlight).toBe(1);
  });

  it('does not write before load (would clobber the real save)', async () => {
    const { p, m } = make('{"gems":5}');
    await m.flush();
    expect(p.writes).toHaveLength(0);
    expect(p.stored).toBe('{"gems":5}');
  });

  it('refuses to write more than 500 KiB', async () => {
    const { p, m } = make(null);
    await m.load();
    m.data.achievements = ['x'.repeat(600 * 1024)];
    await m.flush();
    expect(p.writes).toHaveLength(0);
    expect(p.errors).toHaveLength(1);
  });

  it('a failing saveData is logged, not thrown', async () => {
    const { p, m } = make(null);
    await m.load();
    p.saveData = async () => { throw new Error('quota'); };
    await expect(m.flush()).resolves.toBeUndefined();
    expect(p.warnings.some((w) => w.includes('quota'))).toBe(true);
  });

  it('reset restores defaults and persists them', async () => {
    const { p, m } = make(JSON.stringify({ gems: 50 }));
    await m.load();
    await m.reset();
    expect(m.data.gems).toBe(0);
    expect(JSON.parse(p.stored!).gems).toBe(0);
  });

  it('onChange fires on save and unsubscribes; a throwing listener does not break others', async () => {
    const { p, m } = make(null);
    await m.load();
    m.onChange(() => { throw new Error('listener'); });
    const cb = vi.fn();
    const off = m.onChange(cb);
    void m.save();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(p.warnings.some((w) => w.includes('listener'))).toBe(true);
    off();
    void m.save();
    expect(cb).toHaveBeenCalledTimes(1);
    await m.flush();
  });

  it('round trips through the platform string', async () => {
    const { p, m } = make(null);
    await m.load();
    m.update((d) => { d.gems = 10; d.discoveredTowers.push('fire'); d.tutorial.firstRunDone = true; });
    await m.flush();
    const again = new SaveManager(new FakePlatform(p.stored), catalog);
    await again.load();
    expect(again.data).toEqual(m.data);
  });
});
