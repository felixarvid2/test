import type { BossDef, BossId } from './types';

/**
 * Bosses appear every 5th wave in the order Goblin King (5), Stone Golem (10), Dragon (15) and
 * then loop with scaling (BALANCE.boss). Ability intervals are in seconds and are multiplied by the
 * current phase's intervalMult. hp/coins/gems are for the first appearance.
 */
export const BOSSES: Record<BossId, BossDef> = {
  goblinKing: {
    id: 'goblinKing', name: 'Goblin King', title: 'Lord of the Raiders', wave: 5,
    hp: 1800, speed: 83, armor: 0.1, coins: 90, gems: 8, castleDamage: 25, flying: false, radius: 34,
    phases: [
      {
        hpBelow: 1, speedMult: 1, intervalMult: 1,
        announce: 'The Goblin King rallies his horde!',
        abilities: [
          { kind: 'summon', enemy: 'goblin', count: 3, interval: 8 },
          { kind: 'haste', radius: 170, speedMult: 1.5, duration: 3, interval: 11 },
        ],
      },
      {
        hpBelow: 0.6, speedMult: 1.1, intervalMult: 0.85,
        announce: 'The King charges!',
        abilities: [
          { kind: 'summon', enemy: 'goblin', count: 3, interval: 8 },
          { kind: 'haste', radius: 170, speedMult: 1.5, duration: 3, interval: 11 },
          { kind: 'charge', speedMult: 3.2, duration: 1.4, telegraph: 1.2, interval: 10 },
        ],
      },
      {
        hpBelow: 0.3, speedMult: 1.25, intervalMult: 0.65,
        announce: 'The Goblin King is enraged!',
        abilities: [
          { kind: 'summon', enemy: 'goblin', count: 4, interval: 8 },
          { kind: 'haste', radius: 200, speedMult: 1.6, duration: 3.5, interval: 10 },
          { kind: 'charge', speedMult: 3.4, duration: 1.6, telegraph: 1.0, interval: 9 },
        ],
      },
    ],
  },
  stoneGolem: {
    id: 'stoneGolem', name: 'Stone Golem', title: 'The Living Mountain', wave: 10,
    hp: 6500, speed: 64, armor: 0.45, coins: 160, gems: 15, castleDamage: 35, flying: false, radius: 44,
    phases: [
      {
        hpBelow: 1, speedMult: 1, intervalMult: 1,
        announce: 'The Stone Golem awakens!',
        abilities: [
          { kind: 'shieldAllies', radius: 180, shieldHp: 60, interval: 8 },
          { kind: 'spawnOnDamage', enemy: 'stoneling', everyFraction: 0.1, count: 2 },
        ],
      },
      {
        hpBelow: 0.5, speedMult: 1.1, intervalMult: 0.8,
        announce: 'The Golem hardens its skin!',
        abilities: [
          { kind: 'shieldAllies', radius: 200, shieldHp: 90, interval: 8 },
          { kind: 'spawnOnDamage', enemy: 'stoneling', everyFraction: 0.1, count: 2 },
          { kind: 'armorUp', armor: 0.2, duration: 5, interval: 12 },
        ],
      },
      {
        hpBelow: 0.25, speedMult: 1.35, intervalMult: 0.65,
        announce: 'The Golem crumbles in fury!',
        abilities: [
          { kind: 'shieldAllies', radius: 220, shieldHp: 120, interval: 7 },
          { kind: 'spawnOnDamage', enemy: 'stoneling', everyFraction: 0.1, count: 3 },
          { kind: 'armorUp', armor: 0.25, duration: 5, interval: 10 },
        ],
      },
    ],
  },
  dragon: {
    id: 'dragon', name: 'Ancient Dragon', title: 'Scourge of the Skies', wave: 15,
    hp: 13500, speed: 55, armor: 0.15, coins: 260, gems: 25, castleDamage: 40, flying: true, radius: 50,
    phases: [
      {
        hpBelow: 1, speedMult: 1, intervalMult: 1,
        announce: 'The Dragon descends!',
        abilities: [
          { kind: 'summon', enemy: 'imp', count: 3, interval: 10 },
          { kind: 'fireBreath', length: 420, width: 80, telegraph: 1.8, interval: 12, castleDamage: 12 },
        ],
      },
      {
        hpBelow: 0.65, speedMult: 1.1, intervalMult: 0.85,
        announce: 'The Dragon seals your towers!',
        abilities: [
          { kind: 'summon', enemy: 'imp', count: 4, interval: 10 },
          { kind: 'fireBreath', length: 440, width: 90, telegraph: 1.7, interval: 12, castleDamage: 14 },
          { kind: 'disableTower', telegraph: 1.4, duration: 4, interval: 14 },
        ],
      },
      {
        hpBelow: 0.3, speedMult: 1.3, intervalMult: 0.65,
        announce: 'The Dragon burns with rage!',
        abilities: [
          { kind: 'summon', enemy: 'imp', count: 5, interval: 9 },
          { kind: 'fireBreath', length: 480, width: 100, telegraph: 1.5, interval: 11, castleDamage: 18 },
          { kind: 'disableTower', telegraph: 1.2, duration: 5, interval: 12 },
        ],
      },
    ],
  },
};
