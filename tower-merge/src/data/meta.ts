import type { MetaUpgradeDef } from './types';

/**
 * Permanent upgrades bought with gems, exactly one per MetaStat. Fractions (damagePct, fireRatePct,
 * discountPct, coinGainPct, abilityCdPct) should be shown by the UI as percentages: the `{value}`
 * placeholder is the raw total (0.12 -> "12%").
 */
export const META_UPGRADES: MetaUpgradeDef[] = [
  {
    id: 'metaCastleHp', name: 'Thick Walls', description: '+{value} castle HP at the start of a run.', icon: 'castle',
    stat: 'castleHp', valuePerLevel: 15, maxLevel: 10, baseCost: 20, costGrowth: 1.3,
  },
  {
    id: 'metaStartCoins', name: 'Royal Stipend', description: 'Start every run with +{value} coins.', icon: 'coin',
    stat: 'startCoins', valuePerLevel: 15, maxLevel: 8, baseCost: 15, costGrowth: 1.3,
  },
  {
    id: 'metaDamage', name: 'Sharpened Steel', description: 'Towers deal +{value} damage.', icon: 'damage',
    stat: 'damagePct', valuePerLevel: 0.1, maxLevel: 10, baseCost: 30, costGrowth: 1.35,
  },
  {
    id: 'metaFireRate', name: 'Well-Oiled Gears', description: 'Towers attack +{value} faster.', icon: 'speed',
    stat: 'fireRatePct', valuePerLevel: 0.08, maxLevel: 10, baseCost: 30, costGrowth: 1.35,
  },
  {
    id: 'metaDiscount', name: 'Bulk Orders', description: 'Towers cost {value} less to buy.', icon: 'merchant',
    stat: 'discountPct', valuePerLevel: 0.03, maxLevel: 5, baseCost: 40, costGrowth: 1.45,
  },
  {
    id: 'metaStartLevel', name: 'Veteran Archer', description: 'Your starting Arrow tower begins at +{value} levels.', icon: 'arrow',
    stat: 'startLevel', valuePerLevel: 1, maxLevel: 2, baseCost: 300, costGrowth: 2.5,
  },
  {
    id: 'metaExtraSlot', name: 'Expanded Grounds', description: 'Start with +{value} unlocked tower slots.', icon: 'slot',
    stat: 'extraSlot', valuePerLevel: 1, maxLevel: 2, baseCost: 350, costGrowth: 2.5,
  },
  {
    id: 'metaCoinGain', name: 'Tax Collectors', description: '+{value} coins from kills.', icon: 'treasure',
    stat: 'coinGainPct', valuePerLevel: 0.05, maxLevel: 8, baseCost: 35, costGrowth: 1.35,
  },
  {
    id: 'metaAbilityCd', name: 'Quick Hands', description: 'Abilities recharge {value} faster.', icon: 'clock',
    stat: 'abilityCdPct', valuePerLevel: 0.05, maxLevel: 5, baseCost: 40, costGrowth: 1.4,
  },
  {
    id: 'metaRerolls', name: 'Second Thoughts', description: '+{value} free upgrade rerolls per run.', icon: 'vortex',
    stat: 'rerolls', valuePerLevel: 1, maxLevel: 3, baseCost: 60, costGrowth: 1.8,
  },
];
