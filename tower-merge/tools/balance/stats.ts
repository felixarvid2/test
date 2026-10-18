/** Small statistics and text-table helpers for the balance report. */

export const mean = (a: readonly number[]): number => (a.length === 0 ? NaN : a.reduce((s, v) => s + v, 0) / a.length);

export function percentile(a: readonly number[], p: number): number {
  if (a.length === 0) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

export const median = (a: readonly number[]): number => percentile(a, 0.5);

export function stdErr(a: readonly number[]): number {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1) / a.length);
}

export const fmt = (v: number, digits = 1): string => (Number.isFinite(v) ? v.toFixed(digits) : '-');
export const pct = (v: number, digits = 0): string => (Number.isFinite(v) ? `${(v * 100).toFixed(digits)}%` : '-');
export const signed = (v: number, digits = 2): string => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(digits)}` : '-');

/** Left-aligned first column, right-aligned others, two-space gutters. */
export function table(head: string[], rows: (string | number)[][]): string {
  const all = [head, ...rows.map((r) => r.map(String))];
  const w = head.map((_, c) => Math.max(...all.map((r) => r[c].length)));
  const line = (r: string[]): string => r.map((cell, c) => (c === 0 ? cell.padEnd(w[c]) : cell.padStart(w[c]))).join('  ');
  return [line(head), w.map((n) => '-'.repeat(n)).join('  '), ...all.slice(1).map(line)].join('\n');
}

/** Groups items by a key function, keeping insertion order. */
export function groupBy<T>(items: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const g = m.get(k);
    if (g) g.push(it);
    else m.set(k, [it]);
  }
  return m;
}
