import { BALANCE } from '../../../config/balance';
import type { BossAttackId } from '../../../core/types';
import { EXTRA_KEY } from '../../assets';
import type { AttackCtx, AttackFn, BossController } from '../BossController';
import { PLAY, clamp } from '../layout';
import type { World } from '../World';

// Small helpers the newer boss modules share.

export interface Spot {
  x: number;
  y: number;
}

/** Scratch state of one boss that outlives single attacks (webs, hop timer, glow...). */
export function stateFor<T>(map: WeakMap<BossController, T>, c: BossController, make: () => T): T {
  let s = map.get(c);
  if (!s) {
    s = make();
    map.set(c, s);
  }
  return s;
}

/** Living enemies with this def id. */
export function countAlive(w: World, id: string): number {
  let n = 0;
  for (const e of w.enemies.all) if (e.active && !e.dying && e.def.id === id) n++;
  return n;
}

/**
 * A random floor point clear of `avoid` (by `gap`) and at least `fromHero` from the hero (and at most
 * `maxFromHero`). Falls back to the best of the tries rather than failing.
 */
export function pickSpot(w: World, avoid: readonly Spot[], gap: number, fromHero: number, margin = 70, maxFromHero = Infinity): Spot {
  const p = w.player;
  let best: Spot = { x: clamp(p.x, PLAY.left + margin, PLAY.right - margin), y: PLAY.top + 160 };
  let bestScore = -Infinity;
  for (let i = 0; i < 28; i++) {
    const x = PLAY.left + margin + w.rng.next() * (PLAY.right - PLAY.left - margin * 2);
    const y = PLAY.top + margin + 40 + w.rng.next() * (PLAY.bottom - PLAY.top - margin * 2 - 60);
    let score = Math.min(Math.hypot(x - p.x, y - p.y) - fromHero, maxFromHero - Math.hypot(x - p.x, y - p.y));
    for (const a of avoid) score = Math.min(score, Math.hypot(x - a.x, y - a.y) - gap);
    if (score >= 0) return { x, y };
    if (score > bestScore) { bestScore = score; best = { x, y }; }
  }
  return best;
}

/**
 * A sprite that flies a parabolic arc from (sx, sy) to (tx, ty) in `dur` s and is destroyed on arrival
 * (or with the boss). The ground shadow travels along the straight line.
 */
export function lob(c: BossController, frame: string, scale: number, sx: number, sy: number, tx: number, ty: number, dur: number, height: number, spin = 0): void {
  const w = c.w;
  const img = c.track(w.scene.add.image(sx, sy, EXTRA_KEY, frame).setScale(scale).setDepth(430));
  const shadow = c.track(w.scene.add.image(sx, sy, EXTRA_KEY, 'shadow').setScale(0.8).setAlpha(0.2).setDepth(6));
  c.run(dur, (p) => {
    const x = sx + (tx - sx) * p;
    const y = sy + (ty - sy) * p;
    img.setPosition(x, y - Math.sin(Math.PI * p) * height).setRotation(spin * p);
    shadow.setPosition(x, y).setAlpha(0.15 + 0.35 * p);
  }, () => {
    c.release(img);
    c.release(shadow);
  });
}

/** Runs another attack of the same boss in place of this one (e.g. nothing to summon: do something else). */
export function reroute(a: AttackCtx, id: BossAttackId, fn: AttackFn): number {
  const tune = BALANCE.bossAttacks[id];
  return fn({ ...a, tune, dmg: Math.max(1, Math.round(a.boss.dmg * tune.damage)) });
}
