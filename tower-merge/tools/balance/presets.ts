/**
 * Build presets for the balance tools: which towers are unlocked and how much meta progression a
 * simulated player has. Options are produced by the game's own buildRunOptions(), so the numbers
 * here always match what a real save would give.
 */
import { META_UPGRADES } from '../../src/data/meta';
import { TOWER_IDS } from '../../src/data/types';
import type { AbilityId, TowerId } from '../../src/data/types';
import { buildRunOptions, metaCost, metaTotal } from '../../src/core/meta';
import type { RunOptions } from '../../src/sim/api';
import type { SaveData } from '../../src/save/schema';
import { TOWERS } from '../../src/data/towers';
import { Rng } from '../../src/sim/rng';

export const START_POOL: TowerId[] = ['arrow', 'cannon', 'frost'];
export const FULL_POOL: TowerId[] = [...TOWER_IDS];
export const ALL_ABILITIES: AbilityId[] = ['meteor', 'freeze', 'repair', 'frenzy'];

export type MetaPreset = 'fresh' | 'mid' | 'late' | 'max';

/** Gems a player has earned in total (spent on towers and meta). A run pays roughly 25-70 gems. */
export const META_GEMS: Record<MetaPreset, number> = { fresh: 0, mid: 1500, late: 5000, max: 1e9 };
const MID_TOWERS: TowerId[] = ['arrow', 'cannon', 'frost', 'lightning', 'fire'];

/**
 * Spends `gems` like a player who always buys the cheapest next level: levels stay balanced
 * across all stats and the expensive slot/start-level cards come last.
 */
export function spendMeta(gems: number): Record<string, number> {
  const levels: Record<string, number> = {};
  let left = gems;
  for (;;) {
    let best: { id: string; cost: number } | null = null;
    for (const def of META_UPGRADES) {
      const lvl = levels[def.id] ?? 0;
      if (lvl >= def.maxLevel) continue;
      const cost = metaCost(def, lvl + 1);
      if (cost <= left && (!best || cost < best.cost)) best = { id: def.id, cost };
    }
    if (!best) return levels;
    levels[best.id] = (levels[best.id] ?? 0) + 1;
    left -= best.cost;
  }
}

/** Gems a preset has spent on unlocking its natural towers; the rest went into meta upgrades. */
function naturalTowerGems(preset: MetaPreset): number {
  return towersForMeta(preset, 'mixed').reduce((n, id) => n + (TOWERS[id].unlock.kind === 'gems' ? TOWERS[id].unlock.cost : 0), 0);
}

/**
 * The meta levels belong to the preset, not to the pool a run happens to use: experiments that
 * restrict the pool (start towers only, random subsets, one tower removed) keep the same bonuses.
 */
function fakeSave(preset: MetaPreset, unlocked: TowerId[]): SaveData {
  return {
    version: 1,
    gems: 0,
    metaLevels: spendMeta(Math.max(0, META_GEMS[preset] - naturalTowerGems(preset))),
    unlockedTowers: unlocked,
    stats: { bestWave: 15 },
  } as unknown as SaveData;
}

export interface BuildConfig {
  seed: number;
  meta: MetaPreset;
  pool: TowerId[];
  /** Abilities of the run; the real game unlocks them with the best wave, the tools default to all four. */
  abilities?: AbilityId[];
}

export function towersForMeta(meta: MetaPreset, pool: 'start' | 'full' | 'mixed' | TowerId[]): TowerId[] {
  if (Array.isArray(pool)) return pool;
  if (pool === 'start') return START_POOL;
  if (pool === 'full') return FULL_POOL;
  return meta === 'fresh' ? START_POOL : meta === 'mid' ? MID_TOWERS : FULL_POOL;
}

export function buildOptions(c: BuildConfig, overrides: Partial<RunOptions> = {}): RunOptions {
  const o = buildRunOptions(fakeSave(c.meta, c.pool), { seed: c.seed });
  return { ...o, towerPool: [...c.pool], abilities: c.abilities ?? ALL_ABILITIES, ...overrides };
}

/** A random subset of 3-5 distinct towers. */
export function randomSubset(rng: Rng): TowerId[] {
  const n = 3 + rng.int(3);
  const ids = [...TOWER_IDS];
  const out: TowerId[] = [];
  while (out.length < n) out.push(ids.splice(rng.int(ids.length), 1)[0]);
  return out;
}

/** Human readable summary of what a meta preset grants. */
export function describePreset(meta: MetaPreset): string {
  const save = fakeSave(meta, meta === 'fresh' ? START_POOL : meta === 'mid' ? MID_TOWERS : FULL_POOL);
  const t = (s: Parameters<typeof metaTotal>[1]): number => metaTotal(save, s);
  return `${meta}: hp +${t('castleHp')}, coins +${t('startCoins')}, dmg +${Math.round(t('damagePct') * 100)}%, ` +
    `rate +${Math.round(t('fireRatePct') * 100)}%, cost -${Math.round(t('discountPct') * 100)}%, ` +
    `kill coins +${Math.round(t('coinGainPct') * 100)}%, cd -${Math.round(t('abilityCdPct') * 100)}%, ` +
    `start L${1 + Math.floor(t('startLevel'))}, slots ${4 + Math.floor(t('extraSlot'))}, rerolls ${Math.floor(t('rerolls'))}`;
}
