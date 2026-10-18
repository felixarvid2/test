import { WORLD_H, WORLD_W } from '../data/map';

/** Minimal view of an enemy the grid needs. */
export interface GridEntity {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  id: number;
}

const CELL = 80;
const COLS = Math.ceil(WORLD_W / CELL);
const ROWS = Math.ceil(WORLD_H / CELL);
/** Largest enemy radius: queries widen their cell range by this so big bodies are not missed. */
const MAX_RADIUS = 64;
/** Query arguments (x, y, radius) passed through memory instead of as boxed call arguments. */
const QA = new Float64Array(3);

/**
 * Uniform grid over the world. Rebuilt once per tick (after movement); entities are chained through
 * `next` indices so no allocation happens. Queries fill caller-owned Int32Arrays with pool indexes.
 */
export class SpatialGrid<T extends GridEntity> {
  private readonly head = new Int16Array(COLS * ROWS).fill(-1);
  private readonly next: Int16Array;

  constructor(private readonly pool: readonly T[]) {
    this.next = new Int16Array(pool.length).fill(-1);
  }

  rebuild(): void {
    this.head.fill(-1);
    const pool = this.pool;
    for (let i = pool.length - 1; i >= 0; i--) {
      const e = pool[i];
      if (!e.active) continue;
      const c = this.cellOf(e.x, e.y);
      this.next[i] = this.head[c];
      this.head[c] = i;
    }
  }

  private cellOf(x: number, y: number): number {
    let cx = (x / CELL) | 0;
    let cy = (y / CELL) | 0;
    if (cx < 0) cx = 0; else if (cx >= COLS) cx = COLS - 1;
    if (cy < 0) cy = 0; else if (cy >= ROWS) cy = ROWS - 1;
    return cy * COLS + cx;
  }

  /**
   * Indexes of active entities whose body overlaps the circle (centre distance <= r + radius).
   * Returns the count written to `out` (at most `max`). Enemies spawned after the last rebuild are
   * not seen until the next tick.
   */
  query(x: number, y: number, r: number, out: Int32Array, max: number): number {
    // numbers go through memory: this method is too big to inline, and a real call would box x, y and r
    QA[0] = x;
    QA[1] = y;
    QA[2] = r;
    return this.queryCore(out, max);
  }

  private queryCore(out: Int32Array, max: number): number {
    const x = QA[0];
    const y = QA[1];
    const r = QA[2];
    const reach = r + MAX_RADIUS;
    let x0 = ((x - reach) / CELL) | 0;
    let x1 = ((x + reach) / CELL) | 0;
    let y0 = ((y - reach) / CELL) | 0;
    let y1 = ((y + reach) / CELL) | 0;
    if (x - reach < 0) x0 = 0;
    if (y - reach < 0) y0 = 0;
    if (x1 >= COLS) x1 = COLS - 1;
    if (y1 >= ROWS) y1 = ROWS - 1;
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    let n = 0;
    const pool = this.pool;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (let i = this.head[cy * COLS + cx]; i >= 0; i = this.next[i]) {
          const e = pool[i];
          if (!e.active) continue;
          const dx = e.x - x;
          const dy = e.y - y;
          const rr = r + e.radius;
          if (dx * dx + dy * dy <= rr * rr) {
            if (n >= max) return n;
            out[n++] = i;
          }
        }
      }
    }
    return n;
  }

  /**
   * Nearest active entity (by centre distance) within range of (x, y) whose id is not in `skip`.
   * `airOk` false ignores entities for which `isFlyer(e)` is true.
   */
  nearestExcluding(
    x: number, y: number, range: number, skip: Int32Array, skipCount: number, groundOnly: boolean,
    isFlyer: (e: T) => boolean,
  ): number {
    QA[0] = x;
    QA[1] = y;
    QA[2] = range;
    return this.nearestCore(skip, skipCount, groundOnly, isFlyer);
  }

  private nearestCore(skip: Int32Array, skipCount: number, groundOnly: boolean, isFlyer: (e: T) => boolean): number {
    const x = QA[0];
    const y = QA[1];
    const range = QA[2];
    const reach = range + MAX_RADIUS;
    let x0 = Math.max(0, ((x - reach) / CELL) | 0);
    let y0 = Math.max(0, ((y - reach) / CELL) | 0);
    if (x - reach < 0) x0 = 0;
    if (y - reach < 0) y0 = 0;
    const x1 = Math.min(COLS - 1, ((x + reach) / CELL) | 0);
    const y1 = Math.min(ROWS - 1, ((y + reach) / CELL) | 0);
    let best = -1;
    let bestD = Infinity;
    const pool = this.pool;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (let i = this.head[cy * COLS + cx]; i >= 0; i = this.next[i]) {
          const e = pool[i];
          if (!e.active) continue;
          if (groundOnly && isFlyer(e)) continue;
          let seen = false;
          for (let k = 0; k < skipCount; k++) if (skip[k] === e.id) { seen = true; break; }
          if (seen) continue;
          const dx = e.x - x;
          const dy = e.y - y;
          const d = dx * dx + dy * dy;
          const lim = range + e.radius;
          if (d <= lim * lim && d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    }
    return best;
  }
}
