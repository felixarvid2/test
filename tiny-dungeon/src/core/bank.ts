import type { SaveData } from '../save/schema';
import { evaluateAchievements, recordRun } from './achievements';
import { recordDaily } from './daily';
import { runGoldReward } from './meta';
import type { AchievementDef, RunSummary } from './types';

export interface BankResult {
  gold: number;
  earned: AchievementDef[];
  newBest: boolean;
  best: number;
  /** True when this run was banked before: the numbers are for display only and nothing was granted. */
  alreadyBanked: boolean;
}

/**
 * Banks a finished (or interrupted) run into the save exactly once, guarded by save.lastRun.runId:
 * lifetime stats, the daily result (daily mode with a `dailyKey`), the gold reward and achievements.
 * Clears save.pendingRun when it belongs to this run. The caller persists the save.
 */
export function bankRun(save: SaveData, summary: RunSummary, opts: { dailyKey?: string } = {}): BankResult {
  const gold = runGoldReward(summary);
  if (save.pendingRun?.runId === summary.runId) save.pendingRun = null;
  if (save.lastRun?.runId === summary.runId) {
    return { gold, earned: [], newBest: false, best: save.stats.bestRoom, alreadyBanked: true };
  }
  const prevBest = save.stats.bestRoom;
  recordRun(save, summary);
  if (summary.mode === 'daily' && opts.dailyKey) recordDaily(save, opts.dailyKey, summary.roomsCleared, summary.kills);
  save.gold += gold;
  const earned = evaluateAchievements(save, summary);
  save.lastRun = summary;
  const reached = summary.roomsCleared + 1;
  return { gold, earned, newBest: reached > prevBest, best: save.stats.bestRoom, alreadyBanked: false };
}
