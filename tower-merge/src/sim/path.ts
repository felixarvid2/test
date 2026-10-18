import { len as vlen } from './math';
import { FLY_LANE, PATH } from '../data/map';
import type { Point } from '../data/map';

/** Anything that walks a lane: written by Lane.place(). */
export interface LaneWalker {
  progress: number;
  seg: number;
  lateral: number;
  x: number;
  y: number;
  angle: number;
}

/** Distance along the corner over which the lateral offset normal is blended, to avoid jumps. */
const BLEND = 28;

/** A polyline with precomputed cumulative lengths. Positions are found by distance, never stuck. */
export class Lane {
  readonly pts: readonly Point[];
  readonly cum: Float64Array;
  readonly segLen: Float64Array;
  readonly total: number;
  private readonly dx: Float64Array;
  private readonly dy: Float64Array;
  private readonly ang: Float64Array;
  private readonly px: Float64Array;
  private readonly py: Float64Array;

  constructor(pts: readonly Point[]) {
    this.pts = pts;
    const n = pts.length - 1;
    this.cum = new Float64Array(n + 1);
    this.segLen = new Float64Array(n);
    this.dx = new Float64Array(n);
    this.dy = new Float64Array(n);
    this.ang = new Float64Array(n);
    this.px = new Float64Array(n + 1);
    this.py = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) {
      this.px[i] = pts[i].x;
      this.py[i] = pts[i].y;
    }
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const ex = pts[i + 1].x - pts[i].x;
      const ey = pts[i + 1].y - pts[i].y;
      const len = vlen(ex, ey);
      this.segLen[i] = len;
      this.dx[i] = ex / len;
      this.dy[i] = ey / len;
      this.ang[i] = Math.atan2(ey, ex);
      this.cum[i] = acc;
      acc += len;
    }
    this.cum[n] = acc;
    this.total = acc;
  }

  /**
   * Position for a distance along the lane, written to `out` as [x, y, angle, segment]. `seg` is a
   * hint (the walker's previous segment) so lookups are O(1). Allocation-free and monomorphic.
   */
  locate(dist: number, seg: number, lateral: number, out: Float64Array): void {
    const last = this.segLen.length - 1;
    let d = dist;
    if (d < 0) d = 0;
    else if (d > this.total) d = this.total;
    if (seg > last) seg = last;
    while (seg > 0 && d < this.cum[seg]) seg--;
    while (seg < last && d >= this.cum[seg + 1]) seg++;
    const t = d - this.cum[seg];
    const dxs = this.dx[seg];
    const dys = this.dy[seg];
    // Left normal of the segment, blended with the neighbour's near corners.
    let nx = -dys;
    let ny = dxs;
    const sl = this.segLen[seg];
    if (t < BLEND && seg > 0) {
      const wgt = 0.5 * (1 - t / BLEND);
      nx = nx * (1 - wgt) + -this.dy[seg - 1] * wgt;
      ny = ny * (1 - wgt) + this.dx[seg - 1] * wgt;
    } else if (sl - t < BLEND && seg < last) {
      const wgt = 0.5 * (1 - (sl - t) / BLEND);
      nx = nx * (1 - wgt) + -this.dy[seg + 1] * wgt;
      ny = ny * (1 - wgt) + this.dx[seg + 1] * wgt;
    }
    const nl = vlen(nx, ny) || 1;
    out[0] = this.px[seg] + dxs * t + (nx / nl) * lateral;
    out[1] = this.py[seg] + dys * t + (ny / nl) * lateral;
    out[2] = this.ang[seg];
    out[3] = seg;
  }

  /** Writes x, y, angle (and the cached segment index) for the walker's progress. */
  place(w: LaneWalker): void {
    this.locate(w.progress, w.seg, w.lateral, PLACE_OUT);
    w.x = PLACE_OUT[0];
    w.y = PLACE_OUT[1];
    w.angle = PLACE_OUT[2];
    w.seg = PLACE_OUT[3];
  }
}

const PLACE_OUT = new Float64Array(4);

export const GROUND_LANE = new Lane(PATH);
export const AIR_LANE = new Lane(FLY_LANE);
