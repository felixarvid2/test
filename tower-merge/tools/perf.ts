/**
 * Headless performance benchmark of the simulation: 150 enemies and 12 level 5 towers firing with
 * a large set of flags (procs, statuses, spreads, chains), the projectile cap saturated. Prints
 * milliseconds per update(1/60) (avg / p95 / max), events per frame, an estimate of the garbage
 * produced per update and how fast a whole late-game bot run simulates.
 *
 *   npm run perf              (node --expose-gc, so heap deltas are measured around forced collections)
 *   npm run perf -- --frames 3600 --enemies 150
 */
import { performance } from 'node:perf_hooks';
import { BALANCE } from '../src/data/balance';
import { MAX_TOWER_LEVEL, TOWER_IDS } from '../src/data/types';
import type { Effect } from '../src/data/types';
import { spawnEnemy } from '../src/sim/enemies';
import type { SimState } from '../src/sim/state';
import { defaultRunOptions, runBot } from '../src/sim/bot';
import { createWorld } from '../src/sim/World';
import { buildOptions, FULL_POOL } from './balance/presets';
import { percentile } from './balance/stats';

const argv = process.argv.slice(2);
const arg = (k: string, d: number): number => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? Number(argv[i + 1]) : d;
};
const FRAMES = arg('frames', 1800);
const ENEMIES = arg('enemies', 150);
const gc = (globalThis as { gc?: () => void }).gc;

const flag = (f: string, value: number): Effect => ({ kind: 'flag', flag: f, value } as Effect);
/** Every flag that creates work: procs, statuses, spreads and chains. */
const HEAVY: Effect[] = [
  flag('extraProjectiles', 1), flag('multishot', 2), flag('pierce', 2), flag('splitOnImpact', 3), flag('clusterBombs', 3),
  flag('slowOnHit', 0.2), flag('freezeChance', 0.1), flag('stunChance', 0.1), flag('burnOnHit', 0.4), flag('poisonOnHit', 1),
  flag('vulnerabilityOnHit', 0.1), flag('explosionOnHit', 60), flag('everyNthExplosion', 3), flag('fireZoneOnHit', 8),
  flag('chainLightningChance', 0.3), flag('critLightning', 1), flag('randomElement', 1), flag('elementalSecondary', 1),
  flag('fireSpread', 1), flag('flameExplosionOnDeath', 60), flag('poisonSpreadOnDeath', 1), flag('poisonExplosionOnDeath', 50),
  flag('frostNova', 70), flag('burnSpreadsPoison', 1), flag('meteorOnKillChance', 0.1), flag('infiniteChain', 1),
  { kind: 'stat', stat: 'critChance', op: 'flat', value: 0.3 },
];

function stress(): void {
  const w = createWorld(defaultRunOptions(7, {
    startingSlots: 12, towerPool: [...TOWER_IDS], daily: { effects: HEAVY }, castleHpBonus: 1e6,
  }), { upgrades: [], synergies: [], events: [] });
  w.sellTower(5);
  for (let i = 0; i < 12; i++) w.grantTower(TOWER_IDS[i % TOWER_IDS.length], MAX_TOWER_LEVEL);
  const s = (w as unknown as { s: SimState }).s;
  w.startWaveNow();
  s.plan!.entries.length = 0;
  // tough and slow, so the crowd stays alive and spread over the whole path
  let spawned = 0;
  for (let i = 0; spawned < ENEMIES; i++) {
    const kind = i % 7 === 0 ? 'bat' : i % 5 === 0 ? 'orc' : 'goblin';
    // flyers use the short air lane: keep them on it so nothing leaks into the castle during the run
    const progress = kind === 'bat' ? 20 + ((i * 13) % 700) : 20 + ((i * 21) % 2300);
    const e = spawnEnemy(s, kind, { progress, hpMult: 4e5 });
    if (!e) break;
    e.baseSpeed *= 0.05;
    spawned++;
  }
  s.grid.rebuild();
  for (let i = 0; i < 180; i++) { w.update(1 / 60); w.drainEvents(); } // warm-up

  const ms: number[] = [];
  const garbage: number[] = [];
  let events = 0;
  for (let i = 0; i < FRAMES; i++) {
    if (gc && i % 10 === 0) gc();
    const heap0 = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    w.update(1 / 60);
    ms.push(performance.now() - t0);
    const heap1 = process.memoryUsage().heapUsed;
    if (gc && i % 10 === 0) garbage.push(Math.max(0, heap1 - heap0));
    events += w.drainEvents().length; // the renderer drains every frame
  }
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  console.log(`stress: ${spawned} enemies spawned, ${s.alive} alive at the end, 12 level ${MAX_TOWER_LEVEL} towers, ${HEAVY.length} flags, ${FRAMES} frames`);
  console.log(`  update(1/60): avg ${avg.toFixed(3)} ms, p95 ${percentile(ms, 0.95).toFixed(3)} ms, p99 ${percentile(ms, 0.99).toFixed(3)} ms, max ${Math.max(...ms).toFixed(3)} ms (60 fps budget 16.7 ms)`);
  console.log(`  events drained: ${(events / FRAMES).toFixed(1)} per frame; projectiles active ${s.projectiles.filter((p) => p.active).length}/${BALANCE.caps.maxProjectiles}`);
  if (gc) {
    const kb = garbage.map((b) => b / 1024);
    console.log(`  allocations (heapUsed delta of single updates, GC forced before each sample): avg ${(kb.reduce((a, b) => a + b, 0) / kb.length).toFixed(1)} KiB, p95 ${percentile(kb, 0.95).toFixed(1)} KiB, max ${Math.max(...kb).toFixed(1)} KiB per update`);
  } else {
    console.log('  allocations: run with --expose-gc (npm run perf) for the heap estimate');
  }
}

function fullRun(): void {
  const options = buildOptions({ seed: 11, meta: 'late', pool: FULL_POOL });
  let frames = 0;
  const t0 = performance.now();
  const r = runBot(options, 'greedy', 40);
  const wall = (performance.now() - t0) / 1000;
  frames = Math.round(r.durationSeconds * 60);
  console.log(`full late-meta greedy run: wave ${r.waveReached}, ${(r.durationSeconds / 60).toFixed(1)} simulated minutes in ${wall.toFixed(2)} s wall time `
    + `(${(r.durationSeconds / wall).toFixed(0)}x real time, ~${((wall * 1000) / frames).toFixed(3)} ms per 1/60 s of game time incl. the bot)`);
}

stress();
fullRun();
