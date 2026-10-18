import { describe, expect, it } from 'vitest';
import { Rng, dailySeed, hashString, newSeed, todayKey } from '../src/core/rng';

describe('Rng', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    const c = new Rng(124);
    const sa = Array.from({ length: 50 }, () => a.next());
    const sb = Array.from({ length: 50 }, () => b.next());
    const sc = Array.from({ length: 50 }, () => c.next());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    for (const v of sa) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('produces a roughly uniform distribution', () => {
    const r = new Rng(7);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) sum += r.next();
    expect(sum / n).toBeGreaterThan(0.48);
    expect(sum / n).toBeLessThan(0.52);
  });

  it('int is inclusive on both ends and range stays in bounds', () => {
    const r = new Rng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(3, 6));
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
    for (let i = 0; i < 200; i++) {
      const v = r.range(-2, 5);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(5);
    }
  });

  it('fork streams are independent of draws on the parent and of each other', () => {
    const p1 = new Rng(42);
    const p2 = new Rng(42);
    for (let i = 0; i < 100; i++) p2.next(); // consuming the parent must not move its forks
    const f1 = p1.fork('rooms');
    const f2 = p2.fork('rooms');
    expect(Array.from({ length: 10 }, () => f1.next())).toEqual(Array.from({ length: 10 }, () => f2.next()));
    const rooms = new Rng(42).fork('rooms');
    const loot = new Rng(42).fork('loot');
    expect(rooms.next()).not.toBe(loot.next());
  });

  it('pick, weighted and shuffle behave', () => {
    const r = new Rng(5);
    expect(['a', 'b', 'c']).toContain(r.pick(['a', 'b', 'c']));
    expect(() => r.pick([])).toThrow();
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 6000; i++) counts[r.weighted(['a', 'b'] as const, (k) => (k === 'a' ? 1 : 3))]++;
    expect(counts.b / counts.a).toBeGreaterThan(2.6);
    expect(counts.b / counts.a).toBeLessThan(3.4);
    expect(r.weighted(['x', 'y'], (k) => (k === 'x' ? 0 : 1))).toBe('y');
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const sh = r.shuffle(arr);
    expect([...sh].sort()).toEqual(arr);
    expect(arr).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // input untouched
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1.0001)).toBe(true);
  });

  it('exposes state and helpers', () => {
    const r = new Rng(1);
    expect(r.state).toHaveLength(4);
    expect(hashString('a')).toBe(hashString('a'));
    expect(hashString('a')).not.toBe(hashString('b'));
    expect(todayKey(new Date('2026-03-04T23:59:59Z'))).toBe('2026-03-04');
    expect(dailySeed('2026-03-04')).toBe(dailySeed('2026-03-04'));
    expect(dailySeed('2026-03-04')).not.toBe(dailySeed('2026-03-05'));
    expect(Number.isInteger(newSeed())).toBe(true);
  });
});
