import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AchievementDef } from '../../src/data/types';
import type { RunStats } from '../../src/sim/api';

const FIXTURE_ACH: AchievementDef[] = [
  { id: 'first', name: 'First', description: '', icon: 'star', stat: 'runs', target: 1, reward: 10 },
  { id: 'wave5', name: 'Wave 5', description: '', icon: 'trophy', stat: 'bestWave', target: 5, reward: 25 },
  { id: 'kills50', name: 'Kills', description: '', icon: 'skull', stat: 'enemiesKilled', target: 50, reward: 40 },
];
vi.mock('../../src/data/achievements', () => ({ ACHIEVEMENTS: FIXTURE_ACH }));
vi.mock('../../src/data/meta', () => ({ META_UPGRADES: [] }));

const { applyDoubleGems, finishRun } = await import('../../src/core/runResult');
const { SaveManager } = await import('../../src/save/SaveManager');
const { FakePlatform } = await import('../platform/fakePlatform');

function runStats(over: Partial<RunStats> = {}): RunStats {
  return {
    wave: 6, wavesCleared: 5, enemiesKilled: 60, bossesKilled: [], towersMerged: 12, towersBought: 20,
    highestTowerLevel: 3, coinsEarned: 900, gemsEarned: 40, chainLightnings: 0, meteorsCalled: 1, abilitiesUsed: 2,
    flawlessWaves: 1, synergiesActivated: [], legendariesPicked: 0, upgradesTaken: [],
    towerKills: { arrow: 30, fire: 30 }, towerDamage: {}, timeSeconds: 300, ...over,
  };
}

