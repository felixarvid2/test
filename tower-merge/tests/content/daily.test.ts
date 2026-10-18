import { describe, expect, it } from 'vitest';
import { dailyChallenge, dailyKey } from '../../src/core/daily';
import { DAILY_MODIFIERS } from '../../src/data/daily';

function dayKeys(n: number): string[] {
  const out: string[] = [];
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < n; i++) out.push(dailyKey(new Date(start + i * 86_400_000)));
  return out;
}

describe('dailyChallenge', () => {
  it('formats keys as YYYY-MM-DD in UTC', () => {
    expect(dailyKey(new Date('2026-03-05T23:59:59Z'))).toBe('2026-03-05');
  });

  it('is deterministic for the same key', () => {
    const a = dailyChallenge('2026-10-18');
    const b = dailyChallenge('2026-10-18');
    expect(b).toEqual(a);
    expect(a.key).toBe('2026-10-18');
    expect(Number.isInteger(a.seed) && a.seed >= 0 && a.seed <= 0xffffffff).toBe(true);
  });

  it('varies between days', () => {
    const keys = dayKeys(60);
    expect(new Set(keys.map((k) => dailyChallenge(k).seed)).size).toBe(keys.length);
    expect(new Set(keys.map((k) => dailyChallenge(k).modifiers.map((m) => m.id).join('+'))).size).toBeGreaterThan(20);
  });

  it('always yields 2 distinct, non-conflicting modifiers with at most one tower pool', () => {
    for (const key of dayKeys(400)) {
      const { modifiers } = dailyChallenge(key);
      expect(modifiers.length, key).toBe(2);
      expect(new Set(modifiers.map((m) => m.id)).size, key).toBe(2);
      expect(modifiers.filter((m) => m.towerPool).length, key).toBeLessThanOrEqual(1);
      expect(modifiers.filter((m) => m.startCoins !== undefined).length, key).toBeLessThanOrEqual(1);
      for (const k of ['enemyHpMult', 'enemySpeedMult', 'enemyCountMult'] as const) {
        expect(modifiers.filter((m) => m.waveModifier?.[k] !== undefined).length, `${key} ${k}`).toBeLessThanOrEqual(1);
      }
      for (const m of modifiers) expect(DAILY_MODIFIERS).toContain(m);
    }
  });

  it('eventually uses every modifier', () => {
    const seen = new Set<string>();
    for (const key of dayKeys(400)) dailyChallenge(key).modifiers.forEach((m) => seen.add(m.id));
    expect(seen.size).toBe(DAILY_MODIFIERS.length);
  });
});
