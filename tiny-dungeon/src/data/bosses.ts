import type { BossDef } from '../core/types';

// HP / damage are at difficulty 1.0; the room plan multiplies them (see core/rooms.ts). Attack numbers
// (damage multiples, windups, summons) live in BALANCE.bossAttacks.
export const BOSSES: BossDef[] = [
  {
    id: 'giant_slime', name: 'Giant Slime', title: 'It wobbles. It jumps. It splits.',
    frame: 'extra:giant_slime', scale: 3, hp: 340, damage: 8, speed: 48, radius: 44, room: 5,
    phases: [
      { hpBelow: 1, attacks: ['slimeJump', 'slimeBurst'], speedMult: 1, attackDelay: 2.4 },
      { hpBelow: 0.5, attacks: ['slimeJump', 'slimeBurst', 'slimeSplit'], speedMult: 1.25, attackDelay: 1.9 },
    ],
    gold: 25, xp: 60,
  },
  {
    id: 'skeleton_king', name: 'Skeleton King', title: 'Long live the dead.',
    frame: 'extra:skeleton_king', scale: 2.4, hp: 540, damage: 10, speed: 52, radius: 34, room: 10,
    phases: [
      { hpBelow: 1, attacks: ['kingSweep', 'kingSummon'], speedMult: 1, attackDelay: 2.3 },
      { hpBelow: 0.5, attacks: ['kingSweep', 'kingSummon', 'kingCharge'], speedMult: 1.3, attackDelay: 1.8 },
    ],
    gold: 60, xp: 140,
  },
  {
    id: 'dragon', name: 'Dungeon Dragon', title: 'The last room is on fire.',
    frame: 'extra:dragon', scale: 3.2, hp: 620, damage: 14, speed: 44, radius: 52, room: 15,
    phases: [
      { hpBelow: 1, attacks: ['dragonBreath', 'dragonTailSwipe'], speedMult: 1, attackDelay: 2.6 },
      { hpBelow: 0.66, attacks: ['dragonBreath', 'dragonTailSwipe', 'dragonMeteors'], speedMult: 1.15, attackDelay: 2.2 },
      { hpBelow: 0.33, attacks: ['dragonBreath', 'dragonTailSwipe', 'dragonMeteors', 'dragonRing'], speedMult: 1.3, attackDelay: 1.8 },
    ],
    gold: 120, xp: 300,
  },
  {
    id: 'spider_queen', name: 'Spider Queen', title: 'Mind the webs.',
    frame: 'extra:spider_queen', scale: 2.6, hp: 760, damage: 12, speed: 60, radius: 46, room: 20,
    phases: [
      { hpBelow: 1, attacks: ['spiderWeb', 'spiderPounce', 'spiderEggs'], speedMult: 1, attackDelay: 2.3 },
      { hpBelow: 0.5, attacks: ['spiderWeb', 'spiderPounce', 'spiderEggs', 'spiderVenom'], speedMult: 1.25, attackDelay: 1.8 },
    ],
    gold: 160, xp: 380,
  },
  {
    id: 'lich', name: 'The Lich', title: 'Death was only the beginning.',
    frame: 'extra:lich', scale: 2.8, hp: 880, damage: 10.5, speed: 40, radius: 36, room: 25,
    phases: [
      { hpBelow: 1, attacks: ['lichSpiral', 'lichBlink', 'lichRaise'], speedMult: 1, attackDelay: 2.4 },
      { hpBelow: 0.66, attacks: ['lichSpiral', 'lichBlink', 'lichRaise', 'lichNova'], speedMult: 1.1, attackDelay: 2.1 },
      { hpBelow: 0.33, attacks: ['lichSpiral', 'lichBlink', 'lichNova'], speedMult: 1.25, attackDelay: 1.7 },
    ],
    gold: 200, xp: 460,
  },
  {
    id: 'mimic_king', name: 'Mimic King', title: 'Not every chest is your friend.',
    frame: 'extra:mimic_king', scale: 3, hp: 720, damage: 9, speed: 58, radius: 46, room: 30,
    phases: [
      { hpBelow: 1, attacks: ['mimicChomp', 'mimicCoins', 'mimicTongue'], speedMult: 1, attackDelay: 2.2 },
      { hpBelow: 0.5, attacks: ['mimicChomp', 'mimicCoins', 'mimicTongue', 'mimicDecoys'], speedMult: 1.3, attackDelay: 1.7 },
    ],
    gold: 260, xp: 560,
  },
];

export const BOSS_BY_ID: Record<string, BossDef> = Object.fromEntries(BOSSES.map((b) => [b.id, b]));