async function fresh(stored: string | null = null) {
  const platform = new FakePlatform(stored);
  const save = new SaveManager(platform);
  await save.load();
  return { platform, save };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-04T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('finishRun', () => {
  it('banks gems, lifetime stats, achievements and best run in one go', async () => {
    const { save } = await fresh();
    const r = finishRun(save, runStats(), { doubled: false });
    expect(r.gemsBanked).toBe(40);
    expect(r.newAchievements.map((a) => a.id).sort()).toEqual(['first', 'kills50', 'wave5']);
    expect(r.achievementGems).toBe(75);
    expect(r.newBestWave).toBe(true);
    const d = save.data;
    expect(d.gems).toBe(115);
    expect(d.achievements.sort()).toEqual(['first', 'kills50', 'wave5']);
    expect(d.stats.runs).toBe(1);
    expect(d.stats.bestWave).toBe(6);
    expect(d.stats.enemiesKilled).toBe(60);
    expect(d.bestRun).toEqual({ wave: 6, kills: 60, merges: 12, gems: 40, date: '2026-07-04' });
    expect(d.daily).toBeNull();
    await save.flush();
  });

  it('records discovered towers from the run kill table, ignoring unknown ids', async () => {
    const { save } = await fresh();
    save.data.discoveredTowers = ['arrow'];
    finishRun(save, runStats({ towerKills: { arrow: 1, fire: 5, ghost: 3 } as RunStats['towerKills'] }), { doubled: false });
    expect(save.data.discoveredTowers).toEqual(['arrow', 'fire']);
    await save.flush();
  });

  it('doubles the run gems but not the achievement gems', async () => {
    const { save } = await fresh();
    const r = finishRun(save, runStats(), { doubled: true });
    expect(r.gemsBanked).toBe(80);
    expect(r.achievementGems).toBe(75);
    expect(save.data.gems).toBe(155);
    expect(save.data.bestRun?.gems).toBe(80);
    await save.flush();
  });

  it('does not award an achievement twice and reports no new best for a worse run', async () => {
    const { save } = await fresh();
    finishRun(save, runStats(), { doubled: false });
    const gems = save.data.gems;
    const r = finishRun(save, runStats({ wave: 4, enemiesKilled: 10, gemsEarned: 5 }), { doubled: false });
    expect(r.newAchievements).toEqual([]);
    expect(r.achievementGems).toBe(0);
    expect(r.newBestWave).toBe(false);
    expect(save.data.gems).toBe(gems + 5);
    expect(save.data.achievements).toHaveLength(3);
    expect(save.data.bestRun?.wave).toBe(6);
    expect(save.data.stats.runs).toBe(2);
    await save.flush();
  });

  it('replaces bestRun on a higher wave, or the same wave with more kills', async () => {
    const { save } = await fresh();
    finishRun(save, runStats({ wave: 6, enemiesKilled: 60 }), { doubled: false });
    finishRun(save, runStats({ wave: 6, enemiesKilled: 50 }), { doubled: false });
    expect(save.data.bestRun?.kills).toBe(60);
    finishRun(save, runStats({ wave: 6, enemiesKilled: 70 }), { doubled: false });
    expect(save.data.bestRun?.kills).toBe(70);
    const r = finishRun(save, runStats({ wave: 9, enemiesKilled: 10 }), { doubled: false });
    expect(r.newBestWave).toBe(true);
    expect(save.data.bestRun?.wave).toBe(9);
    await save.flush();
  });

  it('tracks the daily record by key: attempts, best wave, reset on a new day', async () => {
    const { save } = await fresh();
    finishRun(save, runStats({ wave: 5 }), { daily: '2026-07-04', doubled: false });
    expect(save.data.daily).toEqual({ key: '2026-07-04', bestWave: 5, attempts: 1 });
    finishRun(save, runStats({ wave: 3 }), { daily: '2026-07-04', doubled: false });
    expect(save.data.daily).toEqual({ key: '2026-07-04', bestWave: 5, attempts: 2 });
    finishRun(save, runStats({ wave: 8 }), { daily: '2026-07-04', doubled: false });
    expect(save.data.daily).toEqual({ key: '2026-07-04', bestWave: 8, attempts: 3 });
    finishRun(save, runStats({ wave: 2 }), { daily: '2026-07-05', doubled: false });
    expect(save.data.daily).toEqual({ key: '2026-07-05', bestWave: 2, attempts: 1 });
    expect(save.data.stats.dailyRuns).toBe(4);
    finishRun(save, runStats({ wave: 20 }), { doubled: false });
    expect(save.data.daily).toEqual({ key: '2026-07-05', bestWave: 2, attempts: 1 });
    await save.flush();
  });

  it('persists everything', async () => {
    const { save, platform } = await fresh();
    finishRun(save, runStats(), { doubled: false });
    await save.flush();
    const stored = JSON.parse(platform.stored!);
    expect(stored.gems).toBe(115);
    expect(stored.bestRun.wave).toBe(6);
  });

  it('with a runId, finishing the same run twice banks only once', async () => {
    const { save } = await fresh();
    const a = finishRun(save, runStats(), { doubled: false, runId: 'run-1' });
    const gems = save.data.gems;
    const b = finishRun(save, runStats(), { doubled: false, runId: 'run-1' });
    expect(a.alreadyBanked).toBeUndefined();
    expect(b).toEqual({ gemsBanked: 0, newAchievements: [], newBestWave: false, achievementGems: 0, alreadyBanked: true });
    expect(save.data.gems).toBe(gems);
    expect(save.data.stats.runs).toBe(1);
    await save.flush();
  });

  it('survives garbage numbers in the stats', async () => {
    const { save } = await fresh();
    const r = finishRun(save, runStats({ gemsEarned: NaN, wave: -3 }), { doubled: true });
    expect(r.gemsBanked).toBe(0);
    expect(save.data.bestRun).toBeNull();
    await save.flush();
  });
});

describe('applyDoubleGems', () => {
  it('adds the run gems once per run, however often it is called', async () => {
    const { save } = await fresh();
    finishRun(save, runStats({ gemsEarned: 40 }), { doubled: false, runId: 'r1' });
    const base = save.data.gems;
    expect(applyDoubleGems(save, 40, 'r1')).toBe(40);
    expect(applyDoubleGems(save, 40, 'r1')).toBe(0);
    expect(applyDoubleGems(save, 40, 'r1')).toBe(0);
    expect(save.data.gems).toBe(base + 40);
    expect(applyDoubleGems(save, 10, 'r2')).toBe(10);
    expect(save.data.gems).toBe(base + 50);
    await save.flush();
  });

  it('cannot stack on a run that was already banked doubled', async () => {
    const { save } = await fresh();
    finishRun(save, runStats({ gemsEarned: 40 }), { doubled: true, runId: 'r1' });
    const base = save.data.gems;
    expect(applyDoubleGems(save, 40, 'r1')).toBe(0);
    expect(save.data.gems).toBe(base);
    await save.flush();
  });

  it('is idempotent across a restart', async () => {
    const a = await fresh();
    expect(applyDoubleGems(a.save, 40, 'r1')).toBe(40);
    await a.save.flush();
    const b = await fresh(a.platform.stored);
    expect(applyDoubleGems(b.save, 40, 'r1')).toBe(0);
    expect(b.save.data.gems).toBe(40);
  });

  it('ignores empty input', async () => {
    const { save } = await fresh();
    expect(applyDoubleGems(save, 0, 'r1')).toBe(0);
    expect(applyDoubleGems(save, NaN, 'r1')).toBe(0);
    expect(applyDoubleGems(save, 5, '')).toBe(0);
    expect(save.data.gems).toBe(0);
    await save.flush();
  });
});
