/**
 * Paired experiments: the same seeds with and without one synergy / upgrade forced on from wave 1.
 * The difference in waves reached is the "lift" of that single thing, free of the survivorship
 * bias that observational pick statistics have.
 */
import { SYNERGIES } from '../../src/data/synergies';
import { UPGRADES } from '../../src/data/upgrades';
import type { Effect, TowerId } from '../../src/data/types';
import { FULL_POOL, START_POOL } from './presets';
import type { MetaPreset } from './presets';
import { runJobs } from './jobs';
import type { JobSpec, Progress } from './jobs';
import { fmt, mean, median, percentile, signed, stdErr, table } from './stats';

interface Variant { label: string; spec: Omit<JobSpec, 'seed'>; base: string }

const poolKey = (p: TowerId[]): string => [...p].sort().join(',');
const union = (...lists: TowerId[][]): TowerId[] => [...new Set(lists.flat())];

export interface ProbeRow { label: string; baseWave: number; delta: number; se: number; deltaMin: number; extra?: string }

async function runVariants(
  variants: Variant[], seeds: number[], workers: number, seedBase: number, onProgress?: (p: Progress) => void, set?: Record<string, number>,
): Promise<Map<string, { wave: number[]; secs: number[] }>> {
  const jobs: JobSpec[] = [];
  const keys: string[] = [];
  for (const v of variants) for (const sd of seeds) { jobs.push({ ...v.spec, seed: seedBase + sd, ...(set ? { set } : {}) }); keys.push(v.label); }
  const recs = await runJobs(jobs, workers, onProgress);
  const out = new Map<string, { wave: number[]; secs: number[] }>();
  recs.forEach((r, i) => {
    const e = out.get(keys[i]) ?? { wave: [], secs: [] };
    e.wave.push(r.wave);
    e.secs.push(r.seconds);
    out.set(keys[i], e);
  });
  return out;
}

function diff(a: { wave: number[]; secs: number[] }, b: { wave: number[]; secs: number[] }): { d: number; se: number; dm: number } {
  const dw = a.wave.map((w, i) => w - b.wave[i]);
  return { d: mean(dw), se: stdErr(dw), dm: (mean(a.secs) - mean(b.secs)) / 60 };
}

export interface ProbeOptions { set?: Record<string, number>; runs: number; workers: number; seedBase: number; meta: MetaPreset; onProgress?: (p: Progress) => void }

/** Each synergy forced on from the start (upper bound) and left to activate naturally, versus no synergies at all. */
export async function synergyProbe(o: ProbeOptions): Promise<ProbeRow[]> {
  const seeds = Array.from({ length: o.runs }, (_, i) => i + 1);
  const variants: Variant[] = [];
  const rows: { id: string; base: string; forced: string; natural: string }[] = [];
  for (const syn of SYNERGIES) {
    const req = syn.requires;
    const pool = union(START_POOL, req.towers ?? [], req.towerLevel ? [req.towerLevel.tower] : []);
    const base = `base:${poolKey(pool)}`;
    const common = { policy: 'greedy' as const, meta: o.meta, pool, poolLabel: poolKey(pool) };
    if (!variants.some((v) => v.label === base)) variants.push({ label: base, base, spec: { ...common, synergies: [] } });
    variants.push({ label: `forced:${syn.id}`, base, spec: { ...common, synergies: [], forcedEffects: syn.effects as Effect[] } });
    variants.push({ label: `natural:${syn.id}`, base, spec: { ...common, synergies: [syn.id] } });
    rows.push({ id: syn.id, base, forced: `forced:${syn.id}`, natural: `natural:${syn.id}` });
  }
  const res = await runVariants(variants, seeds, o.workers, o.seedBase, o.onProgress, o.set);
  return rows.flatMap((r) => {
    const b = res.get(r.base)!;
    const f = diff(res.get(r.forced)!, b);
    const n = diff(res.get(r.natural)!, b);
    return [
      { label: `${r.id} (forced)`, baseWave: mean(b.wave), delta: f.d, se: f.se, deltaMin: f.dm },
      { label: `${r.id} (natural)`, baseWave: mean(b.wave), delta: n.d, se: n.se, deltaMin: n.dm },
    ];
  });
}

/** Each upgrade's stat/flag effects granted from the start (one stack), versus the same pool without it. */
export async function upgradeProbe(o: ProbeOptions): Promise<ProbeRow[]> {
  const seeds = Array.from({ length: o.runs }, (_, i) => i + 1);
  const variants: Variant[] = [];
  const rows: { id: string; base: string; label: string; extra: string }[] = [];
  for (const up of UPGRADES) {
    const effects = up.effects.filter((e) => e.kind !== 'instant');
    if (effects.length === 0) continue;
    const pool = union(START_POOL, up.requires?.anyTower ? [up.requires.anyTower[0]] : []);
    const base = `base:${poolKey(pool)}`;
    const common = { policy: 'greedy' as const, meta: o.meta, pool, poolLabel: poolKey(pool) };
    if (!variants.some((v) => v.label === base)) variants.push({ label: base, base, spec: common });
    variants.push({ label: `up:${up.id}`, base, spec: { ...common, forcedEffects: effects } });
    rows.push({ id: up.id, base, label: `up:${up.id}`, extra: up.rarity });
  }
  const res = await runVariants(variants, seeds, o.workers, o.seedBase, o.onProgress, o.set);
  return rows.map((r) => {
    const b = res.get(r.base)!;
    const d = diff(res.get(r.label)!, b);
    return { label: r.id, baseWave: mean(b.wave), delta: d.d, se: d.se, deltaMin: d.dm, extra: r.extra };
  });
}

