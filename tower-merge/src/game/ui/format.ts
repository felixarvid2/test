/** Pure formatting and layout math for the UI (no Phaser: unit-tested in tests/ui). */
import { MIN_TOUCH } from './theme';

/**
 * Compact number: 999 -> "999", 1200 -> "1.2k", 15300 -> "15.3k", 1.5e6 -> "1.5M", 2e9 -> "2B".
 * Rounds down so a counter never shows more than the player has. NaN/Infinity -> "0".
 */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const sign = n < 0 ? '-' : '';
  const v = Math.abs(Math.trunc(n));
  if (v < 1000) return sign + String(v);
  const units: Array<[number, string]> = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']];
  for (const [size, suffix] of units) {
    if (v >= size) {
      const scaled = Math.floor((v / size) * 10) / 10;
      // 999.9k stays "999.9k"; never rolls to "1000k" because we floor.
      return sign + (scaled >= 100 ? String(Math.floor(scaled)) : scaled.toFixed(1).replace(/\.0$/, '')) + suffix;
    }
  }
  return sign + String(v);
}

/** Seconds -> "m:ss" (or "h:mm:ss" from one hour). */
export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Hit-area size for a visual size: never below the minimum touch target. */
export function touchSize(size: number, min = MIN_TOUCH): number {
  return Math.max(size, min);
}

/** Largest uniform scale that fits (srcW, srcH) into (maxW, maxH); never enlarges unless `allowUp`. */
export function fitScale(srcW: number, srcH: number, maxW: number, maxH: number, allowUp = false): number {
  if (srcW <= 0 || srcH <= 0) return 1;
  const s = Math.min(maxW / srcW, maxH / srcH);
  return allowUp ? s : Math.min(1, s);
}

export interface Pt { x: number; y: number }

/** Centres of `count` items of width `itemW` in one row centred on `cx`, `gap` apart. */
export function rowLayout(count: number, itemW: number, gap: number, cx: number, y = 0): Pt[] {
  const total = count * itemW + Math.max(0, count - 1) * gap;
  const start = cx - total / 2 + itemW / 2;
  return Array.from({ length: count }, (_, i) => ({ x: start + i * (itemW + gap), y }));
}

/** Centres of `count` items stacked in a column centred on `cy`. */
export function columnLayout(count: number, itemH: number, gap: number, cy: number, x = 0): Pt[] {
  const total = count * itemH + Math.max(0, count - 1) * gap;
  const start = cy - total / 2 + itemH / 2;
  return Array.from({ length: count }, (_, i) => ({ x, y: start + i * (itemH + gap) }));
}

/** Centres of a `cols`-wide grid of cells, centred on (cx, cy); the last row is centred too. */
export function gridLayout(count: number, cols: number, cellW: number, cellH: number, gap: number, cx: number, cy: number): Pt[] {
  const rows = Math.ceil(count / cols);
  const totalH = rows * cellH + Math.max(0, rows - 1) * gap;
  const out: Pt[] = [];
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(cols, count - r * cols);
    const y = cy - totalH / 2 + cellH / 2 + r * (cellH + gap);
    for (const p of rowLayout(inRow, cellW, gap, cx, y)) out.push(p);
  }
  return out;
}

/**
 * Text resolution for crisp text: the on-screen scale of the world times the device pixel ratio,
 * rounded up to a whole number and clamped to [1, max] (higher costs texture memory).
 */
export function textResolutionFor(displayWidth: number, worldWidth: number, devicePixelRatio: number, max = 3): number {
  if (!(displayWidth > 0) || !(worldWidth > 0)) return clamp(Math.ceil(devicePixelRatio || 1), 1, max);
  return clamp(Math.ceil((displayWidth / worldWidth) * (devicePixelRatio || 1) - 0.01), 1, max);
}

/** Width of a progress fill for a 0..1 value inside `inner` px, never thinner than a rounded cap. */
export function fillWidth(value: number, inner: number, minCap = 0): number {
  const v = clamp(Number.isFinite(value) ? value : 0, 0, 1);
  if (v <= 0) return 0;
  return Math.max(minCap, inner * v);
}
