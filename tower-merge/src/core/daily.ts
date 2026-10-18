import type { DailyModifier } from '../data/types';

// Content agent implements these; signatures are the contract.

/** 'YYYY-MM-DD' in UTC for the given time. */
export function dailyKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Deterministic seed and modifiers for a day. */
export function dailyChallenge(key: string): { key: string; seed: number; modifiers: DailyModifier[] } {
  void key;
  throw new Error('not implemented');
}
