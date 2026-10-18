// Headless balance simulation. Usage:
//   npm run sim -- --runs 2000 --skill average --meta none|mid|max [--strategy mixed|random|greedy|synergy]
//                  [--hero all|knight|ranger|mage] [--seed 1] [--over 2.5] [--under 0.2] [--ablation 60] [--progression 20]
import { UPGRADES, UPGRADE_BY_ID } from '../src/data/upgrades';
import { SYNERGIES } from '../src/data/synergies';
import { HERO_IDS } from '../src/data/heroes';
import { createRun, isUpgradeAvailable } from '../src/core/run';
import { BOSSES } from '../src/data/bosses';
import {
  metaPreset, simulateProgression, simulateRun, totalShopCost,
} from '../src/core/sim';
import type { MetaPreset, SimResult, Skill, Strategy } from '../src/core/sim';
import type { HeroId } from '../src/core/types';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def;
}

const runs = Number(arg('runs', '1000'));
const skill = arg('skill', 'average') as Skill;
const metaName = arg('meta', 'none') as MetaPreset;
const strategyArg = arg('strategy', 'mixed');
const heroArg = arg('hero', 'all');
const seed0 = Number(arg('seed', '1'));
const over = Number(arg('over', '2.5'));
const under = Number(arg('under', '0.2'));
const progression = Number(arg('progression', '0'));
const strategies: Strategy[] = ['random', 'greedy', 'synergy'];
const heroes: HeroId[] = heroArg === 'all' ? HERO_IDS : [heroArg as HeroId];

const { meta, unlocks } = metaPreset(metaName);
const results: SimResult[] = [];
const t0 = Date.now();
for (let i = 0; i < runs; i++) {
  const hero = heroes[i % heroes.length];
  const strategy = strategyArg === 'mixed' ? strategies[Math.floor(i / heroes.length) % 3] : (strategyArg as Strategy);
  results.push(simulateRun({ hero, skill, strategy, meta, unlocks, seed: seed0 * 1000003 + i * 7919 + 13 }));
}
const elapsed = (Date.now() - t0) / 1000;

