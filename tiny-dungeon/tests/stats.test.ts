import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { applyCaps, cloneStats, computeStats, scaleEffects } from '../src/core/stats';
import type { StatEffect } from '../src/core/types';

const base = BALANCE.baseStats;

describe('computeStats', () => {
  it('applies (base + adds) * (1 + sum pct) * product mul', () => {
    const src: StatEffect[][] = [
      [{ stat: 'maxHp', add: 20 }, { stat: 'maxHp', pct: 0.1 }],
      [{ stat: 'maxHp', pct: 0.2 }, { stat: 'maxHp', mul: 2 }],
      [{ stat: 'maxHp', mul: 1.5 }],
    ];
    const s = computeStats(src, base);
    expect(s.maxHp).toBeCloseTo((100 + 20) * (1 + 0.1 + 0.2) * 2 * 1.5, 6);
  });

  it('does not mutate the base and leaves untouched stats alone', () => {
    const before = cloneStats(base);
    const s = computeStats([[{ stat: 'armor', add: 2 }]], base);
    expect(base).toEqual(before);
    expect(s.armor).toBe(2);
    expect(s.moveSpeed).toBe(base.moveSpeed);
  });

  it('caps stats', () => {
    const s = computeStats([[
      { stat: 'critChance', add: 5 }, { stat: 'dodge', add: 2 }, { stat: 'attackSpeedMult', pct: 50 },
      { stat: 'multiStrike', add: 9 }, { stat: 'extraProjectiles', add: 99 }, { stat: 'pierce', add: 99 },
      { stat: 'orbitBlades', add: 99 }, { stat: 'chainCount', add: 99 }, { stat: 'slowAmount', add: 5 },
      { stat: 'damageMult', pct: 1000 }, { stat: 'burnMaxStacks', add: 100 }, { stat: 'thunderLevel', add: 100 },
      { stat: 'meteorLevel', add: 100 }, { stat: 'chainCanCrit', add: 3 },
    ]], base);
    const c = BALANCE.caps.max;
    expect(s.critChance).toBe(0.75);
    expect(s.dodge).toBe(0.5);
    expect(s.attackSpeedMult).toBe(c.attackSpeedMult);
    expect(s.multiStrike).toBe(3);
    expect(s.extraProjectiles).toBe(6);
    expect(s.pierce).toBe(5);
    expect(s.orbitBlades).toBe(8);
    expect(s.chainCount).toBe(6);
    expect(s.slowAmount).toBe(0.7);
    expect(s.damageMult).toBe(20);
    expect(s.burnMaxStacks).toBe(10);
    expect(s.thunderLevel).toBe(8);
    expect(s.meteorLevel).toBe(8);
    expect(s.chainCanCrit).toBe(1);
  });

  it('floors stats at their minimum (glass cannon cannot kill the hero)', () => {
    const s = computeStats([[{ stat: 'maxHp', pct: -5 }, { stat: 'regen', add: -3 }, { stat: 'thunderInterval', add: -10 }]], base);
    expect(s.maxHp).toBe(1);
    expect(s.regen).toBe(0);
    expect(s.thunderInterval).toBe(BALANCE.caps.min.thunderInterval);
  });

  it('applyCaps repairs NaN and Infinity', () => {
    const s = cloneStats(base);
    s.maxHp = NaN;
    s.moveSpeed = Infinity;
    applyCaps(s);
    expect(s.maxHp).toBe(base.maxHp);
    expect(Number.isFinite(s.moveSpeed)).toBe(true);
    expect(s.moveSpeed).toBeLessThanOrEqual(BALANCE.caps.max.moveSpeed as number);
  });

  it('every base stat is finite and inside its caps', () => {
    for (const [k, v] of Object.entries(base)) {
      expect(Number.isFinite(v)).toBe(true);
      const key = k as keyof typeof base;
      expect(v).toBeGreaterThanOrEqual(BALANCE.caps.min[key] ?? 0);
      expect(v).toBeLessThanOrEqual(BALANCE.caps.max[key] ?? Infinity);
    }
  });
});

describe('scaleEffects', () => {
  it('scales add and pct linearly and mul exponentially', () => {
    const out = scaleEffects([{ stat: 'damageMult', add: 1, pct: 0.2, mul: 1.5 }], 3);
    expect(out[0].add).toBe(3);
    expect(out[0].pct).toBeCloseTo(0.6, 9);
    expect(out[0].mul).toBeCloseTo(3.375, 9);
    expect(scaleEffects([{ stat: 'armor', add: 1 }], 0)).toEqual([]);
  });
});