export function probeReport(title: string, rows: ProbeRow[], withExtra = false): string {
  const sorted = [...rows].sort((a, b) => b.delta - a.delta);
  return `${title}\n${table(
    ['name', ...(withExtra ? ['rarity'] : []), 'base wave', 'delta waves', '95% ci', 'delta min'],
    sorted.map((r) => [r.label, ...(withExtra ? [r.extra ?? ''] : []), fmt(r.baseWave), signed(r.delta), `+-${fmt(r.se * 1.96, 2)}`, signed(r.deltaMin, 1)]),
  )}`;
}

/** Value of each tower: waves lost when it is removed from the pool (full pool, and the start pool for its three towers). */
export async function towerProbe(o: ProbeOptions): Promise<ProbeRow[]> {
  const seeds = Array.from({ length: o.runs }, (_, i) => i + 1);
  const variants: Variant[] = [];
  const rows: { label: string; base: string; v: string }[] = [];
  const add = (poolName: string, pool: TowerId[]): void => {
    const base = `base:${poolName}`;
    const common = { policy: 'greedy' as const, meta: o.meta, poolLabel: poolName };
    variants.push({ label: base, base, spec: { ...common, pool } });
    for (const t of pool) {
      const rest = pool.filter((x) => x !== t);
      variants.push({ label: `${poolName}-${t}`, base, spec: { ...common, pool: rest } });
      rows.push({ label: `${t} (${poolName} pool)`, base, v: `${poolName}-${t}` });
    }
  };
  add('start', START_POOL);
  add('full', [...FULL_POOL]);
  const res = await runVariants(variants, seeds, o.workers, o.seedBase, o.onProgress, o.set);
  return rows.map((r) => {
    const b = res.get(r.base)!;
    const d = diff(res.get(r.v)!, b);
    // removing a tower: the delta is the negative of its value
    return { label: r.label, baseWave: mean(b.wave), delta: -d.d, se: d.se, deltaMin: -d.dm };
  });
}

export interface LoadoutRow { towers: TowerId[]; waves: number[]; mean: number; median: number }

/** Every loadout of `size` towers out of the eight (the player owns all of them), same seeds and meta bonuses for all. */
export async function loadoutProbe(o: ProbeOptions, size = 4): Promise<LoadoutRow[]> {
  const seeds = Array.from({ length: o.runs }, (_, i) => i + 1);
  const combos: TowerId[][] = [];
  const rec = (start: number, cur: TowerId[]): void => {
    if (cur.length === size) { combos.push([...cur]); return; }
    for (let i = start; i < FULL_POOL.length; i++) { cur.push(FULL_POOL[i]); rec(i + 1, cur); cur.pop(); }
  };
  rec(0, []);
  const variants: Variant[] = combos.map((c) => ({
    label: c.join('+'), base: '', spec: { policy: 'greedy', meta: o.meta, pool: c, poolLabel: c.join('+') },
  }));
  // the start trio as reference
  variants.push({ label: START_POOL.join('+'), base: '', spec: { policy: 'greedy', meta: o.meta, pool: START_POOL, poolLabel: 'start' } });
  const res = await runVariants(variants, seeds, o.workers, o.seedBase, o.onProgress, o.set);
  return variants.map((v) => {
    const w = res.get(v.label)!.wave;
    return { towers: v.spec.pool, waves: w, mean: mean(w), median: median(w) };
  });
}

export function loadoutReport(rows: LoadoutRow[]): string {
  const startKey = START_POOL.join('+');
  const start = rows.find((r) => r.towers.join('+') === startKey && r.towers.length === START_POOL.length);
  const all = rows;
  const sorted = [...all].sort((a, b) => b.mean - a.mean);
  const line = (r: LoadoutRow, i: number): (string | number)[] => [i + 1, r.towers.join(' + '), fmt(r.median), fmt(r.mean), fmt(percentile(r.waves, 0.1), 0) + '-' + fmt(percentile(r.waves, 0.9), 0)];
  const head = ['rank', 'loadout', 'median', 'mean', 'p10-p90'];
  const top = sorted.slice(0, 10).map(line);
  const bottom = sorted.slice(-8).map((r) => line(r, sorted.indexOf(r)));
  const means = sorted.map((r) => r.mean);
  const q = percentile(means, 0.75);
  const towers = [...new Set(rows.flatMap((r) => r.towers))];
  const trows = towers.map((t) => {
    const withT = rows.filter((r) => r.towers.includes(t) && r !== start);
    const best = withT.reduce((a, b) => (b.mean > a.mean ? b : a));
    const inTop = withT.filter((r) => r.mean >= q).length;
    const without = rows.filter((r) => !r.towers.includes(t) && r !== start);
    return [t, fmt(mean(withT.map((r) => r.mean))), fmt(mean(without.map((r) => r.mean))), `${sorted.indexOf(best) + 1}`, fmt(best.mean), `${inTop}/${withT.length}`];
  });
  return `${table(head, top)}\n...\n${table(head, bottom)}\n\nStart trio (arrow + cannon + frost): median ${fmt(start?.median ?? NaN)}, mean ${fmt(start?.mean ?? NaN)}, rank ${start ? sorted.indexOf(start) + 1 : '-'} of ${sorted.length}\n`
    + `Spread: best ${fmt(sorted[0].mean)}, median loadout ${fmt(percentile(means, 0.5))}, worst ${fmt(sorted[sorted.length - 1].mean)}\n\n`
    + `Per tower (mean wave of the loadouts with / without it, rank and mean of its best loadout, share of its loadouts in the top quartile)\n${table(['tower', 'mean with', 'mean without', 'best rank', 'best mean', 'in top quartile'], trows)}`;
}
