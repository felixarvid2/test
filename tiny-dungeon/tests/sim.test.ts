import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { planRoom } from '../src/core/rooms';
import {
  metaPreset, simulateProgression, simulateRoom, simulateRun, totalShopCost,
} from '../src/core/sim';
import type { Skill, Strategy } from '../src/core/sim';
import { createRun } from '../src/core/run';
import { BOSS_BY_ID } from '../src/data/bosses';
import { ENEMY_BY_ID } from '../src/data/enemies';
import type { HeroId } from '../src/core/types';

const HEROES: HeroId[] = ['knight', 'ranger', 'mage'];
const STRATEGIES: Strategy[] = ['random', 'greedy', 'synergy'];

function finiteDeep(o: unknown, path: string): void {
  if (typeof o === 'number') expect(Number.isFinite(o), path).toBe(true);
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) finiteDeep(v, `${path}.${k}`);
}

describe('simulation', () => {
  it('runs 200 runs quickly without NaN or Infinity and with finite stats', () => {
    const t0 = Date.now();
    const rooms: number[] = [];
    for (let i = 0; i < 200; i++) {
      const preset = (['none', 'mid', 'max'] as const)[i % 3];
      const { meta, unlocks } = metaPreset(preset);
      const res = simulateRun({
        hero: HEROES[i % 3], skill: (['novice', 'average', 'expert'] as Skill[])[(i >> 1) % 3], strategy: STRATEGIES[(i >> 2) % 3],
        meta, unlocks, seed: 1000 + i, maxRooms: 40,
      });
      finiteDeep(res, 'result');
      expect(res.roomReached).toBeGreaterThanOrEqual(1);
      expect(res.gold).toBeGreaterThanOrEqual(0);
      expect(res.durationSec).toBeGreaterThan(0);
      rooms.push(res.roomReached);
    }
    expect(Date.now() - t0).toBeLessThan(20000);
    expect(Math.max(...rooms)).toBeGreaterThan(Math.min(...rooms));
  });

  it('is deterministic for a seed', () => {
    const cfg = { hero: 'knight' as const, skill: 'average' as const, strategy: 'greedy' as const, meta: {}, unlocks: [], seed: 77 };
    expect(simulateRun(cfg)).toEqual(simulateRun(cfg));
    expect(simulateRun(cfg)).not.toEqual(simulateRun({ ...cfg, seed: 78 }));
  });

  it('keeps run state sane after every room', () => {
    for (const hero of HEROES) {
      const { meta, unlocks } = metaPreset('max');
      const run = createRun({ hero, seed: 3, mode: 'normal', meta, unlocks, runId: 's' });
      const rng = new Rng(5);
      for (let room = 1; room <= 12; room++) {
        const plan = planRoom(room, rng.fork(`r${room}`), { unlocks });
        const out = simulateRoom(run, plan, rng.fork('sim'), 'expert');
        finiteDeep(run.stats, 'stats');
        expect(Number.isFinite(run.hp) && Number.isFinite(run.gold) && Number.isFinite(run.xp)).toBe(true);
        expect(run.hp).toBeLessThanOrEqual(run.stats.maxHp);
        expect(out.time).toBeGreaterThan(0);
        if (!out.cleared) break;
      }
    }
  });

  it('a boss room is a single tough fight and is recorded as such', () => {
    const run = createRun({ hero: 'knight', seed: 1, mode: 'normal', meta: {}, unlocks: [], runId: 's' });
    const plan = planRoom(5, new Rng(1), { unlocks: [] });
    const out = simulateRoom(run, plan, new Rng(2), 'average');
    expect(out.bossLeft).toBeDefined();
    if (out.cleared) expect(run.bossesDefeated).toEqual(['giant_slime']);
    else expect(out.bossLeft).toBeGreaterThan(0);
  });

  it('fights the three new bosses in whole runs and a maxed expert can beat each', () => {
    const { meta, unlocks } = metaPreset('max');
    const fights: Record<string, { room: number; won: boolean }[]> = {};
    for (let i = 0; i < 60; i++) {
      const res = simulateRun({
        hero: HEROES[i % 3], skill: 'expert', strategy: STRATEGIES[(i >> 1) % 3], meta, unlocks, seed: 4000 + i, maxRooms: 40,
      });
      for (const f of res.bossFights) (fights[f.boss] ??= []).push({ room: f.room, won: f.won });
    }
    for (const [id, room] of [['spider_queen', 20], ['lich', 25], ['mimic_king', 30]] as const) {
      const list = fights[id] ?? [];
      expect(list.length, `${id} fought`).toBeGreaterThan(5);
      expect(list.every((f) => (f.room - 1) % 30 + 1 === room), id).toBe(true);
      expect(list.some((f) => f.won), `${id} won at least once`).toBe(true);
      expect(list.some((f) => !f.won), `${id} is a real fight`).toBe(true);
    }
  });

  it('eggs hatch into their summon unless broken in time', () => {
    // A boss that only lays eggs and cannot hurt the hero, so extra kills come only from what hatched.
    const queen = BOSS_BY_ID.spider_queen;
    const egg = ENEMY_BY_ID.spider_egg;
    const saved = { phases: queen.phases, hp: queen.hp, windup: egg.windup, eggHp: egg.hp };
    const fight = (windup: number): number => {
      egg.windup = windup;
      const { meta, unlocks } = metaPreset('max');
      const run = createRun({ hero: 'knight', seed: 3, mode: 'normal', meta, unlocks, runId: 's' });
      run.room = 20;
      const plan = { ...planRoom(20, new Rng(3), { unlocks }), hpMult: 1, dmgMult: 0.01 };
      return simulateRoom(run, plan, new Rng(4), 'expert').kills;
    };
    try {
      queen.phases = [{ hpBelow: 1, attacks: ['spiderEggs'], speedMult: 1, attackDelay: 1.2 }];
      queen.hp = saved.hp * 8;
      egg.hp = saved.eggHp * 60; // too tanky to break before the hatch timer runs out
      const never = fight(500);  // never hatches inside the fight
      const fast = fight(0.4);   // hatches almost at once: spiders to kill as well
      expect(fast).toBeGreaterThan(never);
    } finally {
      queen.phases = saved.phases;
      queen.hp = saved.hp;
      egg.windup = saved.windup;
      egg.hp = saved.eggHp;
    }
  });

  it('meta makes runs go further on average', () => {
    const mean = (preset: 'none' | 'max'): number => {
      const { meta, unlocks } = metaPreset(preset);
      let sum = 0;
      for (let i = 0; i < 60; i++) {
        sum += simulateRun({ hero: 'knight', skill: 'average', strategy: STRATEGIES[i % 3], meta, unlocks, seed: 500 + i, maxRooms: 40 }).roomReached;
      }
      return sum / 60;
    };
    expect(mean('max')).toBeGreaterThan(mean('none'));
  });

  it('progression shops until everything is bought', () => {
    const c = simulateProgression({ skill: 'average', seed: 4, maxRuns: 150 });
    expect(c.rooms.length).toBeGreaterThan(3);
    expect(c.goldToMax).toBe(totalShopCost());
    expect(c.runsToMax === null || c.runsToMax > 5).toBe(true);
  });
});
