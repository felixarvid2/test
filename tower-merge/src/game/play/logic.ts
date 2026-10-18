/**
 * Pure gameplay-scene logic (no Phaser): slot hit-testing and magnet, the drag state machine,
 * pool index mirroring, quality thresholds, sfx throttling, tutorial and overlay decisions.
 * Everything here is unit-tested in tests/play.
 */
import { FINGER_RADIUS, MAGNET_RADIUS } from './constants';

// ---------------------------------------------------------------------------------------------
// Slot hit-testing
// ---------------------------------------------------------------------------------------------

export interface SlotPos {
  id: number;
  x: number;
  y: number;
}

/** Id of the slot nearest to (x, y) within `radius`, or -1. Ties go to the lower id. */
export function nearestSlot(x: number, y: number, slots: readonly SlotPos[], radius = MAGNET_RADIUS): number {
  let best = -1;
  let bestD = radius * radius;
  for (let i = 0; i < slots.length; i++) {
    const dx = slots[i].x - x;
    const dy = slots[i].y - y;
    const d = dx * dx + dy * dy;
    if (d <= bestD && (best < 0 || d < bestD)) {
      bestD = d;
      best = slots[i].id;
    }
  }
  return best;
}

/**
 * Where a lifted tower would land: the slot nearest to the tower's drawn position (magnet
 * radius), else the slot under the raw finger (smaller radius, so dragging with the finger on
 * the target still works).
 */
export function resolveDropSlot(
  towerX: number, towerY: number, fingerX: number, fingerY: number, slots: readonly SlotPos[],
  magnet = MAGNET_RADIUS, fingerRadius = FINGER_RADIUS,
): number {
  const a = nearestSlot(towerX, towerY, slots, magnet);
  if (a >= 0) return a;
  return nearestSlot(fingerX, fingerY, slots, fingerRadius);
}

/** Slot whose tower graphic a press at (x, y) hits: a box from the tower top to its pad. */
export function pickTowerSlot(x: number, y: number, slots: readonly SlotPos[], halfW = 58, up = 88, down = 52): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < slots.length; i++) {
    const dx = x - slots[i].x;
    const dy = y - slots[i].y;
    if (Math.abs(dx) > halfW || dy < -up || dy > down) continue;
    const d = dx * dx + (dy + 20) * (dy + 20);
    if (d < bestD) {
      bestD = d;
      best = slots[i].id;
    }
  }
  return best;
}

export type TargetKind = 'merge' | 'move' | 'swap' | 'locked' | 'self';

export interface SlotInfo {
  unlocked: boolean;
  hasTower: boolean;
}

/** How dropping the tower from `from` onto `to` would resolve (drives the slot highlights). */
export function classifyTarget(
  from: number, to: number, slots: readonly SlotInfo[], canMerge: (from: number, to: number) => boolean,
): TargetKind {
  if (from === to) return 'self';
  const t = slots[to];
  if (!t || !t.unlocked) return 'locked';
  if (!t.hasTower) return 'move';
  return canMerge(from, to) ? 'merge' : 'swap';
}

// ---------------------------------------------------------------------------------------------
// Drag state machine
// ---------------------------------------------------------------------------------------------

export type DragPhase = 'idle' | 'pressed' | 'dragging';
export type DragMove = 'none' | 'lift' | 'drag';
export type DragRelease = { kind: 'none' } | { kind: 'tap'; slot: number } | { kind: 'drop'; slot: number };

/**
 * One drag at a time: pressed -> (moves past the threshold) dragging -> released. A release
 * before the threshold is a tap. Only the pointer that pressed is followed.
 */
export class DragMachine {
  phase: DragPhase = 'idle';
  pointerId = -1;
  slot = -1;
  startX = 0;
  startY = 0;
  x = 0;
  y = 0;

  constructor(readonly threshold = 8) {}

  press(pointerId: number, slot: number, x: number, y: number): boolean {
    if (this.phase !== 'idle' || slot < 0) return false;
    this.phase = 'pressed';
    this.pointerId = pointerId;
    this.slot = slot;
    this.startX = this.x = x;
    this.startY = this.y = y;
    return true;
  }

  move(pointerId: number, x: number, y: number): DragMove {
    if (this.phase === 'idle' || pointerId !== this.pointerId) return 'none';
    this.x = x;
    this.y = y;
    if (this.phase === 'dragging') return 'drag';
    const dx = x - this.startX;
    const dy = y - this.startY;
    if (dx * dx + dy * dy < this.threshold * this.threshold) return 'none';
    this.phase = 'dragging';
    return 'lift';
  }

  release(pointerId: number, x: number, y: number): DragRelease {
    if (this.phase === 'idle' || pointerId !== this.pointerId) return { kind: 'none' };
    const was = this.phase;
    const slot = this.slot;
    this.x = x;
    this.y = y;
    this.reset();
    return was === 'dragging' ? { kind: 'drop', slot } : { kind: 'tap', slot };
  }

  cancel(): void {
    this.reset();
  }

