import type { Effect, FlagKey, GlobalStat, TowerStat } from '../data/types';

/** Index tables so modifier aggregation runs on typed arrays instead of string-keyed maps. */
export const STAT_INDEX: Record<TowerStat, number> = {
  damage: 0, fireRate: 1, range: 2, splashRadius: 3, critChance: 4, critMult: 5,
  projectileSpeed: 6, statusPower: 7, statusDuration: 8, chainCount: 9, chainRange: 10, armorPen: 11,
};
export const NSTATS = 12;

export const GLOBAL_INDEX: Record<GlobalStat, number> = {
  coinGain: 0, castleMaxHp: 1, towerCost: 2, abilityCooldown: 3, abilityPower: 4, bossDamage: 5, waveCoinBonus: 6,
};
export const NGLOBALS = 7;

/** Flag indexes. `satisfies` makes the compiler reject a FlagKey that is missing here. */
export const FL = {
  extraProjectiles: 0, multishot: 1, pierce: 2, splitOnImpact: 3, clusterBombs: 4,
  slowOnHit: 5, freezeChance: 6, stunChance: 7, burnOnHit: 8, poisonOnHit: 9, vulnerabilityOnHit: 10,
  explosionOnHit: 11, everyNthExplosion: 12, fireZoneOnHit: 13, chainLightningChance: 14, critLightning: 15,
  randomElement: 16, elementalSecondary: 17,
  executeThreshold: 18, frozenBonusDamage: 19, burningBonusDamage: 20, poisonedBonusDamage: 21, adjacencyBonus: 22,
  fireSpread: 23, flameExplosionOnDeath: 24, poisonSpreadOnDeath: 25, poisonExplosionOnDeath: 26, frostNova: 27,
  burnSpreadsPoison: 28,
  meteorOnKillChance: 29, infiniteChain: 30, mergeFrenzy: 31, killCoinBonus: 32, bossShatter: 33,
  castleRegen: 34, thorns: 35,
} as const satisfies Record<FlagKey, number>;
export const NFLAGS = 36;

/** Sums one flag value into a flag array; everyNthExplosion keeps the lowest non-zero N. */
export function addFlagValue(flags: Float64Array, idx: number, value: number): void {
  if (idx === FL.everyNthExplosion) {
    if (value > 0) flags[idx] = flags[idx] > 0 ? Math.min(flags[idx], value) : value;
  } else {
    flags[idx] += value;
  }
}

/** Per-tower-type (or per-instance perk) modifiers: effective = (base + flat) * (1 + pct) * mul. */
export class ModSet {
  readonly flat = new Float64Array(NSTATS);
  readonly pct = new Float64Array(NSTATS);
  readonly mul = new Float64Array(NSTATS).fill(1);
  readonly flags = new Float64Array(NFLAGS);

  clear(): void {
    this.flat.fill(0);
    this.pct.fill(0);
    this.mul.fill(1);
    this.flags.fill(0);
  }

  /** Adds a stat or flag effect (other kinds are ignored). */
  addEffect(e: Effect): void {
    if (e.kind === 'stat') {
      const i = STAT_INDEX[e.stat];
      if (e.op === 'flat') this.flat[i] += e.value;
      else if (e.op === 'pct') this.pct[i] += e.value;
      else this.mul[i] *= e.value;
    } else if (e.kind === 'flag') {
      addFlagValue(this.flags, FL[e.flag], e.value);
    }
  }
}

/** Run-wide stats and the scope-ignoring sum of every flag (used for the global flags). */
export class GlobalMods {
  readonly flat = new Float64Array(NGLOBALS);
  readonly pct = new Float64Array(NGLOBALS);
  readonly mul = new Float64Array(NGLOBALS).fill(1);
  readonly flags = new Float64Array(NFLAGS);

  clear(): void {
    this.flat.fill(0);
    this.pct.fill(0);
    this.mul.fill(1);
    this.flags.fill(0);
  }

  addEffect(e: Effect): void {
    if (e.kind === 'global') {
      const i = GLOBAL_INDEX[e.stat];
      if (e.op === 'flat') this.flat[i] += e.value;
      else if (e.op === 'pct') this.pct[i] += e.value;
      else this.mul[i] *= e.value;
    } else if (e.kind === 'flag') {
      this.flags[FL[e.flag]] += e.value;
    }
  }

  /** Effective value of a global stat with its base. */
  value(stat: GlobalStat, base: number): number {
    const i = GLOBAL_INDEX[stat];
    return (base + this.flat[i]) * (1 + this.pct[i]) * this.mul[i];
  }
}
