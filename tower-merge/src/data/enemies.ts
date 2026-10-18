import type { EnemyDef, EnemyId } from './types';

/**
 * Regular enemies. hp/coins/castleDamage are the wave-1 values; the simulation scales hp and coins
 * with the wave (see BALANCE.waves / BALANCE.coins). `threat` is the budget cost in wave generation.
 * Types appear gradually: goblin w1, rat w2, skeleton w3, bat w4, orc w6, shaman w7, summoner w9, troll w11.
 */
export const ENEMIES: Record<EnemyId, EnemyDef> = {
  goblin: {
    id: 'goblin', name: 'Goblin', hp: 28, speed: 62, armor: 0, coins: 3, castleDamage: 4, flying: false, radius: 14,
    abilities: [], firstWave: 1, weight: 10, threat: 1,
    description: 'A scrappy raider. Weak alone, dangerous in packs.',
  },
  rat: {
    id: 'rat', name: 'Giant Rat', hp: 13, speed: 128, armor: 0, coins: 2, castleDamage: 3, flying: false, radius: 10,
    abilities: [], firstWave: 2, weight: 6, threat: 0.8,
    description: 'Very fast and fragile. Slow towers help a lot.',
  },
  skeleton: {
    id: 'skeleton', name: 'Skeleton Guard', hp: 52, speed: 58, armor: 0.1, coins: 6, castleDamage: 6, flying: false, radius: 15,
    abilities: [{ kind: 'frontShield', reduction: 0.6 }], firstWave: 3, weight: 6, threat: 2.3,
    description: 'Carries a shield: towers in front of it deal 60% less damage.',
  },
  bat: {
    id: 'bat', name: 'Cave Bat', hp: 22, speed: 98, armor: 0, coins: 4, castleDamage: 5, flying: true, radius: 12,
    abilities: [], firstWave: 4, weight: 6, threat: 1.4,
    description: 'Flies straight at the castle. Cannons cannot hit it.',
  },
  orc: {
    id: 'orc', name: 'Orc Brute', hp: 90, speed: 44, armor: 0.45, coins: 9, castleDamage: 9, flying: false, radius: 20,
    abilities: [], firstWave: 6, weight: 5, threat: 3.5,
    description: 'Slow and heavily armored: weak hits barely scratch it.',
  },
  shaman: {
    id: 'shaman', name: 'Goblin Shaman', hp: 48, speed: 52, armor: 0, coins: 8, castleDamage: 6, flying: false, radius: 15,
    abilities: [{ kind: 'heal', radius: 110, amount: 0.06, interval: 2 }], firstWave: 7, weight: 4, threat: 3,
    description: 'Heals nearby enemies for 6% of their max HP every 2 seconds. Kill it first.',
  },
  summoner: {
    id: 'summoner', name: 'Hex Summoner', hp: 85, speed: 46, armor: 0.05, coins: 12, castleDamage: 8, flying: false, radius: 18,
    abilities: [{ kind: 'summon', enemy: 'goblin', count: 2, interval: 6 }], firstWave: 9, weight: 3, threat: 5,
    description: 'Calls 2 goblins every 6 seconds while it lives.',
  },
  troll: {
    id: 'troll', name: 'Cave Troll', hp: 380, speed: 34, armor: 0.2, coins: 30, castleDamage: 20, flying: false, radius: 28,
    abilities: [], firstWave: 11, weight: 3, threat: 14,
    description: 'A walking wall of HP. Hits the castle very hard.',
  },
  stoneling: {
    id: 'stoneling', name: 'Stoneling', hp: 40, speed: 72, armor: 0.3, coins: 2, castleDamage: 4, flying: false, radius: 13,
    abilities: [], firstWave: 999, weight: 0, threat: 1.5,
    description: 'A chunk broken off the Stone Golem.',
  },
  imp: {
    id: 'imp', name: 'Fire Imp', hp: 26, speed: 130, armor: 0, coins: 2, castleDamage: 4, flying: true, radius: 11,
    abilities: [], firstWave: 999, weight: 0, threat: 1.2,
    description: 'A small flying fiend summoned by the Dragon.',
  },
};
