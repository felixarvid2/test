import type { MetaUpgradeDef } from '../core/types';

// cost(level) = round(baseCost * costGrowth^level), level = levels already owned.
export const META_UPGRADES: MetaUpgradeDef[] = [
  { id: 'vitality', name: 'Vitality', desc: '+10 starting HP per level', icon: 'hp', maxLevel: 10,
    baseCost: 40, costGrowth: 1.35, effects: [{ stat: 'maxHp', add: 10 }] },
  { id: 'might', name: 'Might', desc: '+5% damage per level', icon: 'damage', maxLevel: 10,
    baseCost: 60, costGrowth: 1.36, effects: [{ stat: 'damageMult', pct: 0.05 }] },
  { id: 'swiftness', name: 'Swiftness', desc: '+3% move speed per level', icon: 'boots', maxLevel: 5,
    baseCost: 60, costGrowth: 1.6, effects: [{ stat: 'moveSpeed', pct: 0.03 }] },
  { id: 'precision', name: 'Precision', desc: '+2% crit chance per level', icon: 'crit', maxLevel: 5,
    baseCost: 80, costGrowth: 1.6, effects: [{ stat: 'critChance', add: 0.02 }] },
  { id: 'fortune', name: 'Fortune', desc: '+8% gold per level', icon: 'gold', maxLevel: 5,
    baseCost: 80, costGrowth: 1.6, effects: [{ stat: 'goldMult', pct: 0.08 }] },
  { id: 'wisdom', name: 'Wisdom', desc: '+8% XP per level', icon: 'xp', maxLevel: 5,
    baseCost: 80, costGrowth: 1.6, effects: [{ stat: 'xpMult', pct: 0.08 }] },
  { id: 'armory_bow', name: 'Armory: Bow', desc: 'Bow cards can appear in runs', icon: 'bow', maxLevel: 1,
    baseCost: 250, costGrowth: 1, effects: [], special: 'unlockBow' },
  { id: 'armory_staff', name: 'Armory: Staff', desc: 'Staff cards can appear in runs', icon: 'staff', maxLevel: 1,
    baseCost: 500, costGrowth: 1, effects: [], special: 'unlockStaff' },
  { id: 'insight', name: 'Insight', desc: 'Choose from 4 upgrades instead of 3', icon: 'star', maxLevel: 1,
    baseCost: 2500, costGrowth: 1, effects: [], special: 'extraChoice' },
  { id: 'second_wind', name: 'Second Wind', desc: '+1 free reroll per run', icon: 'reroll', maxLevel: 2,
    baseCost: 800, costGrowth: 2, effects: [], special: 'reroll' },
];

export const META_BY_ID: Record<string, MetaUpgradeDef> = Object.fromEntries(META_UPGRADES.map((m) => [m.id, m]));
