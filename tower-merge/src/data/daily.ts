import type { DailyModifier } from './types';

/**
 * Daily challenge modifiers. A towerPool always has at least 3 types including one that can hit
 * air (arrow, frost, lightning, sniper or magic).
 */
export const DAILY_MODIFIERS: DailyModifier[] = [
  {
    id: 'elementalDay', name: 'Elemental Day', description: 'Only Fire, Frost, Lightning and Arrow towers are available.',
    towerPool: ['fire', 'frost', 'lightning', 'arrow'],
  },
  {
    id: 'swarm', name: 'Swarm', description: 'Waves have 40% more enemies, but each has 20% less HP.',
    waveModifier: { enemyCountMult: 1.4, enemyHpMult: 0.8 },
  },
  {
    id: 'richKingdom', name: 'Rich Kingdom', description: 'Start the run with 250 extra coins.',
    startCoins: 250,
  },
  {
    id: 'glassFortress', name: 'Glass Fortress', description: 'Castle max HP -40%, but towers deal +30% damage.',
    effects: [{ kind: 'global', stat: 'castleMaxHp', op: 'pct', value: -0.4 }, { kind: 'stat', stat: 'damage', op: 'pct', value: 0.3 }],
  },
  {
    id: 'speedDemons', name: 'Speed Demons', description: 'Enemies move 30% faster and drop 25% more coins.',
    waveModifier: { enemySpeedMult: 1.3, coinMult: 1.25 },
  },
  {
    id: 'snipersParadise', name: "Sniper's Paradise", description: 'Only Sniper, Arrow, Frost and Magic towers; snipers gain +15% crit chance and +30% damage.',
    towerPool: ['sniper', 'arrow', 'frost', 'magic'],
    effects: [
      { kind: 'stat', stat: 'critChance', op: 'flat', value: 0.15, tower: ['sniper'] },
      { kind: 'stat', stat: 'damage', op: 'pct', value: 0.3, tower: ['sniper'] },
    ],
  },
  {
    id: 'juggernauts', name: 'Juggernauts', description: 'Enemies have 50% more HP but 30% fewer arrive; coins +20%.',
    waveModifier: { enemyHpMult: 1.5, enemyCountMult: 0.7, coinMult: 1.2 },
  },
  {
    id: 'poisonParty', name: 'Poison Party', description: 'Only Poison, Fire, Arrow and Magic towers; towers deal +25% damage to poisoned enemies.',
    towerPool: ['poison', 'fire', 'arrow', 'magic'],
    effects: [{ kind: 'flag', flag: 'poisonedBonusDamage', value: 0.25 }],
  },
  {
    id: 'demolitionDerby', name: 'Demolition Derby', description: 'Only Cannon, Fire, Arrow and Magic towers; +25% splash radius for all towers.',
    towerPool: ['cannon', 'fire', 'arrow', 'magic'],
    effects: [{ kind: 'stat', stat: 'splashRadius', op: 'pct', value: 0.25 }],
  },
  {
    id: 'bargainBin', name: 'Bargain Bin', description: 'Towers cost 30% less, enemies have 10% more HP.',
    effects: [{ kind: 'global', stat: 'towerCost', op: 'pct', value: -0.3 }],
    waveModifier: { enemyHpMult: 1.1 },
  },
  {
    id: 'championsParade', name: "Champions' Parade", description: '25% of enemies are elite and coins are +50%.',
    waveModifier: { eliteChance: 0.25, coinMult: 1.5 },
  },
  {
    id: 'stormSeason', name: 'Storm Season', description: 'Only Lightning, Magic, Frost and Arrow towers; lightning chains +1 and every hit has a 10% chance of a chain lightning.',
    towerPool: ['lightning', 'magic', 'frost', 'arrow'],
    effects: [
      { kind: 'stat', stat: 'chainCount', op: 'flat', value: 1, tower: ['lightning'] },
      { kind: 'flag', flag: 'chainLightningChance', value: 0.1 },
    ],
  },
  {
    id: 'frenzyFriday', name: 'Frenzy Friday', description: 'Towers attack 25% faster, enemies move 15% faster.',
    effects: [{ kind: 'stat', stat: 'fireRate', op: 'pct', value: 0.25 }],
    waveModifier: { enemySpeedMult: 1.15 },
  },
  {
    id: 'fragileFoes', name: 'Fragile Foes', description: 'Enemies have 30% less HP, but kills give 20% fewer coins.',
    waveModifier: { enemyHpMult: 0.7, coinMult: 0.8 },
  },
];

/**
 * Modifiers that must not be combined: the pair would double up on the same scarce knob.
 * Two modifiers conflict when they share a group, both define a towerPool, both define startCoins
 * or both alter the same enemy HP / speed / count multiplier.
 */
export const DAILY_CONFLICT_GROUPS: string[][] = [
  ['richKingdom', 'bargainBin'],
  ['glassFortress', 'frenzyFriday'],
  ['swarm', 'juggernauts', 'fragileFoes'],
];
