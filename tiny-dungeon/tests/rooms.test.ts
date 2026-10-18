import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { enemyGold, enemyHitDamage, enemyHp, enemyXp } from '../src/core/combat';
import { Rng } from '../src/core/rng';
import {
  bossForRoom, doorOptions, eliteChance, planRoom, roomScaling, spawnBudget, treasureReward,
} from '../src/core/rooms';
import type { RoomType } from '../src/core/types';
import { BOSSES } from '../src/data/bosses';
import { ENEMIES, ENEMY_BY_ID } from '../src/data/enemies';
import { EXTRA_FRAMES, TILE_FRAMES } from '../src/game/assets';

const ALL_UNLOCKS = ['variant_ghost', 'variant_spider', 'variant_fire_slime', 'variant_ogre'];

describe('enemy and boss data', () => {
  it('uses real frames', () => {
    const frameOk = (f: string): boolean => {
      const [kind, name] = f.split(':');
      return kind === 'tile' ? name in TILE_FRAMES : kind === 'extra' ? (EXTRA_FRAMES as readonly string[]).includes(name) : false;
    };
    for (const e of ENEMIES) expect(frameOk(e.frame), `${e.id} ${e.frame}`).toBe(true);
    for (const b of BOSSES) expect(frameOk(b.frame), `${b.id} ${b.frame}`).toBe(true);
  });

  it('has the required roster, gates and summon references', () => {
    const req: Record<string, number> = { slime: 1, bat: 1, skeleton: 2, skeleton_archer: 3, goblin_armored: 4, necromancer: 6 };
    for (const [id, room] of Object.entries(req)) expect(ENEMY_BY_ID[id].minRoom).toBe(room);
    expect(ENEMY_BY_ID.necromancer.summon && ENEMY_BY_ID[ENEMY_BY_ID.necromancer.summon]).toBeDefined();
    for (const [id, u] of [['ghost', 'variant_ghost'], ['spider', 'variant_spider'], ['fire_slime', 'variant_fire_slime'], ['ogre', 'variant_ogre']]) {
      expect(ENEMY_BY_ID[id].unlock).toBe(u);
    }
    expect(BOSSES.map((b) => [b.id, b.room])).toEqual([['giant_slime', 5], ['skeleton_king', 10], ['dragon', 15]]);
    for (const b of BOSSES) {
      expect(b.phases[0].hpBelow).toBe(1);
      for (let i = 1; i < b.phases.length; i++) expect(b.phases[i].hpBelow).toBeLessThan(b.phases[i - 1].hpBelow);
      for (const p of b.phases) for (const a of p.attacks) expect(BALANCE.bossAttacks[a]).toBeDefined();
    }
    for (const t of Object.values(BALANCE.bossAttacks)) {
      if (t.summon) expect(ENEMY_BY_ID[t.summon.enemy]).toBeDefined();
    }
  });
});

describe('roomScaling', () => {
  it('is smooth and monotonic with no spikes', () => {
    let prev = roomScaling(1);
    expect(prev).toEqual({ hp: 1, dmg: 1, gold: 1 });
    for (let i = 2; i <= 80; i++) {
      const cur = roomScaling(i);
      for (const k of ['hp', 'dmg', 'gold'] as const) {
        expect(cur[k]).toBeGreaterThan(prev[k]);
        expect(cur[k] / prev[k]).toBeLessThan(1.25);
      }
      prev = cur;
    }
  });
});

