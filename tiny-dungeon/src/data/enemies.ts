import type { EnemyDef } from '../core/types';

// Stats are at difficulty 1.0 (room 1); core/rooms.ts scales HP / damage / rewards per room.
// `cost` is the spawn-budget price; `minRoom` the first room it may appear in.
export const ENEMIES: EnemyDef[] = [
  { id: 'slime', name: 'Slime', frame: 'tile:slime', behavior: 'chase',
    hp: 22, damage: 10, speed: 55, radius: 14, xp: 3, gold: 1, cost: 1, minRoom: 1 },
  { id: 'bat', name: 'Bat', frame: 'tile:bat', behavior: 'erratic',
    hp: 12, damage: 8, speed: 115, radius: 11, xp: 3, gold: 1, cost: 1, minRoom: 1 },
  { id: 'skeleton', name: 'Skeleton', frame: 'extra:skeleton', behavior: 'lunge',
    hp: 34, damage: 15, speed: 62, radius: 14, xp: 5, gold: 2, cost: 2, minRoom: 2,
    attackRange: 90, attackCooldown: 2.2, windup: 0.5 },
  { id: 'skeleton_archer', name: 'Skeleton Archer', frame: 'extra:skeleton_archer', behavior: 'ranged',
    hp: 24, damage: 12, speed: 50, radius: 13, xp: 6, gold: 2, cost: 3, minRoom: 3,
    attackRange: 300, attackCooldown: 2.4, windup: 0.6, projectileSpeed: 260 },
  { id: 'goblin_armored', name: 'Armored Goblin', frame: 'extra:goblin_armored', behavior: 'tank',
    hp: 90, damage: 18, speed: 42, radius: 16, armor: 3, knockbackResist: 0.7, xp: 12, gold: 5, cost: 6, minRoom: 4 },
  { id: 'necromancer', name: 'Necromancer', frame: 'tile:necromancer', behavior: 'summoner',
    hp: 70, damage: 10, speed: 42, radius: 14, xp: 20, gold: 8, cost: 10, minRoom: 6,
    attackRange: 340, attackCooldown: 6, windup: 1.1, summon: 'skeleton', summonCount: 2 },

  // Variants: only spawn once the matching achievement reward has been unlocked.
  { id: 'ghost', name: 'Ghost', frame: 'tile:ghost', behavior: 'erratic',
    hp: 28, damage: 10, speed: 72, radius: 13, xp: 6, gold: 2, cost: 3, minRoom: 4, unlock: 'variant_ghost' },
  { id: 'spider', name: 'Spider', frame: 'tile:spider', behavior: 'lunge',
    hp: 30, damage: 11, speed: 105, radius: 12, xp: 6, gold: 2, cost: 3, minRoom: 5, unlock: 'variant_spider',
    attackRange: 110, attackCooldown: 1.8, windup: 0.35 },
  { id: 'fire_slime', name: 'Fire Slime', frame: 'tile:slime', tint: 0xff7a2f, behavior: 'chase',
    hp: 46, damage: 11, speed: 62, radius: 15, xp: 6, gold: 3, cost: 3, minRoom: 4, unlock: 'variant_fire_slime' },
  { id: 'ogre', name: 'Ogre', frame: 'tile:ogre', behavior: 'tank', scale: 1.5,
    hp: 190, damage: 20, speed: 36, radius: 24, armor: 4, knockbackResist: 0.9, xp: 24, gold: 10, cost: 12, minRoom: 8,
    unlock: 'variant_ogre' },
];

export const ENEMY_BY_ID: Record<string, EnemyDef> = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));
