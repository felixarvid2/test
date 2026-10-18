import { describe, expect, it } from 'vitest';
import { emptyLifetimeStats, evaluateAchievements, mergeRunIntoLifetime } from '../../src/core/achievements';
import { ACHIEVEMENTS } from '../../src/data/achievements';
import type { RunStats } from '../../src/sim/api';

function run(over: Partial<RunStats> = {}): RunStats {
  return {
    wave: 7, wavesCleared: 6, enemiesKilled: 120, bossesKilled: [], towersMerged: 9, towersBought: 20,
    highestTowerLevel: 3, coinsEarned: 900, gemsEarned: 40, chainLightnings: 12, meteorsCalled: 2,
    abilitiesUsed: 4, flawlessWaves: 1, synergiesActivated: [], legendariesPicked: 0, upgradesTaken: [],
    towerKills: {}, towerDamage: {}, timeSeconds: 300, ...over,
  };
}

describe('mergeRunIntoLifetime', () => {
  it('sums counters, takes bests and counts the run', () => {
    const next = mergeRunIntoLifetime(emptyLifetimeStats(), run(), { daily: false });
    expect(next).toMatchObject({
      runs: 1, wavesSurvived: 6, bestWave: 7, enemiesKilled: 120, towersMerged: 9, towersBought: 20,
      highestTowerLevel: 3, coinsEarned: 900, gemsEarned: 40, chainLightnings: 12, meteorsCalled: 2,
      abilitiesUsed: 4, flawlessWaves: 1, dailyRuns: 0, bossesKilled: 0,
    });
    const again = mergeRunIntoLifetime(next, run({ wave: 5, highestTowerLevel: 2 }), { daily: false });
    expect(again.runs).toBe(2);
    expect(again.bestWave).toBe(7);
    expect(again.highestTowerLevel).toBe(3);
    expect(again.enemiesKilled).toBe(240);
  });

  it('counts bosses by id, synergies and tower kills', () => {
    const r = run({
      bossesKilled: ['goblinKing', 'stoneGolem', 'goblinKing', 'dragon'],
      synergiesActivated: ['shatter', 'napalm'], legendariesPicked: 2,
      towerKills: { arrow: 30, fire: 5 },
    });
    const first = mergeRunIntoLifetime(emptyLifetimeStats(), r, { daily: true });
    expect(first).toMatchObject({
      bossesKilled: 4, goblinKingKills: 2, golemKills: 1, dragonKills: 1,
      synergiesActivated: 2, legendariesPicked: 2, dailyRuns: 1,
    });
    expect(first.synergyCounts).toEqual({ shatter: 1, napalm: 1 });
    expect(first.towerKills).toEqual({ arrow: 30, fire: 5 });
    const second = mergeRunIntoLifetime(first, run({ synergiesActivated: ['shatter'], towerKills: { arrow: 10, cannon: 1 } }), { daily: false });
    expect(second.synergyCounts).toEqual({ shatter: 2, napalm: 1 });
    expect(second.towerKills).toEqual({ arrow: 40, fire: 5, cannon: 1 });
    expect(second.dailyRuns).toBe(1);
  });

  it('does not mutate its inputs', () => {
    const base = emptyLifetimeStats();
    const r = run({ synergiesActivated: ['shatter'], towerKills: { arrow: 3 } });
    const snapshot = JSON.stringify(base);
    const runSnapshot = JSON.stringify(r);
    mergeRunIntoLifetime(base, r, { daily: true });
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(JSON.stringify(r)).toBe(runSnapshot);
  });
});

describe('evaluateAchievements', () => {
  it('returns nothing for a fresh save', () => {
    expect(evaluateAchievements(emptyLifetimeStats(), [])).toEqual([]);
  });

  it('unlocks achievements whose target is met', () => {
    const stats = { ...emptyLifetimeStats(), towersMerged: 100, bestWave: 10, dragonKills: 1, highestTowerLevel: 5, chainLightnings: 100 };
    const ids = evaluateAchievements(stats, []).map((a) => a.id);
    for (const id of ['firstMerge', 'merge100', 'survive10', 'dragonSlayer', 'level5', 'chain100']) expect(ids).toContain(id);
    expect(ids).not.toContain('merge500');
    expect(ids).not.toContain('wave15');
  });

  it('skips already unlocked achievements and is idempotent', () => {
    const stats = { ...emptyLifetimeStats(), towersMerged: 100 };
    const all = evaluateAchievements(stats, []).map((a) => a.id);
    expect(evaluateAchievements(stats, all)).toEqual([]);
    expect(evaluateAchievements(stats, ['firstMerge']).map((a) => a.id)).toEqual(all.filter((id) => id !== 'firstMerge'));
  });

  it('unlocks everything with maxed stats', () => {
    const big = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.stat, a.target * 2]));
    const stats = { ...emptyLifetimeStats(), ...big };
    expect(evaluateAchievements(stats, []).length).toBe(ACHIEVEMENTS.length);
  });
});
