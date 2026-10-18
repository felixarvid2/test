// Small, fast, seeded PRNG (sfc32) with deterministic forked streams. No Math.random in game rules, so
// a seed fully determines rooms, offers and loot (the daily challenge relies on this).

/** 32-bit string hash (FNV-1a). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** splitmix32: turns any integer into a well-mixed 32-bit value (used for seeding). */
function mix(x: number): number {
  x = (x + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return (x ^ (x >>> 15)) >>> 0;
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  private readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    const s0 = mix(this.seed);
    const s1 = mix(s0);
    const s2 = mix(s1);
    const s3 = mix(s2);
    this.a = s0;
    this.b = s1;
    this.c = s2;
    this.d = s3;
    for (let i = 0; i < 12; i++) this.next(); // warm up
  }

  /** Uniform in [0, 1). */
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick: empty array');
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Picks by weight; items with weight <= 0 are never picked (unless all are, then the first is). */
  weighted<T>(items: readonly T[], weight: (t: T) => number): T {
    if (items.length === 0) throw new Error('Rng.weighted: empty array');
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return items[0];
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }

  /** Fisher-Yates; returns a new array. */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = out[i];
      out[i] = out[j];
      out[j] = t;
    }
    return out;
  }

  /**
   * Independent stream derived from this generator's seed and a label. It does not depend on how many
   * numbers were drawn, so adding a draw to one stream never shifts another.
   */
  fork(label: string): Rng {
    return new Rng(mix(this.seed ^ hashString(label)));
  }

  /** Internal state (for debugging / snapshots). */
  get state(): readonly [number, number, number, number] {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }
}

/** UTC date as YYYY-MM-DD. */
export function todayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function dailySeed(key: string): number {
  return mix(hashString('daily:' + key));
}

/** A fresh seed for a normal run. */
export function newSeed(): number {
  const t = Date.now() >>> 0;
  return mix(t ^ Math.floor(Math.random() * 0x100000000));
}
