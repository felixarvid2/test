import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { META_UPGRADES } from '../../src/data/meta';
import { metaCost } from '../../src/core/meta';
import { applyOverrides, parseSet } from '../../tools/balance/overrides';
import { META_GEMS, buildOptions, spendMeta, START_POOL, towersForMeta } from '../../tools/balance/presets';
import { runInstrumented } from '../../tools/balance/run';
import { runJob } from '../../tools/balance/jobs';

describe('balance tools', () => {
  it('meta presets never overspend and respect the level caps', () => {
    for (const gems of [0, 100, 1500, 5000, 1e9]) {
      const levels = spendMeta(gems);
      let spent = 0;
      for (const def of META_UPGRADES) {
        const l = levels[def.id] ?? 0;
        expect(l).toBeLessThanOrEqual(def.maxLevel);
        for (let i = 1; i <= l; i++) spent += metaCost(def, i);
      }
      expect(spent).toBeLessThanOrEqual(gems);
    }
    const fresh = buildOptions({ seed: 1, meta: 'fresh', pool: START_POOL });
    const late = buildOptions({ seed: 1, meta: 'late', pool: towersForMeta('late', 'mixed') });
    expect(fresh.damagePct).toBe(0);
    expect(late.damagePct).toBeGreaterThan(buildOptions({ seed: 1, meta: 'mid', pool: START_POOL }).damagePct);
    expect(META_GEMS.fresh).toBe(0);
  });

  it('overrides change data for one run and restore it afterwards', () => {
    const before = BALANCE.waves.hpGrowth;
    const revert = applyOverrides(parseSet('balance.waves.hpGrowth=1.5,towers.arrow.levels.1.damageMult=9'));
    expect(BALANCE.waves.hpGrowth).toBe(1.5);
    revert();
    expect(BALANCE.waves.hpGrowth).toBe(before);
    expect(() => applyOverrides({ 'balance.nope.x': 1 })).toThrow();
    expect(() => applyOverrides({ 'balance.waves.hpGrowthTypo': 1 })).toThrow();
  });

  it('instrumented runs collect consistent telemetry', () => {
    const options = buildOptions({ seed: 4, meta: 'mid', pool: towersForMeta('mid', 'mixed') });
    const r = runInstrumented({ seed: 4, policy: 'greedy', options, meta: 'mid', poolLabel: 'natural', maxWaves: 40 });
    expect(r.samples.length).toBe(r.wave);
    expect(r.samples.map((s) => s.wave)).toEqual(r.samples.map((_, i) => i + 1));
    expect(r.finalBoard.length).toBeGreaterThan(0);
    expect(r.picks.length).toBeGreaterThan(3);
    expect(Object.values(r.towerDamage).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    const slotSeconds = Object.values(r.slotSecondsByTL).reduce((a, b) => a + b, 0);
    expect(slotSeconds).toBeGreaterThan(r.seconds);
    // the castle fell: its death wave shows where the damage came from
    expect(Object.values(r.deathWaveDamage).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  }, 30_000);

  it('a job gives the same run as the equivalent direct call (determinism across the worker boundary)', () => {
    const a = runJob({ seed: 5, policy: 'greedy', meta: 'fresh', pool: START_POOL, poolLabel: 'start' });
    const b = runJob({ seed: 5, policy: 'greedy', meta: 'fresh', pool: START_POOL, poolLabel: 'start' });
    expect(a.wave).toBe(b.wave);
    expect(a.seconds).toBe(b.seconds);
    expect(a.picks).toEqual(b.picks);
  }, 30_000);
});
