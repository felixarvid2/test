import { TOWER_IDS, type AchievementDef, type TowerId } from '../data/types';
import type { RunStats } from '../sim/api';
import { pruneClaimed, type SaveManager } from '../save/SaveManager';
import { evaluateAchievements, mergeRunIntoLifetime } from './achievements';

export interface FinishOptions {
  /** Daily challenge key (YYYY-MM-DD) when the run was the daily challenge. */
  daily?: string;
  /** The doubleGems reward was claimed before banking: bank twice the run's gems. */
  doubled: boolean;
  /**
   * Unique id of the run. With it, finishing the same run twice banks nothing the second time, and
   * a later applyDoubleGems cannot add on top of a run that was already banked doubled.
   */
  runId?: string;
}

export interface FinishResult {
  /** Gems from the run itself that were banked (doubled when `doubled`), without achievement gems. */
  gemsBanked: number;
  newAchievements: AchievementDef[];
  newBestWave: boolean;
  achievementGems: number;
  /** True when this run had been banked before (nothing changed). */
  alreadyBanked?: boolean;
}

const utcDate = (): string => new Date().toISOString().slice(0, 10);

const bankedKey = (runId: string): string => `${runId}:banked`;
const doubledKey = (runId: string): string => `${runId}:doubleGems:applied`;

function mark(d: { rewards: { claimed: Record<string, number> } }, key: string): void {
  d.rewards.claimed[key] = Date.now();
  d.rewards.claimed = pruneClaimed(d.rewards.claimed);
}

/**
 * Banks a finished run in one save update: gems (doubled if asked), lifetime stats, achievements
 * (ids stored, their gem rewards paid), best run, daily record and the towers seen in the run.
 */
export function finishRun(save: SaveManager, stats: RunStats, opts: FinishOptions): FinishResult {
  const before = save.data;
  if (opts.runId && bankedKey(opts.runId) in before.rewards.claimed) {
    return { gemsBanked: 0, newAchievements: [], newBestWave: false, achievementGems: 0, alreadyBanked: true };
  }

  const runGems = Math.max(0, Math.floor(stats.gemsEarned) || 0);
  const gemsBanked = opts.doubled ? runGems * 2 : runGems;
  const wave = Math.max(0, Math.floor(stats.wave) || 0);
  const previousBest = Math.max(before.stats.bestWave, before.bestRun?.wave ?? 0);

  const lifetime = mergeRunIntoLifetime(before.stats, stats, { daily: !!opts.daily });
  const newAchievements = evaluateAchievements(lifetime, before.achievements);
  const achievementGems = newAchievements.reduce((sum, a) => sum + Math.max(0, a.reward), 0);
  const seen = Object.keys(stats.towerKills).filter((id): id is TowerId => (TOWER_IDS as readonly string[]).includes(id));

  void save.update((d) => {
    d.gems += gemsBanked + achievementGems;
    d.stats = lifetime;
    for (const a of newAchievements) if (!d.achievements.includes(a.id)) d.achievements.push(a.id);
    for (const id of seen) if (!d.discoveredTowers.includes(id)) d.discoveredTowers.push(id);

    const best = d.bestRun;
    if (wave > 0 && (!best || wave > best.wave || (wave === best.wave && stats.enemiesKilled > best.kills))) {
      d.bestRun = { wave, kills: stats.enemiesKilled, merges: stats.towersMerged, gems: gemsBanked, date: utcDate() };
    }
    if (opts.daily) {
      const day = d.daily;
      d.daily = day && day.key === opts.daily
        ? { key: day.key, bestWave: Math.max(day.bestWave, wave), attempts: day.attempts + 1 }
        : { key: opts.daily, bestWave: wave, attempts: 1 };
    }
    if (opts.runId) {
      mark(d, bankedKey(opts.runId));
      if (opts.doubled) mark(d, doubledKey(opts.runId));
    }
  });

  return { gemsBanked, newAchievements, newBestWave: wave > previousBest, achievementGems };
}

/**
 * Doubles a run's gems after they were already banked (the player watched the ad on the result
 * screen). Adds `runGems` once per run: the second call for the same runId adds nothing. Returns
 * the gems added. Call it only after RewardService.claim('doubleGems', { runId }) succeeded.
 */
export function applyDoubleGems(save: SaveManager, runGems: number, runId: string): number {
  const add = Math.max(0, Math.floor(runGems) || 0);
  if (!runId || add === 0 || doubledKey(runId) in save.data.rewards.claimed) return 0;
  void save.update((d) => {
    d.gems += add;
    mark(d, doubledKey(runId));
  });
  return add;
}
