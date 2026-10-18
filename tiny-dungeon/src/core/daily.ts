// Daily challenge: everything derives from the UTC date, so every player gets the same hero, modifier,
// starting upgrade and dungeon seed.
import { HERO_IDS } from '../data/heroes';
import type { SaveData } from '../save/schema';
import { Rng, dailySeed, todayKey } from './rng';
import type { HeroId, StatEffect } from './types';

const MODIFIERS: { name: string; effects: StatEffect[] }[] = [
  { name: 'Glass Day: +40% damage, -30% max HP', effects: [{ stat: 'damageMult', pct: 0.4 }, { stat: 'maxHp', pct: -0.3 }] },
  { name: 'Iron Day: +30% max HP, -15% damage', effects: [{ stat: 'maxHp', pct: 0.3 }, { stat: 'damageMult', pct: -0.15 }] },
  { name: 'Swift Day: +25% speed, -10% max HP', effects: [{ stat: 'moveSpeed', pct: 0.25 }, { stat: 'attackSpeedMult', pct: 0.1 }, { stat: 'maxHp', pct: -0.1 }] },
  { name: 'Greedy Day: +50% gold, -10% damage', effects: [{ stat: 'goldMult', pct: 0.5 }, { stat: 'damageMult', pct: -0.1 }] },
  { name: 'Sharp Day: +15% crit, +30% crit damage', effects: [{ stat: 'critChance', add: 0.15 }, { stat: 'critDamage', add: 0.3 }] },
  { name: 'Heavy Day: +2 armor, -15% move speed', effects: [{ stat: 'armor', add: 2 }, { stat: 'moveSpeed', pct: -0.15 }] },
];

/** Starting upgrades that work with any hero (no weapon requirement). */
const START_UPGRADES = [
  'sharp_blade', 'quick_hands', 'lucky_strike', 'fire_weapon', 'venom', 'chain_lightning',
  'vampire_fang', 'blade_orbit', 'thick_armor', 'double_strike',
];

export interface DailyChallenge {
  key: string;
  seed: number;
  hero: HeroId;
  modifierName: string;
  modifier: StatEffect[];
  startUpgrade: string;
}

export function dailyChallenge(key: string = todayKey()): DailyChallenge {
  const seed = dailySeed(key);
  const rng = new Rng(seed).fork('daily-setup');
  const mod = rng.pick(MODIFIERS);
  return {
    key,
    seed,
    hero: rng.pick(HERO_IDS),
    modifierName: mod.name,
    modifier: mod.effects.map((e) => ({ ...e })),
    startUpgrade: rng.pick(START_UPGRADES),
  };
}

/** Records an attempt. `roomsCleared` is converted to "room reached" (cleared + 1), like all best-room stats. */
export function recordDaily(save: SaveData, key: string, roomsCleared: number, kills: number): void {
  let d = save.daily[key];
  if (!d) {
    d = { bestRoom: 0, kills: 0, attempts: 0 };
    save.daily[key] = d;
    save.stats.dailyCompleted += 1; // first finished attempt of a new day
  }
  d.attempts += 1;
  d.bestRoom = Math.max(d.bestRoom, roomsCleared + 1);
  d.kills = Math.max(d.kills, kills);
  const keys = Object.keys(save.daily).sort();
  while (keys.length > 30) delete save.daily[keys.shift() as string];
}
