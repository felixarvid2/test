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
import { fmt, mean, signed, stdErr, table } from './stats';

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
