import { ACHIEVEMENTS } from '../data/achievements';
import { TOWER_IDS } from '../data/types';
import type { AchievementDef, BossId, LifetimeStats } from '../data/types';
import type { RunStats } from '../sim/api';

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
  const towerKills: LifetimeStats['towerKills'] = { ...stats.towerKills };
  for (const id of TOWER_IDS) {
    const kills = run.towerKills[id];
    if (kills) towerKills[id] = (towerKills[id] ?? 0) + kills;
  }
  const synergyCounts: Record<string, number> = { ...stats.synergyCounts };
  for (const id of run.synergiesActivated) synergyCounts[id] = (synergyCounts[id] ?? 0) + 1;
  const bossKills = (boss: BossId): number => run.bossesKilled.filter((b) => b === boss).length;

  return {
    runs: stats.runs + 1,
    wavesSurvived: stats.wavesSurvived + run.wavesCleared,
    bestWave: Math.max(stats.bestWave, run.wave),
    enemiesKilled: stats.enemiesKilled + run.enemiesKilled,
    bossesKilled: stats.bossesKilled + run.bossesKilled.length,
    goblinKingKills: stats.goblinKingKills + bossKills('goblinKing'),
    golemKills: stats.golemKills + bossKills('stoneGolem'),
    dragonKills: stats.dragonKills + bossKills('dragon'),
    towersMerged: stats.towersMerged + run.towersMerged,
    towersBought: stats.towersBought + run.towersBought,
    highestTowerLevel: Math.max(stats.highestTowerLevel, run.highestTowerLevel),
    chainLightnings: stats.chainLightnings + run.chainLightnings,
    meteorsCalled: stats.meteorsCalled + run.meteorsCalled,
    abilitiesUsed: stats.abilitiesUsed + run.abilitiesUsed,
    flawlessWaves: stats.flawlessWaves + run.flawlessWaves,
    synergiesActivated: stats.synergiesActivated + run.synergiesActivated.length,
    legendariesPicked: stats.legendariesPicked + run.legendariesPicked,
    gemsEarned: stats.gemsEarned + run.gemsEarned,
    coinsEarned: stats.coinsEarned + run.coinsEarned,
    dailyRuns: stats.dailyRuns + (opts.daily ? 1 : 0),
    towerKills,
    synergyCounts,
  };
}

/** Achievements whose target is now met and which are not in `unlocked`. */
export function evaluateAchievements(stats: LifetimeStats, unlocked: readonly string[]): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.includes(a.id) && stats[a.stat] >= a.target);
}
