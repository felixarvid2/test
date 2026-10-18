// Stat sheet maths. Everything is a stat: per stat, value = (base + sum add) * (1 + sum pct) * product mul,
// then clamped by BALANCE.caps.
import { BALANCE } from '../config/balance';
import type { StatEffect, StatKey, Stats } from './types';

export function cloneStats(s: Stats): Stats {
  return { ...s };
}

/** Clamps every stat into [caps.min (default 0), caps.max (default none)]. Mutates and returns `stats`. */
export function applyCaps(stats: Stats): Stats {
  const { max, min } = BALANCE.caps;
  for (const key of Object.keys(stats) as StatKey[]) {
    let v = stats[key];
    if (!Number.isFinite(v)) v = BALANCE.baseStats[key];
    const lo = min[key] ?? 0;
    const hi = max[key] ?? Infinity;
    stats[key] = v < lo ? lo : v > hi ? hi : v;
  }
  return stats;
}

/** Combines effect lists (hero, meta, upgrades, synergies, buffs ...) over `base` into a new capped sheet. */
export function computeStats(sources: readonly (readonly StatEffect[])[], base: Stats): Stats {
  const add: Partial<Record<StatKey, number>> = {};
  const pct: Partial<Record<StatKey, number>> = {};
  const mul: Partial<Record<StatKey, number>> = {};
  for (const list of sources) {
    for (const e of list) {
      if (e.add !== undefined) add[e.stat] = (add[e.stat] ?? 0) + e.add;
      if (e.pct !== undefined) pct[e.stat] = (pct[e.stat] ?? 0) + e.pct;
      if (e.mul !== undefined) mul[e.stat] = (mul[e.stat] ?? 1) * e.mul;
    }
  }
  const out = cloneStats(base);
  for (const key of Object.keys(out) as StatKey[]) {
    out[key] = (base[key] + (add[key] ?? 0)) * (1 + (pct[key] ?? 0)) * (mul[key] ?? 1);
  }
  return applyCaps(out);
}

/** Effects of an upgrade owned at `level`: add and pct scale linearly, mul compounds. */
export function scaleEffects(effects: readonly StatEffect[], level: number): StatEffect[] {
  if (level <= 0) return [];
  return effects.map((e) => {
    const out: StatEffect = { stat: e.stat };
    if (e.add !== undefined) out.add = e.add * level;
    if (e.pct !== undefined) out.pct = e.pct * level;
    if (e.mul !== undefined) out.mul = Math.pow(e.mul, level);
    return out;
  });
}
