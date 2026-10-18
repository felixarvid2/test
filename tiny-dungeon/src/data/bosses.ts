import type { BossDef } from '../core/types';

// HP / damage are at difficulty 1.0; the room plan multiplies them (see core/rooms.ts). Attack numbers
// (damage multiples, windups, summons) live in BALANCE.bossAttacks.
export const BOSSES: BossDef[] = [
  {
    id: 'giant_slime', name: 'Giant Slime', title: 'It wobbles. It jumps. It splits.',
    frame: 'extra:giant_slime', scale: 3, hp: 420, damage: 8, speed: 48, radius: 44, room: 5,
    phases: [
      { hpBelow: 1, attacks: ['slimeJump', 'slimeBurst'], speedMult: 1, attackDelay: 2.4 },
      { hpBelow: 0.5, attacks: ['slimeJump', 'slimeBurst', 'slimeSplit'], speedMult: 1.25, attackDelay: 1.9 },
    ],
    gold: 40, xp: 60,
  },
  {
    id: 'skeleton_king', name: 'Skeleton King', title: 'Long live the dead.',
    frame: 'extra:skeleton_king', scale: 2.4, hp: 650, damage: 10, speed: 52, radius: 34, room: 10,
    phases: [
      { hpBelow: 1, attacks: ['kingSweep', 'kingSummon'], speedMult: 1, attackDelay: 2.3 },
      { hpBelow: 0.5, attacks: ['kingSweep', 'kingSummon', 'kingCharge'], speedMult: 1.3, attackDelay: 1.8 },
    ],
    gold: 90, xp: 140,
  },
  {
    id: 'dragon', name: 'Dungeon Dragon', title: 'The last room is on fire.',
    frame: 'extra:dragon', scale: 3.2, hp: 800, damage: 15, speed: 44, radius: 52, room: 15,
    phases: [
      { hpBelow: 1, attacks: ['dragonBreath', 'dragonTailSwipe'], speedMult: 1, attackDelay: 2.6 },
      { hpBelow: 0.66, attacks: ['dragonBreath', 'dragonTailSwipe', 'dragonMeteors'], speedMult: 1.15, attackDelay: 2.2 },
      { hpBelow: 0.33, attacks: ['dragonBreath', 'dragonTailSwipe', 'dragonMeteors', 'dragonRing'], speedMult: 1.3, attackDelay: 1.8 },
    ],
    gold: 180, xp: 300,
  },
];

export const BOSS_BY_ID: Record<string, BossDef> = Object.fromEntries(BOSSES.map((b) => [b.id, b]));