const pct = (sorted: number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const f1 = (n: number): string => n.toFixed(1);
const pad = (s: string | number, n: number): string => String(s).padEnd(n);
const padl = (s: string | number, n: number): string => String(s).padStart(n);

console.log(`Tiny Dungeon balance simulation: ${runs} runs, skill=${skill}, meta=${metaName}, strategy=${strategyArg}, hero=${heroArg} (${elapsed.toFixed(1)}s)`);

// ---- rooms per hero
console.log('\n== Room reached (the room you died in) ==');
console.log(`${pad('hero', 8)}${padl('runs', 6)}${padl('mean', 7)}${padl('p25', 6)}${padl('median', 8)}${padl('p75', 6)}${padl('p90', 6)}${padl('max', 6)}${padl('minutes', 9)}${padl('gold', 7)}${padl('lvl', 6)}`);
const groups: [string, SimResult[]][] = [...heroes.map((h): [string, SimResult[]] => [h, results.filter((r) => r.hero === h)]), ['ALL', results]];
for (const [name, rs] of groups) {
  if (rs.length === 0) continue;
  const rooms = rs.map((r) => r.roomReached).sort((a, b) => a - b);
  console.log(
    `${pad(name, 8)}${padl(rs.length, 6)}${padl(f1(mean(rooms)), 7)}${padl(pct(rooms, 0.25), 6)}${padl(pct(rooms, 0.5), 8)}${padl(pct(rooms, 0.75), 6)}` +
    `${padl(pct(rooms, 0.9), 6)}${padl(rooms[rooms.length - 1], 6)}${padl(f1(mean(rs.map((r) => r.durationSec)) / 60), 9)}` +
    `${padl(Math.round(mean(rs.map((r) => r.gold))), 7)}${padl(f1(mean(rs.map((r) => r.level))), 6)}`,
  );
}
if (strategyArg === 'mixed') {
  console.log('\nby pick strategy (median room): ' + strategies.map((s) => {
    const r = results.filter((x) => x.strategy === s).map((x) => x.roomReached).sort((a, b) => a - b);
    return `${s}=${r.length ? pct(r, 0.5) : '-'}`;
  }).join('  '));
}

// ---- death histogram
console.log('\n== Death room histogram (all heroes) ==');
const hist = new Map<number, number>();
for (const r of results) hist.set(r.roomReached, (hist.get(r.roomReached) ?? 0) + 1);
const maxRoom = Math.max(...results.map((r) => r.roomReached));
const maxCount = Math.max(...hist.values());
const counts: number[] = [];
for (let room = 1; room <= maxRoom; room++) counts.push(hist.get(room) ?? 0);
for (let room = 1; room <= maxRoom; room++) {
  const c = counts[room - 1];
  const neighbours = [counts[room - 2], counts[room]].filter((x) => x !== undefined) as number[];
  const spike = c > 40 && c > 2.2 * mean(neighbours) && room % 5 !== 0 ? '  <-- spike' : '';
  const boss = room % 5 === 0 ? ' (boss)' : '';
  console.log(`${padl(room, 3)}${pad(boss, 8)}${padl(c, 6)} ${'#'.repeat(Math.round((c / maxCount) * 40))}${spike}`);
}

// ---- bosses
console.log('\n== Boss win rate (per fight) ==');
for (const b of BOSSES) {
  const fights = results.flatMap((r) => r.bossFights.filter((f) => f.boss === b.id));
  const first = fights.filter((f) => f.room === b.room);
  const win = (xs: typeof fights): string => (xs.length ? `${((xs.filter((f) => f.won).length / xs.length) * 100).toFixed(0)}%` : '-');
  console.log(`${pad(b.name, 18)} room ${padl(b.room, 2)}: ${padl(win(first), 5)} of ${padl(first.length, 5)} first fights   (all loops: ${win(fights)} of ${fights.length})`);
}
const allBossFights = results.flatMap((r) => r.bossFights);
for (const room of [20, 25, 30, 35, 40]) {
  const f = allBossFights.filter((x) => x.room === room);
  if (f.length >= 10) console.log(`  loop boss room ${room}: ${((f.filter((x) => x.won).length / f.length) * 100).toFixed(0)}% of ${f.length}`);
}

// ---- upgrade pick rates (observed) and marginal impact (paired ablation)
const ablationSeeds = Number(arg('ablation', '100'));
console.log(`\n== Upgrades: observed ownership and marginal impact ==`);
console.log(`impact = mean rooms gained when the card is the first pick vs. no pick on the same seeds (${ablationSeeds} seeds per hero, only heroes that can be offered it).`);
console.log(`Rooms come in boss-sized lumps at low power, so compare within a rarity. flag: > +${over} overpowered, < +${under} weak`);
const lifts = new Map<string, number[]>(); // `${id}:${hero}` -> per-seed lifts
if (ablationSeeds > 0) {
  for (const hero of heroes) {
    for (let k = 0; k < ablationSeeds; k++) {
      const seed = seed0 * 7919 + k * 104729 + 5;
      const strategy = strategies[k % 3];
      const cfg = { hero, skill, strategy, meta, unlocks, seed, maxRooms: 60 };
      const control = simulateRun({ ...cfg, forcePicks: ['none'] }).roomReached;
      for (const u of UPGRADES) {
        if (u.onPick) continue;
        const probe = createRun({ hero, seed, mode: 'normal', meta, unlocks, runId: 'p' });
        if (!isUpgradeAvailable(probe, u, unlocks)) continue;
        const r = simulateRun({ ...cfg, forcePicks: [u.id] }).roomReached;
        const key = `${u.id}:${hero}`;
        const arr = lifts.get(key) ?? [];
        arr.push(r - control);
        lifts.set(key, arr);
      }
    }
  }
}
const pickCount = new Map<string, number>();
for (const r of results) for (const id of Object.keys(r.upgrades)) pickCount.set(id, (pickCount.get(id) ?? 0) + 1);
const liftOf = (id: string, hero: HeroId): number => {
  const a = lifts.get(`${id}:${hero}`);
  return a && a.length ? mean(a) : NaN;
};
const fmt = (x: number): string => (Number.isNaN(x) ? '-' : (x >= 0 ? '+' : '') + x.toFixed(2));
console.log(`${pad('upgrade', 18)}${pad('rarity', 11)}${padl('owned', 7)}${padl('knight', 8)}${padl('ranger', 8)}${padl('mage', 8)}${padl('mean', 8)}`);
const rows = UPGRADES.filter((u) => !u.onPick).map((u) => {
  const per = heroes.map((h) => liftOf(u.id, h)).filter((x) => !Number.isNaN(x));
  return { u, owned: (pickCount.get(u.id) ?? 0) / results.length, mean: per.length ? mean(per) : NaN };
}).sort((a, b) => (Number.isNaN(b.mean) ? -99 : b.mean) - (Number.isNaN(a.mean) ? -99 : a.mean));
for (const row of rows) {
  const flag = Number.isNaN(row.mean) ? '' : row.mean > over ? '  <-- OVERPOWERED' : row.mean < under ? '  <-- weak' : '';
  console.log(`${pad(row.u.id, 18)}${pad(row.u.rarity, 11)}${padl((row.owned * 100).toFixed(0) + '%', 7)}${padl(fmt(liftOf(row.u.id, 'knight')), 8)}${padl(fmt(liftOf(row.u.id, 'ranger')), 8)}${padl(fmt(liftOf(row.u.id, 'mage')), 8)}${padl(fmt(row.mean), 8)}${flag}`);
}
const byRarity = (['common', 'rare', 'epic', 'legendary'] as const).map((r) => {
  const xs = rows.filter((x) => x.u.rarity === r && !Number.isNaN(x.mean)).map((x) => x.mean);
  return `${r} ${fmt(mean(xs))}`;
});
console.log(`mean impact by rarity: ${byRarity.join('   ')}`);

// ---- synergies
console.log('\n== Synergies: activation frequency and effect (paired: same forced picks, synergy bonus on vs off) ==');
console.log(`${pad('synergy', 18)}${padl('runs', 8)}${padl('effect', 9)}${padl('n', 6)}`);
const synSeeds = Math.max(0, Math.floor(ablationSeeds / 2));
for (const sy of SYNERGIES) {
  const total = results.filter((r) => r.synergyRoom[sy.id] !== undefined).length;
  let sum = 0;
  let n = 0;
  for (const hero of heroes) {
    for (let k = 0; k < synSeeds; k++) {
      const seed = seed0 * 6007 + k * 15485863 + 11;
      const probe = createRun({ hero, seed, mode: 'normal', meta, unlocks, runId: 'p' });
      const ok = sy.requires.every((id) => isUpgradeAvailable(probe, UPGRADE_BY_ID[id], unlocks));
      if (!ok) continue;
      const cfg = { hero, skill, strategy: strategies[k % 3], meta, unlocks, seed, maxRooms: 60, forcePicks: sy.requires };
      const on = simulateRun(cfg).roomReached;
      const off = simulateRun({ ...cfg, disabledSynergies: [sy.id] }).roomReached;
      sum += on - off;
      n++;
    }
  }
  console.log(`${pad(sy.id + (sy.evolution ? '*' : ''), 18)}${padl(((total / results.length) * 100).toFixed(1) + '%', 8)}${padl(n ? (sum / n >= 0 ? '+' : '') + (sum / n).toFixed(2) : '-', 9)}${padl(n, 6)}`);
}
console.log(`(* = evolution)  mean synergies per run: ${f1(mean(results.map((r) => r.synergies.length)))}`);

// ---- gold / shop
const golds = results.map((r) => r.gold);
console.log(`\n== Gold ==\nmean gold per run ${Math.round(mean(golds))}, median ${pct([...golds].sort((a, b) => a - b), 0.5)}; shop total ${totalShopCost()}`);
if (progression > 0) {
  console.log(`\n== Career (${progression} players, skill=${skill}, cheapest-first shopping) ==`);
  const careers = Array.from({ length: progression }, (_, i) => simulateProgression({ skill, seed: seed0 * 977 + i }));
  const done = careers.map((c) => c.runsToMax).filter((x): x is number => x !== null).sort((a, b) => a - b);
  console.log(`runs to buy everything: median ${done.length ? pct(done, 0.5) : '>400'} (${done.length}/${careers.length} finished within 400 runs)`);
  const checkpoints = [1, 2, 3, 5, 10, 20, 40, 80];
  console.log('median room reached by run number: ' + checkpoints.map((c) => {
    const v = careers.map((x) => x.rooms[c - 1]).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
    return `#${c}=${v.length ? pct(v, 0.5) : '-'}`;
  }).join('  '));
  const first = careers.map((c) => c.rooms[0]).sort((a, b) => a - b);
  console.log(`first run: median room ${pct(first, 0.5)}, p90 ${pct(first, 0.9)}`);
}

// ---- target check
const allRooms = results.map((r) => r.roomReached).sort((a, b) => a - b);
console.log('\n== Targets ==');
console.log(`median room ${pct(allRooms, 0.5)}, p90 ${pct(allRooms, 0.9)}, mean run length ${f1(mean(results.map((r) => r.durationSec)) / 60)} min`);
