import { BALANCE } from '../data/balance';
import { UNLOCK_ORDER } from '../data/map';
import { TOWERS } from '../data/towers';
import type { TowerId } from '../data/types';
import { MAX_TOWER_LEVEL } from '../data/types';
import type { MoveResult } from './api';
import { FL } from './modifiers';
import { refresh } from './refresh';
import { TowerInst } from './state';
import type { SimState } from './state';

const E = BALANCE.economy;

/** Phases in which the board can be edited. */
export const canEditBoard = (s: SimState): boolean => s.phase === 'prewave' || s.phase === 'wave';

export function buyCost(s: SimState): number {
  return Math.max(E.buyMinCost, Math.round(E.buyBaseCost * Math.pow(E.buyGrowth, s.buyCount) * s.towerCostMult));
}

export function unlockSlotCost(s: SimState): number {
  if (!s.slots.some((sl) => !sl.unlocked)) return Infinity;
  return Math.round(E.slotUnlockBase * Math.pow(E.slotUnlockGrowth, s.unlockCount));
}

/** Coins a tower that was not bought is worth when sold. */
export const grantedValue = (level: number): number => Math.round(E.buyBaseCost * Math.pow(2, level - 1) * E.grantedTowerValue);

/** First free unlocked slot, centre of the board first. */
export function findFreeSlot(s: SimState): number {
  for (const id of UNLOCK_ORDER) {
    const sl = s.slots[id];
    if (sl.unlocked && !sl.tower) return id;
  }
  return -1;
}

export function rollTowerType(s: SimState): TowerId | null {
  const pool = s.opts.towerPool;
  if (pool.length === 0) return null;
  const weights = pool.map((id) => TOWERS[id].buyWeight);
  return pool[s.rngM.weighted(weights)];
}

/** Puts a new tower into a slot (no cost handling). */
export function placeTower(s: SimState, slot: number, type: TowerId, level: number, invested: number, temp = false): TowerInst {
  const t = new TowerInst();
  t.uid = s.nextTowerUid++;
  t.slot = slot;
  t.type = type;
  t.level = level;
  t.invested = invested;
  t.temp = temp;
  t.cooldown = 0.25;
  s.slots[slot].tower = t;
  if (level > s.stats.highestTowerLevel) s.stats.highestTowerLevel = level;
  s.emit({ type: 'towerPlaced', slot, tower: type, level });
  return t;
}

export function buyTower(s: SimState): { ok: boolean; slot?: number; tower?: TowerId } {
  if (!canEditBoard(s)) return { ok: false };
  const cost = buyCost(s);
  const slot = findFreeSlot(s);
  if (slot < 0 || s.coins < cost) return { ok: false };
  const type = rollTowerType(s);
  if (!type) return { ok: false };
  s.addCoins(-cost, undefined, undefined, false);
  s.buyCount++;
  s.stats.towersBought++;
  placeTower(s, slot, type, 1, cost);
  refresh(s);
  return { ok: true, slot, tower: type };
}

export function grantTower(s: SimState, type: TowerId, level: number): boolean {
  if (s.phase === 'defeated' || s.phase === 'over') return false;
  const lvl = Math.max(1, Math.min(MAX_TOWER_LEVEL, Math.round(level)));
  const slot = findFreeSlot(s);
  if (slot < 0) return false;
  placeTower(s, slot, type, lvl, grantedValue(lvl));
  refresh(s);
  return true;
}

export function canMerge(s: SimState, from: number, to: number): boolean {
  if (from === to || from < 0 || to < 0 || from >= s.slots.length || to >= s.slots.length) return false;
  const a = s.slots[from];
  const b = s.slots[to];
  if (!a.unlocked || !b.unlocked || !a.tower || !b.tower) return false;
  return a.tower.type === b.tower.type && a.tower.level === b.tower.level && a.tower.level < MAX_TOWER_LEVEL;
}

