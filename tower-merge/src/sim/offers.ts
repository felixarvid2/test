import { BALANCE } from '../data/balance';
import type { InstantEffect, Rarity, UpgradeDef } from '../data/types';
import { RARITIES, TOWER_IDS } from '../data/types';
import { findFreeSlot, grantTower, rollTowerType, unlockNextSlot } from './board';
import { refresh } from './refresh';
import type { SimState } from './state';

const U = BALANCE.upgrades;

/**
 * Generic stand-ins used only when fewer than three real upgrades are available (small content
 * sets, test fixtures, a run that exhausted the pool). They never change tower stats.
 */
export const FALLBACK_UPGRADES: UpgradeDef[] = [
  {
    id: 'fallback_coins', name: 'Coin Purse', description: `Gain ${U.fallbackCoins[0]} coins.`, rarity: 'common',
    icon: 'coin', maxStacks: 9999, effects: [{ kind: 'instant', action: 'grantCoins', value: U.fallbackCoins[0] }],
  },
  {
    id: 'fallback_heal', name: 'Field Medic', description: `Heal ${Math.round(U.fallbackHeal * 100)}% of castle max HP.`,
    rarity: 'common', icon: 'heart', maxStacks: 9999, effects: [{ kind: 'instant', action: 'healCastle', value: U.fallbackHeal }],
  },
  {
    id: 'fallback_treasure', name: 'Buried Treasure', description: `Gain ${U.fallbackCoins[1]} coins.`, rarity: 'rare',
    icon: 'treasure', maxStacks: 9999, effects: [{ kind: 'instant', action: 'grantCoins', value: U.fallbackCoins[1] }],
  },
  {
    id: 'fallback_hoard', name: 'Dragon Hoard', description: `Gain ${U.fallbackCoins[2]} coins.`, rarity: 'epic',
    icon: 'gem', maxStacks: 9999, effects: [{ kind: 'instant', action: 'grantCoins', value: U.fallbackCoins[2] }],
  },
];

const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

function allUpgrades(s: SimState): UpgradeDef[] {
  return s.content.upgrades;
}

/** Upgrades that may be offered right now (stack limits and requirements respected). */
export function eligibleUpgrades(s: SimState): UpgradeDef[] {
  const onBoard = new Set<string>();
  for (const sl of s.slots) if (sl.tower) onBoard.add(sl.tower.type);
  for (const t of s.opts.towerPool) onBoard.add(t);
  const upcoming = s.wave + 1;
  return allUpgrades(s).filter((u) => {
    if ((s.taken.get(u.id) ?? 0) >= u.maxStacks) return false;
    const r = u.requires;
    if (!r) return true;
    if (r.minWave !== undefined && upcoming < r.minWave) return false;
    if (r.anyTower && !r.anyTower.some((t) => onBoard.has(t))) return false;
    if (r.upgrades && !r.upgrades.every((id) => s.taken.has(id))) return false;
    return true;
  });
}

function bandWeights(wave: number): Record<Rarity, number> {
  for (const b of BALANCE.rarity) if (wave <= b.maxWave) return b.weights;
  return BALANCE.rarity[BALANCE.rarity.length - 1].weights;
}

/** Picks up to `count` distinct upgrades from `pool` weighted by the rarity band of the current wave. */
function weightedDistinct(s: SimState, pool: UpgradeDef[], count: number): UpgradeDef[] {
  const w = bandWeights(s.wave);
  const avail = pool.slice();
  const out: UpgradeDef[] = [];
  while (out.length < count && avail.length > 0) {
    const perRarity: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    for (const u of avail) perRarity[u.rarity]++;
    const weights = avail.map((u) => w[u.rarity] / perRarity[u.rarity]);
    const idx = s.rngM.weighted(weights);
    out.push(avail[idx]);
    avail.splice(idx, 1);
  }
  return out;
}

/** Rolls the upgrade choices for the current upgrade screen. `avoid` ids are only used if the pool is too small. */
export function drawOffers(s: SimState, avoid?: readonly string[]): UpgradeDef[] {
  const all = eligibleUpgrades(s);
  const fresh = avoid ? all.filter((u) => !avoid.includes(u.id)) : all;
  const out = weightedDistinct(s, fresh, U.choices);
  if (out.length < U.choices && avoid) {
    const rest = all.filter((u) => !out.includes(u));
    out.push(...weightedDistinct(s, rest, U.choices - out.length));
  }
  for (const fb of FALLBACK_UPGRADES) {
    if (out.length >= U.choices) break;
    if (!out.some((o) => o.id === fb.id)) out.push(fb);
  }
  return out;
}

/** Grants an upgrade (from a pick, an event or a reward): bookkeeping, instants, modifiers. */
export function takeUpgrade(s: SimState, up: UpgradeDef): void {
  s.taken.set(up.id, (s.taken.get(up.id) ?? 0) + 1);
  s.stats.upgradesTaken.push(up.id);
  if (up.rarity === 'legendary') s.stats.legendariesPicked++;
  s.emit({ type: 'upgradePicked', id: up.id, rarity: up.rarity });
  // modifiers first (e.g. a higher castle max HP), then the one-shot effects on top of them
  refresh(s);
  for (const e of up.effects) if (e.kind === 'instant') applyInstant(s, e);
}

/** A random eligible upgrade of at least `min` rarity, or null when none exists. */
export function randomUpgradeAtLeast(s: SimState, min: Rarity): UpgradeDef | null {
  const pool = eligibleUpgrades(s).filter((u) => RARITY_RANK[u.rarity] >= RARITY_RANK[min]);
  if (pool.length === 0) return null;
  return weightedDistinct(s, pool, 1)[0];
}

export function applyInstant(s: SimState, e: InstantEffect): void {
  switch (e.action) {
    case 'healCastle': {
      const amount = Math.min(s.castleMaxHp - s.castleHp, s.castleMaxHp * e.value);
      if (amount > 0) {
        s.castleHp += amount;
        s.emit({ type: 'castleHealed', amount, hp: s.castleHp });
      }
      break;
    }
    case 'grantCoins':
      s.addCoins(e.value);
      break;
    case 'grantTower': {
      const level = Math.max(1, Math.round(e.value));
      let type = e.tower && e.tower.length > 0 ? e.tower[s.rngM.int(e.tower.length)] : rollTowerType(s);
      if (!type) type = TOWER_IDS[0];
      if (findFreeSlot(s) < 0 || !grantTower(s, type, level)) {
        s.addCoins(level * BALANCE.economy.grantFallbackCoinsPerLevel);
      }
      break;
    }
    case 'unlockSlot':
      if (!unlockNextSlot(s)) s.addCoins(BALANCE.economy.slotUnlockBase);
      break;
    case 'resetCooldowns':
      for (const a of s.abilities) a.cooldown = 0;
      break;
  }
}

export const RARITY_ORDER = RARITIES;
