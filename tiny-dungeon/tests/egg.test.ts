import { describe, expect, it } from 'vitest';
import { EGG_COSMETICS, EGG_ODDS, formatOdds, rollMysteryEgg } from '../src/rewards/mysteryEgg';

/** mulberry32 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('rollMysteryEgg', () => {
  it('odds sum to 1', () => {
    expect(Object.values(EGG_ODDS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('distribution matches EGG_ODDS', () => {
    const rand = seeded(12345);
    const counts = { companion: 0, cosmetic: 0, gold: 0, buff: 0 };
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const r = rollMysteryEgg(rand, []);
      counts[r.kind] += 1;
      if (r.kind === 'gold') expect(r.amount).toBeGreaterThanOrEqual(40);
      if (r.kind === 'gold') expect(r.amount).toBeLessThanOrEqual(120);
      if (r.kind === 'companion') { expect(r.rooms).toBe(3); expect(['companion_fairy', 'companion_wisp']).toContain(r.id); }
      if (r.kind === 'buff') { expect(r.rooms).toBe(3); expect(r.id).toMatch(/^buff_/); }
    }
    for (const k of Object.keys(counts) as (keyof typeof counts)[]) {
      expect(Math.abs(counts[k] / N - EGG_ODDS[k])).toBeLessThan(0.015);
    }
  });

  it('never awards an owned cosmetic, and falls back to gold when all are owned', () => {
    const rand = seeded(7);
    const owned = EGG_COSMETICS.slice(0, 3) as unknown as string[];
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const r = rollMysteryEgg(rand, owned);
      if (r.kind === 'cosmetic') seen.add(r.id);
    }
    expect([...seen]).toEqual([EGG_COSMETICS[3]]);

    const all = [...EGG_COSMETICS] as string[];
    const rand2 = seeded(8);
    for (let i = 0; i < 5000; i++) expect(rollMysteryEgg(rand2, all).kind).not.toBe('cosmetic');
  });

  it('survives extreme rand values', () => {
    for (const v of [0, 0.999999999]) {
      expect(() => rollMysteryEgg(() => v, [])).not.toThrow();
    }
  });

  it('formats odds for the UI', () => {
    expect(formatOdds()).toContain('Companion 25%');
    expect(formatOdds()).toContain('Gold 35%');
  });
});
