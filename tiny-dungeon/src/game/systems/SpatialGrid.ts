import type { Enemy } from '../entities/Enemy';

// Uniform grid over the world for "nearest enemy" and "enemies in a circle" queries. Rebuilt once per
// frame after enemies moved; queries fill caller-owned arrays so nothing is allocated per frame.
const CELL = 96;
const COLS = 8;   // 720 / 96 rounded up
const ROWS = 14;  // 1280 / 96 rounded up
const MAX_RADIUS = 64; // largest enemy radius, so a query also reaches enemies whose centre is just outside

export class SpatialGrid {
  private readonly cells: Enemy[][] = [];

  constructor() {
    for (let i = 0; i < COLS * ROWS; i++) this.cells.push([]);
  }

  clear(): void {
    for (let i = 0; i < this.cells.length; i++) this.cells[i].length = 0;
  }

  insert(e: Enemy): void {
    const cx = Math.min(COLS - 1, Math.max(0, (e.x / CELL) | 0));
    const cy = Math.min(ROWS - 1, Math.max(0, (e.y / CELL) | 0));
    this.cells[cy * COLS + cx].push(e);
  }

  /** Nearest living enemy whose edge is within `range` of (x, y); `skip` is excluded when given. */
  nearest(x: number, y: number, range: number, skip: Enemy | null = null): Enemy | null {
    const reach = range + MAX_RADIUS;
    const x0 = Math.max(0, ((x - reach) / CELL) | 0);
    const x1 = Math.min(COLS - 1, ((x + reach) / CELL) | 0);
    const y0 = Math.max(0, ((y - reach) / CELL) | 0);
    const y1 = Math.min(ROWS - 1, ((y + reach) / CELL) | 0);
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells[cy * COLS + cx];
        for (let i = 0; i < cell.length; i++) {
          const e = cell[i];
          if (!e.active || e.dying || e === skip) continue;
          const dx = e.x - x;
          const dy = e.y - y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d - e.radius <= range && d < bestD) {
            bestD = d;
            best = e;
          }
        }
      }
    }
    return best;
  }

  /** Same as nearest() but ignores enemies whose id is in `hit` (used by bouncing / chaining). */
  nearestExcluding(x: number, y: number, range: number, hit: Int32Array, hitCount: number): Enemy | null {
    const reach = range + MAX_RADIUS;
    const x0 = Math.max(0, ((x - reach) / CELL) | 0);
    const x1 = Math.min(COLS - 1, ((x + reach) / CELL) | 0);
    const y0 = Math.max(0, ((y - reach) / CELL) | 0);
    const y1 = Math.min(ROWS - 1, ((y + reach) / CELL) | 0);
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells[cy * COLS + cx];
        for (let i = 0; i < cell.length; i++) {
          const e = cell[i];
          if (!e.active || e.dying) continue;
          let seen = false;
          for (let k = 0; k < hitCount; k++) if (hit[k] === e.id) { seen = true; break; }
          if (seen) continue;
          const dx = e.x - x;
          const dy = e.y - y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d - e.radius <= range && d < bestD) {
            bestD = d;
            best = e;
          }
        }
      }
    }
    return best;
  }

  /** Appends living enemies overlapping the circle to `out` (cleared first); returns the count. */
  queryCircle(x: number, y: number, r: number, out: Enemy[]): number {
    out.length = 0;
    const reach = r + MAX_RADIUS;
    const x0 = Math.max(0, ((x - reach) / CELL) | 0);
    const x1 = Math.min(COLS - 1, ((x + reach) / CELL) | 0);
    const y0 = Math.max(0, ((y - reach) / CELL) | 0);
    const y1 = Math.min(ROWS - 1, ((y + reach) / CELL) | 0);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells[cy * COLS + cx];
        for (let i = 0; i < cell.length; i++) {
          const e = cell[i];
          if (!e.active || e.dying) continue;
          const dx = e.x - x;
          const dy = e.y - y;
          const rr = r + e.radius;
          if (dx * dx + dy * dy <= rr * rr) out.push(e);
        }
      }
    }
    return out.length;
  }
}
