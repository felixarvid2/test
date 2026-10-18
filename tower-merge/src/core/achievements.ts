import type { AchievementDef, LifetimeStats } from '../data/types';
import type { RunStats } from '../sim/api';

// Content agent implements these; signatures are the contract.

export function emptyLifetimeStats(): LifetimeStats {
  throw new Error('not implemented');
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
