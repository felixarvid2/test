import type { AchievementDef, LifetimeStats } from '../data/types';
import type { RunStats } from '../sim/api';

// Content agent implements these; signatures are the contract.

export function emptyLifetimeStats(): LifetimeStats {
  return {
    runs: 0, wavesSurvived: 0, bestWave: 0, enemiesKilled: 0, bossesKilled: 0,
    goblinKingKills: 0, golemKills: 0, dragonKills: 0, towersMerged: 0, towersBought: 0,
    highestTowerLevel: 0, chainLightnings: 0, meteorsCalled: 0, abilitiesUsed: 0, flawlessWaves: 0,
    synergiesActivated: 0, legendariesPicked: 0, gemsEarned: 0, coinsEarned: 0, dailyRuns: 0,
    towerKills: {}, synergyCounts: {},
  };
}

/** Adds a finished run to lifetime stats (pure; returns a new object). */
export function mergeRunIntoLifetime(stats: LifetimeStats, run: RunStats, opts: { daily: boolean }): LifetimeStats {
  void stats; void run; void opts;
  throw new Error('not implemented');
}

/** Achievements whose target is now met and which are not in `unlocked`. */
export function evaluateAchievements(stats: LifetimeStats, unlocked: readonly string[]): AchievementDef[] {
  void stats; void unlocked;
  throw new Error('not implemented');
}
