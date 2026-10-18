import { META_UPGRADES } from '../data/meta';
import { SLOTS } from '../data/map';
import { TOWERS } from '../data/towers';
import {
  MAX_TOWER_LEVEL, type AbilityId, type DailyModifier, type MetaStat, type MetaUpgradeDef, type TowerId, type WaveModifier,
} from '../data/types';
import type { RunOptions } from '../sim/api';
import type { SaveData } from '../save/schema';
import type { SaveManager } from '../save/SaveManager';

/** Reads accept the save data or the manager that owns it. */
export type SaveLike = SaveData | Pick<SaveManager, 'data'>;

function dataOf(save: SaveLike): SaveData {
  return 'data' in save ? save.data : save;
}

/** Starting slots without meta upgrades. */
export const BASE_SLOTS = 4;

/** Best wave needed before an ability is offered (meteor and repair are there from the start). */
export const ABILITY_UNLOCK_WAVE: Record<AbilityId, number> = { meteor: 0, repair: 0, freeze: 5, frenzy: 10 };

export function metaDef(id: string): MetaUpgradeDef | undefined {
  return META_UPGRADES.find((m) => m.id === id);
}

export function metaLevel(save: SaveLike, id: string): number {
  const level = dataOf(save).metaLevels[id] ?? 0;
  const def = metaDef(id);
  return def ? Math.min(level, def.maxLevel) : level;
}

/** Cost of buying level `nextLevel` (1-based). */
export function metaCost(def: MetaUpgradeDef, nextLevel: number): number {
  return Math.round(def.baseCost * Math.pow(def.costGrowth, nextLevel - 1));
}

export function canBuyMeta(save: SaveLike, id: string): boolean {
  const def = metaDef(id);
  if (!def) return false;
  const level = metaLevel(save, id);
  return level < def.maxLevel && dataOf(save).gems >= metaCost(def, level + 1);
}

/** Spends gems and raises the level by one. Returns false (and changes nothing) when not allowed. */
export function buyMeta(save: SaveManager, id: string): boolean {
  if (!canBuyMeta(save, id)) return false;
  const def = metaDef(id) as MetaUpgradeDef;
  const next = metaLevel(save, id) + 1;
  const cost = metaCost(def, next);
  void save.update((d) => {
    d.gems -= cost;
    d.metaLevels[id] = next;
  });
  return true;
}

/** Sum of valuePerLevel * level over every meta upgrade of that stat (float noise rounded off). */
export function metaTotal(save: SaveLike, stat: MetaStat): number {
  let total = 0;
  for (const def of META_UPGRADES) {
    if (def.stat === stat) total += metaLevel(save, def.id) * def.valuePerLevel;
  }
  return Math.round(total * 1e6) / 1e6;
}

// ---------- towers ----------

export function isTowerUnlocked(save: SaveLike, id: TowerId): boolean {
  return dataOf(save).unlockedTowers.includes(id);
}

/** Gem price to unlock a tower: 0 for start towers, Infinity for unknown towers. */
export function towerUnlockCost(id: TowerId): number {
  const def = TOWERS[id];
  if (!def) return Infinity;
  return def.unlock.kind === 'gems' ? def.unlock.cost : 0;
}

export function canUnlockTower(save: SaveLike, id: TowerId): boolean {
  return !isTowerUnlocked(save, id) && Number.isFinite(towerUnlockCost(id)) && dataOf(save).gems >= towerUnlockCost(id);
}

/** Spends gems and adds the tower to the collection. Returns false when not allowed. */
export function unlockTower(save: SaveManager, id: TowerId): boolean {
  if (!canUnlockTower(save, id)) return false;
  const cost = towerUnlockCost(id);
  void save.update((d) => {
    d.gems -= cost;
    d.unlockedTowers.push(id);
  });
  return true;
}

// ---------- abilities ----------

/** Meteor + repair from the start; freeze at best wave 5, frenzy at 10 (progressive introduction). */
export function abilitiesFor(save: SaveLike): AbilityId[] {
  const best = dataOf(save).stats.bestWave;
  return (['meteor', 'repair', 'freeze', 'frenzy'] as const).filter((id) => best >= ABILITY_UNLOCK_WAVE[id]);
}

// ---------- run options ----------

function mergeWaveModifiers(mods: WaveModifier[]): WaveModifier | undefined {
  if (mods.length === 0) return undefined;
  const out: WaveModifier = {};
  for (const m of mods) {
    for (const k of ['enemyHpMult', 'enemySpeedMult', 'enemyCountMult', 'coinMult'] as const) {
      if (m[k] !== undefined) out[k] = (out[k] ?? 1) * m[k];
    }
    if (m.eliteChance !== undefined) out.eliteChance = (out.eliteChance ?? 0) + m.eliteChance;
  }
  return out;
}

/** Pools of several modifiers intersect; when that leaves nothing, the first pool wins. */
function dailyPool(modifiers: DailyModifier[]): TowerId[] | undefined {
  const pools = modifiers.map((m) => m.towerPool).filter((p): p is TowerId[] => !!p && p.length > 0);
  if (pools.length === 0) return undefined;
  const both = pools[0].filter((id) => pools.every((p) => p.includes(id)));
  return both.length > 0 ? both : [...pools[0]];
}

export function buildRunOptions(
  save: SaveLike,
  opts: { seed: number; daily?: { modifiers: DailyModifier[] } },
): RunOptions {
  const data = dataOf(save);
  const startLevel = Math.floor(metaTotal(data, 'startLevel'));
  const options: RunOptions = {
    seed: opts.seed,
    towerPool: [...data.unlockedTowers],
    abilities: abilitiesFor(data),
    castleHpBonus: metaTotal(data, 'castleHp'),
    startCoinsBonus: metaTotal(data, 'startCoins'),
    damagePct: metaTotal(data, 'damagePct'),
    fireRatePct: metaTotal(data, 'fireRatePct'),
    discountPct: metaTotal(data, 'discountPct'),
    coinGainPct: metaTotal(data, 'coinGainPct'),
    abilityCdPct: metaTotal(data, 'abilityCdPct'),
    startTowerLevel: Math.min(MAX_TOWER_LEVEL, 1 + startLevel),
    startingSlots: Math.min(SLOTS.length, BASE_SLOTS + Math.floor(metaTotal(data, 'extraSlot'))),
    freeRerolls: Math.floor(metaTotal(data, 'rerolls')),
  };
  const mods = opts.daily?.modifiers;
  if (mods) {
    const pool = dailyPool(mods);
    if (pool) options.towerPool = pool;
    const effects = mods.flatMap((m) => m.effects ?? []);
    const startCoins = mods.reduce((sum, m) => sum + (m.startCoins ?? 0), 0);
    const waveModifier = mergeWaveModifiers(mods.map((m) => m.waveModifier).filter((w): w is WaveModifier => !!w));
    options.daily = {
      ...(waveModifier ? { waveModifier } : {}),
      ...(effects.length > 0 ? { effects } : {}),
      ...(startCoins > 0 ? { startCoins } : {}),
    };
  }
  return options;
}
