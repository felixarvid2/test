import { describe, expect, it } from 'vitest';
import type { Enemy } from '../src/game/entities/Enemy';
import { SpatialGrid } from '../src/game/systems/SpatialGrid';
import { angleDiff, clamp, hash2 } from '../src/game/systems/layout';

function enemy(id: number, x: number, y: number, radius = 14): Enemy {
  return { id, x, y, radius, active: true, dying: false } as unknown as Enemy;
}

describe('SpatialGrid', () => {
  it('finds the nearest enemy within range and ignores far or dying ones', () => {
    const grid = new SpatialGrid();
    const a = enemy(1, 100, 100);
    const b = enemy(2, 160, 100);
    const far = enemy(3, 600, 1000);
    const dead = enemy(4, 102, 100);
    dead.dying = true;
    for (const e of [a, b, far, dead]) grid.insert(e);
    expect(grid.nearest(110, 100, 200)).toBe(a);
    expect(grid.nearest(150, 100, 200)).toBe(b);
    expect(grid.nearest(100, 100, 200, a)).toBe(b);
    expect(grid.nearest(400, 600, 100)).toBeNull();
    expect(grid.nearest(600, 1000, 10)).toBe(far);
  });

  it('queryCircle counts enemies by edge distance and reuses the output array', () => {
    const grid = new SpatialGrid();
    grid.insert(enemy(1, 200, 200));
    grid.insert(enemy(2, 260, 200));
    grid.insert(enemy(3, 400, 400));
    const out: Enemy[] = [];
    expect(grid.queryCircle(200, 200, 40, out)).toBe(1); // the second enemy's edge (60 - 14 = 46) is outside
    expect(grid.queryCircle(200, 200, 50, out)).toBe(2);
    expect(out).toHaveLength(2);
  });

  it('nearestExcluding skips enemies already hit (bounce / chain)', () => {
    const grid = new SpatialGrid();
    const a = enemy(1, 100, 100);
    const b = enemy(2, 150, 100);
    grid.insert(a);
    grid.insert(b);
    const hit = new Int32Array([1, 0, 0, 0]);
    expect(grid.nearestExcluding(100, 100, 200, hit, 1)).toBe(b);
    hit[1] = 2;
    expect(grid.nearestExcluding(100, 100, 200, hit, 2)).toBeNull();
  });
});

describe('layout helpers', () => {
  it('clamp and angleDiff behave', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(-0.2);
    expect(angleDiff(3.0, -3.0)).toBeCloseTo(2 * Math.PI - 6.0);
  });

  it('hash2 is deterministic and in [0, 1)', () => {
    expect(hash2(3, 4, 5)).toBe(hash2(3, 4, 5));
    let min = 1;
    let max = 0;
    for (let i = 0; i < 500; i++) {
      const h = hash2(i, i * 3, 7);
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThan(1);
    expect(max - min).toBeGreaterThan(0.8);
  });
});