describe('planRoom', () => {
  it('is deterministic for a seed and varies between seeds', () => {
    const a = planRoom(8, new Rng(11), { unlocks: ALL_UNLOCKS });
    const b = planRoom(8, new Rng(11), { unlocks: ALL_UNLOCKS });
    const c = planRoom(8, new Rng(12), { unlocks: ALL_UNLOCKS });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('puts a boss in every 5th room and loops the three bosses every 15 rooms', () => {
    const order = ['giant_slime', 'skeleton_king', 'dragon'];
    for (let i = 1; i <= 60; i++) {
      const plan = planRoom(i, new Rng(i), { unlocks: [], type: 'combat' });
      if (i % 5 === 0) {
        expect(plan.type).toBe('boss');
        expect(plan.bossId).toBe(order[(i / 5 - 1) % 3]);
        expect(bossForRoom(i)?.id).toBe(plan.bossId);
        expect(plan.spawns).toEqual([]);
      } else {
        expect(plan.type).toBe('combat');
        expect(plan.bossId).toBeUndefined();
        expect(bossForRoom(i)).toBeNull();
        expect(plan.spawns.length).toBeGreaterThan(0);
      }
    }
  });

  it('later boss loops are stronger', () => {
    const hp = (i: number): number => planRoom(i, new Rng(1), { unlocks: [] }).hpMult;
    expect(hp(20)).toBeGreaterThan(hp(5) * 2);
    expect(hp(35)).toBeGreaterThan(hp(20));
  });

  it('spawn budget grows monotonically and plans never overspend it', () => {
    let prev = 0;
    for (let i = 1; i <= 80; i++) {
      const b = spawnBudget(i);
      expect(b).toBeGreaterThan(prev);
      prev = b;
    }
    for (let i = 1; i <= 40; i++) {
      if (i % 5 === 0) continue;
      const plan = planRoom(i, new Rng(100 + i), { unlocks: ALL_UNLOCKS });
      const cost = plan.spawns.reduce((a, s) => a + s.count * ENEMY_BY_ID[s.enemy].cost * (s.elite ? BALANCE.difficulty.eliteCostMult : 1), 0);
      expect(cost).toBeLessThanOrEqual(spawnBudget(i) + 1e-6);
      expect(cost).toBeGreaterThan(spawnBudget(i) * 0.5);
    }
  });

  it('never spawns an enemy before its minRoom or before its unlock', () => {
    for (let i = 1; i <= 30; i++) {
      for (let seed = 0; seed < 8; seed++) {
        const plan = planRoom(i, new Rng(seed * 31 + i), { unlocks: [] });
        for (const s of plan.spawns) {
          const def = ENEMY_BY_ID[s.enemy];
          expect(def.minRoom).toBeLessThanOrEqual(i);
          expect(def.unlock).toBeUndefined();
        }
        const withAll = planRoom(i, new Rng(seed * 31 + i), { unlocks: ALL_UNLOCKS });
        for (const s of withAll.spawns) expect(ENEMY_BY_ID[s.enemy].minRoom).toBeLessThanOrEqual(i);
      }
    }
  });

  it('spawns waves over roughly 15 seconds, sorted, with sane counts', () => {
    for (let i = 1; i <= 40; i++) {
      if (i % 5 === 0) continue;
      const plan = planRoom(i, new Rng(i * 5), { unlocks: ALL_UNLOCKS });
      let last = -1;
      let total = 0;
      for (const s of plan.spawns) {
        expect(s.at).toBeGreaterThanOrEqual(0.5);
        expect(s.at).toBeLessThanOrEqual(BALANCE.rooms.spawnDuration + 1);
        expect(s.at).toBeGreaterThanOrEqual(last);
        last = s.at;
        expect(s.count).toBeGreaterThanOrEqual(1);
        if (!s.elite) total += s.count;
      }
      expect(total).toBeLessThanOrEqual(BALANCE.rooms.enemyCountHardCap);
      expect(BALANCE.rooms.enemyCountHardCap).toBeLessThan(BALANCE.limits.maxEnemiesAlive);
    }
  });

  it('room 1 only has the opening enemies; necromancers wait for room 6', () => {
    const ids = new Set<string>();
    for (let seed = 0; seed < 30; seed++) for (const s of planRoom(1, new Rng(seed), { unlocks: [] }).spawns) ids.add(s.enemy);
    expect([...ids].sort()).toEqual(['bat', 'slime']);
    const late = new Set<string>();
    for (let seed = 0; seed < 60; seed++) for (const s of planRoom(14, new Rng(seed), { unlocks: [] }).spawns) late.add(s.enemy);
    expect(late.has('necromancer')).toBe(true);
    expect(late.has('goblin_armored')).toBe(true);
  });

  it('elite rooms have fewer, elite enemies and better gold; treasure and shrine rooms are empty', () => {
    const normal = planRoom(8, new Rng(3), { unlocks: [] });
    const elite = planRoom(8, new Rng(3), { unlocks: [], type: 'elite' });
    expect(elite.type).toBe('elite');
    expect(elite.spawns.every((s) => s.elite)).toBe(true);
    const n = (p: typeof normal): number => p.spawns.reduce((a, s) => a + s.count, 0);
    expect(n(elite)).toBeLessThan(n(normal));
    expect(elite.goldMult).toBeGreaterThan(normal.goldMult);
    for (const type of ['treasure', 'shrine'] as RoomType[]) {
      const p = planRoom(8, new Rng(3), { unlocks: [], type });
      expect(p.type).toBe(type);
      expect(p.spawns).toEqual([]);
    }
    // a boss room cannot be turned into something else
    expect(planRoom(10, new Rng(3), { unlocks: [], type: 'treasure' }).type).toBe('boss');
  });

  it('applies an extra HP multiplier (curse)', () => {
    const base = planRoom(8, new Rng(3), { unlocks: [] });
    const cursed = planRoom(8, new Rng(3), { unlocks: [], hpMult: 1.2 });
    expect(cursed.hpMult).toBeCloseTo(base.hpMult * 1.2, 9);
    expect(cursed.spawns).toEqual(base.spawns);
  });

  it('enemy stat helpers scale with the plan', () => {
    const plan = planRoom(10, new Rng(1), { unlocks: [] });
    const e = ENEMY_BY_ID.skeleton;
    expect(enemyHp(e, plan)).toBe(Math.round(e.hp * plan.hpMult));
    expect(enemyHp(e, plan, true)).toBeGreaterThan(enemyHp(e, plan) * 2);
    expect(enemyHitDamage(e, plan)).toBe(Math.round(e.damage * plan.dmgMult));
    expect(enemyHitDamage(e, { dmgMult: 0.01 })).toBe(1);
    expect(enemyXp(e, 20)).toBeGreaterThan(enemyXp(e, 1));
    expect(enemyGold(e, plan, true)).toBeGreaterThan(enemyGold(e, plan));
    expect(eliteChance(1)).toBeLessThan(eliteChance(30));
    expect(eliteChance(500)).toBe(BALANCE.difficulty.eliteMax);
  });
});

describe('doorOptions', () => {
  it('offers the boss door before every boss room', () => {
    for (const i of [4, 9, 14, 19]) expect(doorOptions(i, new Rng(i))).toEqual(['boss']);
  });

  it('offers only combat in the first rooms and 1-2 doors afterwards', () => {
    expect(doorOptions(1, new Rng(1))).toEqual(['combat']);
    const sizes = new Set<number>();
    for (let s = 0; s < 200; s++) {
      const d = doorOptions(7, new Rng(s));
      sizes.add(d.length);
      expect(d.length).toBeGreaterThanOrEqual(1);
      expect(d.length).toBeLessThanOrEqual(2);
      expect(d).not.toContain('boss');
    }
    expect(sizes).toEqual(new Set([1, 2]));
  });

  it('never offers two treasure rooms in a row and mostly offers combat', () => {
    let treasure = 0;
    let total = 0;
    let combat = 0;
    for (let s = 0; s < 600; s++) {
      for (const d of doorOptions(7, new Rng(s), 'treasure')) expect(d).not.toBe('treasure');
      for (const d of doorOptions(7, new Rng(s), 'combat')) {
        total++;
        if (d === 'treasure') treasure++;
        if (d === 'combat') combat++;
      }
    }
    expect(treasure).toBeGreaterThan(0);
    expect(combat / total).toBeGreaterThan(0.5);
  });

  it('treasure rewards scale with the room', () => {
    expect(treasureReward(20).gold).toBeGreaterThan(treasureReward(3).gold);
    expect(treasureReward(5).minRarity).toBe('rare');
  });
});
