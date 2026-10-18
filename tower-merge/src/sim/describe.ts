import { BALANCE } from '../data/balance';
import { TOWERS } from '../data/towers';
import type { TowerStatsView } from './api';
import { FL } from './modifiers';
import type { SimState, TStats, TowerInst } from './state';

/**
 * Rough sustained single-target DPS of a tower from its cached stats: direct damage with volley and
 * crits, burn uptime and steady-state poison stacks. Used for tooltips and balance checks.
 */
export function estimateDps(st: TStats): number {
  const f = st.flags;
  const volley = 1 + f[FL.extraProjectiles];
  const crit = 1 + st.critChance * (st.critMult - 1);
  let dps = st.damage * st.fireRate * volley * crit;
  const C = BALANCE.combat;
  const burn = f[FL.burnOnHit];
  if (burn > 0) dps += burn * st.damage * st.spRel * Math.min(1, C.burnDuration * st.durRel * st.fireRate * volley);
  const poison = f[FL.poisonOnHit];
  if (poison > 0) {
    const stacks = Math.min(C.maxPoisonStacks, poison * st.fireRate * volley * C.poisonDuration * st.durRel);
    dps += stacks * C.poisonDpsPerStack * st.spRel * st.dotScale;
  }
  return dps;
}

export function describe(s: SimState, slot: number): TowerStatsView | null {
  const t: TowerInst | null | undefined = s.slots[slot]?.tower;
  if (!t) return null;
  const def = TOWERS[t.type];
  const st = t.stats;
  const perks: string[] = [];
  for (let l = 2; l <= t.level; l++) {
    const p = def.levels[l - 1].perkName;
    if (p) perks.push(p);
  }
  return {
    type: t.type,
    level: t.level,
    damage: st.damage,
    fireRate: st.fireRate,
    range: st.range,
    dps: estimateDps(st),
    splashRadius: st.splash,
    critChance: st.critChance,
    perks,
  };
}