  private reset(): void {
    this.phase = 'idle';
    this.pointerId = -1;
    this.slot = -1;
  }
}

// ---------------------------------------------------------------------------------------------
// Pool mirroring
// ---------------------------------------------------------------------------------------------

export type MirrorChange = 'idle' | 'keep' | 'spawn' | 'despawn';

/**
 * Tracks which entity id each pooled view shows. The simulation's entity arrays are fixed pools:
 * a view mirrors index i, resets when the id at that index changes and hides when inactive.
 */
export class IdMirror {
  private readonly ids: Float64Array;
  private readonly shown: Uint8Array;

  constructor(size: number) {
    this.ids = new Float64Array(size).fill(-1);
    this.shown = new Uint8Array(size);
  }

  sync(i: number, active: boolean, id: number): MirrorChange {
    if (!active) {
      if (!this.shown[i]) return 'idle';
      this.shown[i] = 0;
      return 'despawn';
    }
    if (!this.shown[i] || this.ids[i] !== id) {
      this.shown[i] = 1;
      this.ids[i] = id;
      return 'spawn';
    }
    return 'keep';
  }

  isShown(i: number): boolean {
    return this.shown[i] === 1;
  }

  reset(): void {
    this.ids.fill(-1);
    this.shown.fill(0);
  }
}

// ---------------------------------------------------------------------------------------------
// Quality (auto degrade)
// ---------------------------------------------------------------------------------------------

export interface QualityPreset {
  /** Multiplier on particle counts. */
  particles: number;
  trails: boolean;
  /** Max simultaneous damage numbers. */
  damageNumbers: number;
  /** Small hit sparks / status particles. */
  hitSparks: boolean;
  /** Max 'damage' numbers spawned per frame. */
  numbersPerFrame: number;
}

export const QUALITY_PRESETS: readonly QualityPreset[] = [
  { particles: 1, trails: true, damageNumbers: 40, hitSparks: true, numbersPerFrame: 6 },
  { particles: 0.6, trails: false, damageNumbers: 24, hitSparks: true, numbersPerFrame: 3 },
  { particles: 0.3, trails: false, damageNumbers: 12, hitSparks: false, numbersPerFrame: 2 },
];

export interface QualityOptions {
  degradeBelow?: number;
  recoverAbove?: number;
  /** Seconds the average must stay bad before degrading. */
  degradeAfter?: number;
  /** Seconds the average must stay good before recovering one level. */
  recoverAfter?: number;
  warmup?: number;
}

/**
 * Rolling fps average over the last ~60 frames. Degrades one level when the average stays under
 * `degradeBelow` (48) for `degradeAfter` seconds and recovers one level after a long stretch above
 * `recoverAbove`. Frames longer than 250 ms (tab switch, hitch) are ignored.
 */
export class QualityMeter {
  level = 0;
  private readonly buf = new Float32Array(60);
  private n = 0;
  private head = 0;
  private sum = 0;
  private badFor = 0;
  private goodFor = 0;
  private age = 0;
  private locked = false;
  private readonly o: Required<QualityOptions>;

  constructor(opts: QualityOptions = {}) {
    this.o = { degradeBelow: 48, recoverAbove: 57, degradeAfter: 1.5, recoverAfter: 8, warmup: 2, ...opts };
  }

  /** Pins the level (debug flag ?q=0..2): the meter keeps measuring but never changes it. */
  lock(level: number): void {
    this.level = Math.max(0, Math.min(QUALITY_PRESETS.length - 1, Math.round(level)));
    this.locked = true;
  }

  get fps(): number {
    if (this.n === 0) return 60;
    return 1000 / (this.sum / this.n);
  }

  get preset(): QualityPreset {
    return QUALITY_PRESETS[this.level];
  }

  push(deltaMs: number): void {
    if (!(deltaMs > 0) || deltaMs > 250) return;
    if (this.n < this.buf.length) {
      this.n++;
    } else {
      this.sum -= this.buf[this.head];
    }
    this.buf[this.head] = deltaMs;
    this.sum += deltaMs;
    this.head = (this.head + 1) % this.buf.length;
    const dt = deltaMs / 1000;
    this.age += dt;
    if (this.locked || this.age < this.o.warmup || this.n < 30) return;
    const fps = this.fps;
    if (fps < this.o.degradeBelow) {
      this.badFor += dt;
      this.goodFor = 0;
      if (this.badFor >= this.o.degradeAfter && this.level < QUALITY_PRESETS.length - 1) {
        this.level++;
        this.badFor = 0;
        this.resetWindow();
      }
    } else if (fps > this.o.recoverAbove) {
      this.goodFor += dt;
      this.badFor = 0;
      if (this.goodFor >= this.o.recoverAfter && this.level > 0) {
        this.level--;
        this.goodFor = 0;
        this.resetWindow();
      }
    } else {
      this.badFor = 0;
      this.goodFor = 0;
    }
  }

  private resetWindow(): void {
    this.n = 0;
    this.head = 0;
    this.sum = 0;
  }
}