export function moveTower(s: SimState, from: number, to: number): MoveResult {
  if (!canEditBoard(s)) return 'invalid';
  if (from === to || from < 0 || to < 0 || from >= s.slots.length || to >= s.slots.length) return 'invalid';
  const a = s.slots[from];
  const b = s.slots[to];
  if (!a.unlocked || !b.unlocked || !a.tower) return 'invalid';
  if (canMerge(s, from, to)) {
    const ta = a.tower;
    const tb = b.tower!;
    const merged = new TowerInst();
    merged.uid = s.nextTowerUid++;
    merged.slot = to;
    merged.type = tb.type;
    merged.level = tb.level + 1;
    merged.invested = ta.invested + tb.invested;
    merged.kills = ta.kills + tb.kills;
    merged.damageDealt = ta.damageDealt + tb.damageDealt;
    merged.cooldown = Math.min(ta.cooldown, tb.cooldown);
    merged.aim = tb.aim;
    merged.temp = false;
    a.tower = null;
    b.tower = merged;
    s.stats.towersMerged++;
    if (merged.level > s.stats.highestTowerLevel) s.stats.highestTowerLevel = merged.level;
    const frenzy = s.gm.flags[FL.mergeFrenzy];
    if (frenzy > 0) s.mergeFrenzyTime = Math.max(s.mergeFrenzyTime, frenzy);
    s.emit({ type: 'merged', slot: to, fromSlot: from, tower: merged.type, level: merged.level });
    refresh(s);
    return 'merged';
  }
  if (!b.tower) {
    const t = a.tower;
    a.tower = null;
    b.tower = t;
    t.slot = to;
    refresh(s);
    return 'moved';
  }
  const ta = a.tower;
  const tb = b.tower;
  a.tower = tb;
  b.tower = ta;
  ta.slot = to;
  tb.slot = from;
  refresh(s);
  return 'swapped';
}

export function sellValue(s: SimState, slot: number): number {
  const t = s.slots[slot]?.tower;
  if (!t || t.temp) return 0;
  return Math.floor(t.invested * E.sellRefund);
}

export function sellTower(s: SimState, slot: number): boolean {
  if (!canEditBoard(s)) return false;
  const t = s.slots[slot]?.tower;
  if (!t) return false;
  const refund = sellValue(s, slot);
  s.slots[slot].tower = null;
  if (t.temp) s.tempTowerUid = 0;
  if (refund > 0) s.addCoins(refund, undefined, undefined, false);
  s.emit({ type: 'towerSold', slot, refund });
  refresh(s);
  return true;
}

export function unlockSlot(s: SimState, slot: number, free = false): boolean {
  if (!free && !canEditBoard(s)) return false;
  const sl = s.slots[slot];
  if (!sl || sl.unlocked) return false;
  if (!free) {
    const cost = unlockSlotCost(s);
    if (s.coins < cost) return false;
    s.addCoins(-cost, undefined, undefined, false);
    s.unlockCount++;
  }
  sl.unlocked = true;
  s.emit({ type: 'slotUnlocked', slot });
  refresh(s);
  return true;
}

/** Unlocks the next slot in UNLOCK_ORDER for free (upgrade/event reward). */
export function unlockNextSlot(s: SimState): boolean {
  for (const id of UNLOCK_ORDER) if (!s.slots[id].unlocked) return unlockSlot(s, id, true);
  return false;
}

/** Emergency power: a temporary level 5 tower of a random type for the current/next wave. */
export function grantTempTower(s: SimState): boolean {
  if (s.phase === 'defeated' || s.phase === 'over' || s.tempTowerUid !== 0) return false;
  const type = rollTowerType(s);
  if (!type) return false;
  let slot = findFreeSlot(s);
  let relock = -1;
  if (slot < 0) {
    for (const id of UNLOCK_ORDER) {
      const sl = s.slots[id];
      if (!sl.unlocked) { slot = id; relock = id; sl.unlocked = true; break; }
    }
  }
  if (slot < 0) return false;
  const t = placeTower(s, slot, type, BALANCE.emergency.legendaryLevel, 0, true);
  s.tempTowerUid = t.uid;
  s.tempTowerRelock = relock;
  refresh(s);
  return true;
}

export function removeTempTower(s: SimState): void {
  if (s.tempTowerUid === 0) return;
  for (const sl of s.slots) {
    if (sl.tower && sl.tower.uid === s.tempTowerUid) {
      s.emit({ type: 'towerSold', slot: sl.id, refund: 0 });
      sl.tower = null;
    }
  }
  if (s.tempTowerRelock >= 0 && !s.slots[s.tempTowerRelock].tower) s.slots[s.tempTowerRelock].unlocked = false;
  s.tempTowerUid = 0;
  s.tempTowerRelock = -1;
  refresh(s);
}
