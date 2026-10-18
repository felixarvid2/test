/**
 * Controlled tower benchmark: one tower of every type and level shoots at stationary, practically
 * immortal dummies for 20 simulated seconds. Gives damage per second against a single target, an
 * armored target and a crowd, independent of what the bots happen to build.
 */
import { MAX_TOWER_LEVEL, TOWER_IDS } from '../../src/data/types';
import type { EnemyId, TowerId } from '../../src/data/types';
import { spawnEnemy } from '../../src/sim/enemies';
import type { SimState } from '../../src/sim/state';
import { defaultRunOptions } from '../../src/sim/bot';
import { createWorld } from '../../src/sim/World';
import { fmt, pct, table } from './stats';

export type Scenario = 'single' | 'armored' | 'crowd';
export const SCENARIOS: Scenario[] = ['single', 'armored', 'crowd'];
/** Weights when the three scenarios are folded into one number. */
export const SCENARIO_WEIGHT: Record<Scenario, number> = { single: 0.35, armored: 0.2, crowd: 0.45 };

const DURATION = 20;
const BENCH_PROGRESS = 480; // (360, 300): 110 px from slot 5

export function benchDps(type: TowerId, level: number, scenario: Scenario): number {
  const w = createWorld(defaultRunOptions(7, {
    startingSlots: 12,
    towerPool: [...TOWER_IDS],
  }), { upgrades: [], synergies: [], events: [] });
  w.sellTower(5);
  w.grantTower(type, level);
  const s = (w as unknown as { s: SimState }).s;
  w.startWaveNow();
  s.plan!.entries.length = 0;
  const kind: EnemyId = scenario === 'armored' ? 'orc' : 'goblin';
  const count = scenario === 'crowd' ? 8 : 1;
  for (let i = 0; i < count; i++) {
    const e = spawnEnemy(s, kind, { progress: BENCH_PROGRESS + (i - (count - 1) / 2) * 14, hpMult: 1e9 });
    if (e) e.baseSpeed = 0;
  }
  s.grid.rebuild();
  for (let i = 0; i < DURATION * 20; i++) {
    w.update(0.05);
    w.drainEvents();
  }
  return (w.slots[5].tower?.damageDealt ?? 0) / DURATION;
}

export interface BenchResult {
  /** dps[type][level-1][scenario] */
  dps: Record<string, number[][]>;
  /** weighted dps per type and level */
  mixed: Record<string, number[]>;
}

export function runBench(): BenchResult {
  const dps: Record<string, number[][]> = {};
  const mixed: Record<string, number[]> = {};
  for (const t of TOWER_IDS) {
    dps[t] = [];
    mixed[t] = [];
    for (let l = 1; l <= MAX_TOWER_LEVEL; l++) {
      const row = SCENARIOS.map((sc) => benchDps(t, l, sc));
      dps[t].push(row);
      mixed[t].push(row.reduce((a, v, i) => a + v * SCENARIO_WEIGHT[SCENARIOS[i]], 0));
    }
  }
  return { dps, mixed };
}

export function benchReport(b: BenchResult): string {
  const rows: (string | number)[][] = [];
  for (const t of TOWER_IDS) {
    for (let l = 1; l <= MAX_TOWER_LEVEL; l++) {
      const m = TOWER_IDS.reduce((a, o) => a + b.mixed[o][l - 1], 0) / TOWER_IDS.length;
      rows.push([
        l === 1 ? t : '', `L${l}`, ...b.dps[t][l - 1].map((v) => fmt(v, 0)), fmt(b.mixed[t][l - 1], 0),
        pct(b.mixed[t][l - 1] / m), l > 1 ? `x${fmt(b.mixed[t][l - 1] / b.mixed[t][l - 2], 2)}` : '',
        l > 1 ? `x${fmt(b.dps[t][l - 1][0] / b.dps[t][l - 2][0], 2)}` : '',
      ]);
    }
  }
  return `Tower benchmark: damage per second of ONE tower on dummies (single goblin / armored orc / crowd of 8)\n${
    table(['tower', 'lvl', 'single', 'armored', 'crowd', 'mixed', 'vs avg', 'mixed step', 'single step'], rows)}`;
}
