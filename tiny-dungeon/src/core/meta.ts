// Permanent (between-run) progression: shop prices, effects, purchases and the gold a run banks.
import { BALANCE } from '../config/balance';
import { HEROES } from '../data/heroes';
import { META_BY_ID, META_UPGRADES } from '../data/meta';
import type { SaveData } from '../save/schema';
import { scaleEffects } from './stats';
import type { HeroId, MetaUpgradeDef, RunSummary, StatEffect } from './types';

/** Price of the NEXT level when `level` levels are already owned. */
export function metaCost(def: MetaUpgradeDef, level: number): number {
  return Math.round(def.baseCost * Math.pow(def.costGrowth, level));
}

/** Stat effects of all owned permanent upgrades (one list per upgrade, already scaled by level). */
export function metaEffects(meta: Record<string, number>): StatEffect[][] {
  const out: StatEffect[][] = [];
  for (const def of META_UPGRADES) {
    const lvl = Math.min(meta[def.id] ?? 0, def.maxLevel);
    if (lvl > 0 && def.effects.length > 0) out.push(scaleEffects(def.effects, lvl));
  }
  return out;
}

export function canBuyMeta(save: SaveData, id: string): boolean {
  const def = META_BY_ID[id];
  if (!def) return false;
  const level = save.meta[id] ?? 0;
  return level < def.maxLevel && save.gold >= metaCost(def, level);
}

/** Deducts gold, raises the level and applies armory unlocks. Returns false when it cannot be bought. */
export function buyMeta(save: SaveData, id: string): boolean {
  if (!canBuyMeta(save, id)) return false;
  const def = META_BY_ID[id];
  const level = save.meta[id] ?? 0;
  save.gold -= metaCost(def, level);
  save.meta[id] = level + 1;
  const unlock = def.special === 'unlockBow' ? 'bow' : def.special === 'unlockStaff' ? 'staff' : null;
  if (unlock && !save.unlocks.includes(unlock)) save.unlocks.push(unlock);
  return true;
}

export function buyHero(save: SaveData, hero: HeroId): boolean {
  if (save.heroes.includes(hero)) return false;
  const cost = HEROES[hero].unlockCost;
  if (save.gold < cost) return false;
  save.gold -= cost;
  save.heroes.push(hero);
  return true;
}

/** Gold banked after a run: what was collected plus a small bonus per cleared room. */
export function runGoldReward(summary: RunSummary): number {
  return Math.max(0, Math.floor(summary.gold + summary.roomsCleared * BALANCE.economy.roomBonusGold));
}

/** Extra upgrade cards per offer (Insight). */
export function extraChoices(meta: Record<string, number>): number {
  return (meta.insight ?? 0) > 0 ? 1 : 0;
}

/** Free rerolls per run from permanent upgrades (Second Wind), excluding BALANCE.rerollsPerRun. */
export function freeRerolls(meta: Record<string, number>): number {
  return Math.min(meta.second_wind ?? 0, META_BY_ID.second_wind?.maxLevel ?? 0);
}