// ---------------------------------------------------------------------------------------------
// Sfx throttle
// ---------------------------------------------------------------------------------------------

/** Minimum gap per key plus a cap of plays per frame, so a busy board does not become noise. */
export class SfxThrottle {
  private readonly last = new Map<string, number>();
  private frame = -1;
  private inFrame = 0;

  constructor(private readonly perFrame = 5) {}

  allow(key: string, nowMs: number, gapMs: number, frame: number): boolean {
    if (frame !== this.frame) {
      this.frame = frame;
      this.inFrame = 0;
    }
    if (this.inFrame >= this.perFrame) return false;
    const last = this.last.get(key);
    if (gapMs > 0 && last !== undefined && nowMs - last < gapMs) return false;
    this.last.set(key, nowMs);
    this.inFrame++;
    return true;
  }
}

// ---------------------------------------------------------------------------------------------
// Merge feel
// ---------------------------------------------------------------------------------------------

/** 'merge' playback rate rises with the new level; levels 4-5 use the big sound instead. */
export function mergeSound(level: number): { key: 'merge' | 'merge_big'; rate: number } {
  if (level >= 4) return { key: 'merge_big', rate: level >= 5 ? 1.08 : 1 };
  return { key: 'merge', rate: 0.92 + (Math.max(2, level) - 2) * 0.1 };
}

/** Hitstop (ms) of a merge to the given new level: 50 ms at L2 up to 80 ms at L5. */
export const mergeHitstopMs = (level: number): number => Math.min(80, 50 + (level - 2) * 10);

// ---------------------------------------------------------------------------------------------
// Tower animation curves
// ---------------------------------------------------------------------------------------------

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 0.6 -> 1.25 -> 1 punch used when a merged tower appears (t in seconds). */
export function punchScale(t: number): number {
  if (t <= 0) return 0.6;
  if (t < 0.16) {
    const k = t / 0.16;
    return 0.6 + 0.65 * (1 - (1 - k) * (1 - k));
  }
  const k = clamp01((t - 0.16) / 0.5);
  // damped oscillation around 1 starting from 1.25
  return 1 + 0.25 * Math.cos(k * Math.PI * 2.4) * Math.pow(1 - k, 1.6);
}

/** Bounce-out landing used when a bought tower drops in (0..1 -> 0..1). */
export function bounceOut(k: number): number {
  if (k < 1 / 2.75) return 7.5625 * k * k;
  if (k < 2 / 2.75) { k -= 1.5 / 2.75; return 7.5625 * k * k + 0.75; }
  if (k < 2.5 / 2.75) { k -= 2.25 / 2.75; return 7.5625 * k * k + 0.9375; }
  k -= 2.625 / 2.75;
  return 7.5625 * k * k + 0.984375;
}

// ---------------------------------------------------------------------------------------------
// Tutorial and overlay decisions
// ---------------------------------------------------------------------------------------------

export type TutorialStep = 'buy' | 'merge' | 'none';

export interface TutorialInput {
  firstRunDone: boolean;
  mergeHintShown: boolean;
  towersBought: number;
  towersMerged: number;
  coins: number;
  buyCost: number;
  hasFreeSlot: boolean;
  /** Two towers on the board share type and level (and can merge). */
  hasPair: boolean;
}

/** Which first-run hint to show now. */
export function tutorialStep(i: TutorialInput): TutorialStep {
  if (i.firstRunDone) return 'none';
  if (i.towersMerged > 0) return 'none';
  if (i.hasPair) return 'merge';
  if (i.towersBought === 0 && i.coins >= i.buyCost && i.hasFreeSlot) return 'buy';
  return 'none';
}

export type BlockingOverlay = 'Upgrade' | 'Event' | 'GameOver';

/** The overlay a run phase needs, or null. */
export function overlayForPhase(phase: string): BlockingOverlay | null {
  switch (phase) {
    case 'upgrade': return 'Upgrade';
    case 'event': return 'Event';
    case 'defeated': return 'GameOver';
    default: return null;
  }
}

/** Boss reward offer: only when a reward can be claimed and a slot is free to receive the tower. */
export function shouldOfferRareTower(gate: string, hasFreeUnlockedSlot: boolean): boolean {
  return gate !== 'none' && hasFreeUnlockedSlot;
}

/** The emergency power is offered once per run on the prewave of a boss wave. */
export function shouldOfferEmergency(gate: string, isBossWave: boolean, alreadyOffered: boolean): boolean {
  return isBossWave && !alreadyOffered && gate !== 'none';
}

/** Ability buttons fill slots nearest the BUY button first; returns x for each of `count` buttons. */
export function abilityButtonXs(count: number): number[] {
  const order = [165, 555, 62, 658];
  return order.slice(0, count);
}

/** Damage number text: whole numbers, compact above 10k. */
export function damageLabel(amount: number): string {
  const v = Math.max(1, Math.round(amount));
  if (v >= 10000) return `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}k`;
  return String(v);
}
