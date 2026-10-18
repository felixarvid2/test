import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { planRoom } from '../src/core/rooms';
import {
  metaPreset, simulateProgression, simulateRoom, simulateRun, totalShopCost,
} from '../src/core/sim';
import type { Skill, Strategy } from '../src/core/sim';
import { createRun } from '../src/core/run';
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
