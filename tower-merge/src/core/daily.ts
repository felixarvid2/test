import { DAILY_CONFLICT_GROUPS, DAILY_MODIFIERS } from '../data/daily';
import type { DailyModifier } from '../data/types';

/** 'YYYY-MM-DD' in UTC for the given time. */
export function dailyKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** FNV-1a 32-bit string hash. */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: tiny deterministic PRNG returning floats in [0, 1). */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WAVE_KEYS = ['enemyHpMult', 'enemySpeedMult', 'enemyCountMult'] as const;

function conflicts(a: DailyModifier, b: DailyModifier): boolean {
  if (a.towerPool && b.towerPool) return true;
  if (a.startCoins !== undefined && b.startCoins !== undefined) return true;
  if (WAVE_KEYS.some((k) => a.waveModifier?.[k] !== undefined && b.waveModifier?.[k] !== undefined)) return true;
  return DAILY_CONFLICT_GROUPS.some((g) => g.includes(a.id) && g.includes(b.id));
}

/** Deterministic seed and modifiers for a day: the same key always gives the same challenge. */
export function dailyChallenge(key: string): { key: string; seed: number; modifiers: DailyModifier[] } {
  const seed = hashString(key);
  const rng = makeRng(seed);
  // Fisher-Yates over a copy, then take the first modifier and the first one compatible with it.
  const pool = DAILY_MODIFIERS.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const first = pool[0];
  const second = pool.slice(1).find((m) => !conflicts(first, m));
  return { key, seed, modifiers: second ? [first, second] : [first] };
}
