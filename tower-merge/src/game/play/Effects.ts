import Phaser from 'phaser';
import { services } from '../../services';
import type { SfxKey } from '../../audio/keys';
import { ELEMENT_COLORS, D } from './constants';
import { SfxThrottle, type QualityMeter } from './logic';
import { TEX } from './textures';

/** Texture-free pooled animation record (rings, glows, pops, flying coins ...). */
interface Anim {
  img: Phaser.GameObjects.Image;
  on: boolean;
  t: number;
  dur: number;
  x0: number; y0: number; x1: number; y1: number;
  s0: number; s1: number;
  a0: number; a1: number;
  r0: number; r1: number;
  arc: number;
  ease: number;
  tex: number;
  /** Called once when the animation ends (e.g. a coin reaching the pill). */
  done: ((x: number, y: number) => void) | null;
}

export interface AnimOpts {
  tx?: number;
  ty?: number;
  rot0?: number;
  rot1?: number;
  /** 0 = ease-out quad (default), 1 = linear, 2 = ease-in quad. */
  ease?: number;
  arc?: number;
  additive?: boolean;
  depth?: number;
  flipX?: boolean;
  done?: (x: number, y: number) => void;
}

interface Beam {
  on: boolean;
  t: number;
  dur: number;
  x1: number; y1: number; x2: number; y2: number;
  color: number;
  width: number;
}

const CHAIN_BUF = 160;
interface Chain {
  on: boolean;
  t: number;
  dur: number;
  n: number;
  color: number;
  jitterT: number;
  px: Float32Array;
  py: Float32Array;
  xs: Float32Array;
  ys: Float32Array;
  pn: number;
}

const ANIM_CAP = 200;
const BEAM_CAP = 10;
const CHAIN_CAP = 8;

/**
 * Juice toolbox: shared particle emitters (explode-on-demand), pooled sprite animations, beam and
 * chain-lightning lines, screen shake, flash, hitstop and slow motion. Honours reducedMotion and
 * settings.screenShake, and scales particle counts with the Quality preset. Nothing here allocates
 * per frame; spawn calls reuse the oldest slot when a pool is full.
 */
export class Effects {
  readonly cam: Phaser.Cameras.Scene2D.Camera;
  /** Multiplies the simulation step (boss slow motion). */
  timeScale = 1;
  /** Seconds of simulation freeze left (merge hitstop). */
  hitstopLeft = 0;

  private slowLeft = 0;
  private shakeAmp = 0;
  private shakeLeft = 0;
  private shakeDur = 0;
  private readonly flashRect: Phaser.GameObjects.Rectangle;
  private flashT = 0;
  private flashDur = 0;
  private flashA = 0;

  readonly spark: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly star: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly puff: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly ember: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly bubble: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly flame: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly plus: Phaser.GameObjects.Particles.ParticleEmitter;

  private readonly anims: Anim[] = [];
  private animNext = 0;
  private readonly beams: Beam[] = [];
  private beamNext = 0;
  private readonly chains: Chain[] = [];
  private chainNext = 0;
  private readonly lines: Phaser.GameObjects.Graphics;
  private linesDirty = false;
  private readonly sfxThrottle = new SfxThrottle(7);
  private frame = 0;

  constructor(private readonly scene: Phaser.Scene, readonly quality: QualityMeter) {
    this.cam = scene.cameras.main;
    this.flashRect = scene.add.rectangle(360, 640, 720, 1280, 0xffffff, 0)
      .setScrollFactor(0).setDepth(D.screen).setVisible(false);

    const mk = (tex: string, depth: number, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig) => {
      const e = scene.add.particles(0, 0, tex, { emitting: false, maxAliveParticles: 260, ...cfg });
      e.setDepth(depth);
      return e;
    };
    const ADD = Phaser.BlendModes.ADD;
    this.spark = mk('fx_spark', D.fx, {
      lifespan: { min: 240, max: 520 }, speed: { min: 80, max: 270 }, scale: { start: 0.6, end: 0 }, alpha: { start: 1, end: 0 }, blendMode: ADD,
    });
    this.star = mk('fx_star', D.fxTop, {
      lifespan: { min: 500, max: 900 }, speed: { min: 120, max: 360 }, scale: { start: 0.7, end: 0 }, alpha: { start: 1, end: 0 },
      rotate: { min: -240, max: 240 }, gravityY: 320, blendMode: ADD,
    });
    this.puff = mk('fx_smoke', D.fx, {
      lifespan: { min: 380, max: 760 }, speed: { min: 14, max: 70 }, scale: { start: 0.25, end: 0.95 }, alpha: { start: 0.75, end: 0 },
      rotate: { min: -90, max: 90 },
    });
    this.ember = mk('fx_spark', D.fx, {
      lifespan: { min: 380, max: 700 }, speed: { min: 8, max: 40 }, gravityY: -70, scale: { start: 0.38, end: 0 }, alpha: { start: 1, end: 0 }, blendMode: ADD,
    });
    this.bubble = mk('fx_ring', D.fx, {
      lifespan: { min: 520, max: 900 }, speed: { min: 6, max: 26 }, gravityY: -46, scale: { start: 0.12, end: 0.3 }, alpha: { start: 0.95, end: 0 },
    });
    this.flame = mk(TEX.flame, D.fx, {
      lifespan: { min: 260, max: 420 }, speed: { min: 60, max: 120 }, scale: { start: 0.55, end: 0.1 }, alpha: { start: 0.95, end: 0 }, blendMode: ADD,
    });
    this.plus = mk(TEX.plus, D.fxTop, {
      lifespan: { min: 600, max: 900 }, speed: { min: 20, max: 60 }, gravityY: -80, scale: { start: 0.55, end: 0.2 }, alpha: { start: 1, end: 0 },
    });

    for (let i = 0; i < ANIM_CAP; i++) {
      const img = scene.add.image(0, 0, TEX.dot).setVisible(false);
      this.anims.push({
        img, on: false, t: 0, dur: 1, x0: 0, y0: 0, x1: 0, y1: 0, s0: 1, s1: 1, a0: 1, a1: 0, r0: 0, r1: 0, arc: 0, ease: 0, tex: 32, done: null,
      });
    }
    for (let i = 0; i < BEAM_CAP; i++) this.beams.push({ on: false, t: 0, dur: 0.12, x1: 0, y1: 0, x2: 0, y2: 0, color: 0xffffff, width: 6 });
    for (let i = 0; i < CHAIN_CAP; i++) {
      this.chains.push({
        on: false, t: 0, dur: 0.16, n: 0, color: 0xfff07a, jitterT: 0,
        px: new Float32Array(32), py: new Float32Array(32), pn: 0, xs: new Float32Array(CHAIN_BUF), ys: new Float32Array(CHAIN_BUF),
      });
    }
    this.lines = scene.add.graphics().setDepth(D.fxTop).setBlendMode(ADD);
  }

  // --- settings ---------------------------------------------------------------------------------

  get reduced(): boolean {
    try { return services.save.data.settings.reducedMotion === true; } catch { return false; }
  }

  private get shakeEnabled(): boolean {
    try {
      const s = services.save.data.settings;
      return s.screenShake !== false && !s.reducedMotion;
    } catch {
      return true;
    }
  }

  /** Particle count scaled by the quality preset (and reduced motion). */
  private count(n: number): number {
    const k = this.quality.preset.particles * (this.reduced ? 0.4 : 1);
    return Math.max(0, Math.round(n * k));
  }

  /** Plays a sound with a per-frame cap and a minimum gap (rapid shots stay a quiet pattern). */
  sfx(key: SfxKey, opts?: { volume?: number; rate?: number; gapMs?: number }): void {
    if (!this.sfxThrottle.allow(key, this.scene.time.now, opts?.gapMs ?? 0, this.frame)) return;
    try {
      services.audio.play(key, { volume: opts?.volume, rate: opts?.rate });
    } catch { /* audio is optional */ }
  }

  // --- frame update -----------------------------------------------------------------------------

  update(dt: number): void {
    this.frame++;
    if (this.hitstopLeft > 0) this.hitstopLeft = Math.max(0, this.hitstopLeft - dt);
    if (this.slowLeft > 0) {
      this.slowLeft -= dt;
      if (this.slowLeft <= 0) this.timeScale = 1;
    }
    // screen shake: jitter the camera scroll (HUD objects use scrollFactor 0 and stay put)
    if (this.shakeLeft > 0) {
      this.shakeLeft -= dt;
      const k = Math.max(0, this.shakeLeft / this.shakeDur);
      const a = this.shakeAmp * k * k;
      this.cam.setScroll((Math.random() * 2 - 1) * a, (Math.random() * 2 - 1) * a);
      if (this.shakeLeft <= 0) { this.shakeAmp = 0; this.cam.setScroll(0, 0); }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flashRect.setVisible(false);
      else this.flashRect.setFillStyle(this.flashRect.fillColor, this.flashA * (this.flashT / this.flashDur));
    }
    const anims = this.anims;
    for (let i = 0; i < anims.length; i++) {
      const a = anims[i];
      if (!a.on) continue;
      a.t += dt;
      const k = a.t >= a.dur ? 1 : a.t / a.dur;
      const e = a.ease === 1 ? k : a.ease === 2 ? k * k : 1 - (1 - k) * (1 - k);
      const s = (a.s0 + (a.s1 - a.s0) * e) / a.tex;
      a.img.setPosition(a.x0 + (a.x1 - a.x0) * k, a.y0 + (a.y1 - a.y0) * e - Math.sin(Math.PI * k) * a.arc);
      a.img.setScale(s);
      a.img.setAlpha(a.a0 + (a.a1 - a.a0) * (a.ease === 1 ? k : e));
      if (a.r0 !== a.r1) a.img.setRotation(a.r0 + (a.r1 - a.r0) * k);
      if (k >= 1) {
        a.on = false;
        a.img.setVisible(false);
        if (a.done) { const f = a.done; a.done = null; f(a.x1, a.y1); }
      }
    }
    this.drawLines(dt);
  }

  // --- screen juice -----------------------------------------------------------------------------

  shake(amp: number, ms: number): void {
    if (!this.shakeEnabled) return;
    const dur = ms / 1000;
    if (this.shakeLeft > 0 && amp * amp < this.shakeAmp * this.shakeAmp * (this.shakeLeft / this.shakeDur)) return;
    this.shakeAmp = amp;
    this.shakeLeft = this.shakeDur = dur;
  }

  flash(color: number, alpha: number, ms: number): void {
    if (this.reduced) return;
    this.flashA = alpha;
    this.flashT = this.flashDur = ms / 1000;
    this.flashRect.setFillStyle(color, alpha).setVisible(true);
  }

  hitstop(ms: number): void {
    if (this.reduced) return;
    this.hitstopLeft = Math.max(this.hitstopLeft, ms / 1000);
  }

  slowmo(scale: number, ms: number): void {
    if (this.reduced) return;
    this.timeScale = scale;
    this.slowLeft = ms / 1000;
  }

  // --- pooled sprite animations -----------------------------------------------------------------

  /** Generic sprite animation: size and alpha interpolate over `dur` seconds. Returns nothing (fire and forget). */
  anim(
    tex: string, x: number, y: number, size0: number, size1: number, a0: number, a1: number, dur: number, tint: number,
    o?: AnimOpts,
  ): void {
    if (!this.scene.textures.exists(tex)) return;
    const a = this.anims[this.animNext];
    this.animNext = (this.animNext + 1) % this.anims.length;
    // a recycled slot that still had a completion callback: finish it so coins are never lost
    if (a.on && a.done) { const f = a.done; a.done = null; f(a.x1, a.y1); }
    a.on = true;
    a.t = 0;
    a.dur = Math.max(0.016, dur);
    a.x0 = x; a.y0 = y;
    a.x1 = o?.tx ?? x; a.y1 = o?.ty ?? y;
    a.s0 = size0; a.s1 = size1;
    a.a0 = a0; a.a1 = a1;
    a.r0 = o?.rot0 ?? 0; a.r1 = o?.rot1 ?? 0;
    a.arc = o?.arc ?? 0;
    a.ease = o?.ease ?? 0;
    a.done = o?.done ?? null;
    const img = a.img;
    img.setTexture(tex);
    a.tex = img.width || 64;
    img.setTint(tint).setFlipX(o?.flipX ?? false).setDepth(o?.depth ?? D.fx)
      .setBlendMode(o?.additive === false ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD)
      .setPosition(x, y).setScale(size0 / a.tex).setAlpha(a0).setRotation(a.r0).setVisible(true);
  }

  /** Expanding ring (diameters r0 -> r1 in px). */
  ring(x: number, y: number, color: number, d0: number, d1: number, ms: number, alpha = 0.9): void {
    this.anim('fx_ring', x, y, d0, d1, alpha, 0, ms / 1000, color);
  }

  /** Soft additive flash. */
  glow(x: number, y: number, color: number, d0: number, d1: number, ms: number, alpha = 0.9): void {
    this.anim('fx_glow', x, y, d0, d1, alpha, 0, ms / 1000, color);
  }

  // --- particles --------------------------------------------------------------------------------

  private emit(e: Phaser.GameObjects.Particles.ParticleEmitter, x: number, y: number, n: number, color: number): void {
    const c = this.count(n);
    if (c <= 0) return;
    e.setParticleTint(color);
    e.emitParticleAt(x, y, c);
  }

  sparks(x: number, y: number, color: number, n = 8): void { this.emit(this.spark, x, y, n, color); }
  stars(x: number, y: number, color: number, n = 10): void { this.emit(this.star, x, y, n, color); }
  puffs(x: number, y: number, n = 5, color = 0xffffff): void { this.emit(this.puff, x, y, n, color); }
  embers(x: number, y: number, n = 1, color = 0xff9a3a): void { this.emit(this.ember, x, y, n, color); }
  bubbles(x: number, y: number, n = 1, color = 0xa6f06a): void { this.emit(this.bubble, x, y, n, color); }
  pluses(x: number, y: number, n = 4, color = 0x7dff8a): void { this.emit(this.plus, x, y, n, color); }

  /** Dust cloud (brown-grey) for landings and unlocks. */
  dust(x: number, y: number, n = 6): void { this.emit(this.puff, x, y, n, 0xd9c8a8); }

  /** One particle flung in a given direction (cone sprays, ice shards ...). */
  directed(
    e: Phaser.GameObjects.Particles.ParticleEmitter, x: number, y: number, angle: number, speed: number, color: number,
  ): void {
    e.setParticleTint(color);
    const p = e.emitParticleAt(x, y, 1);
    if (p) {
      p.velocityX = Math.cos(angle) * speed;
      p.velocityY = Math.sin(angle) * speed;
    }
  }

  // --- combat effects ---------------------------------------------------------------------------

  /** Fire spray of a cone attack from (x, y) along `angle` for `range` px. */
  cone(x: number, y: number, angle: number, range: number): void {
    const n = this.count(5);
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * 0.9;
      const sp = range * (2.0 + Math.random() * 1.1);
      this.directed(this.flame, x + Math.cos(a) * 18, y + Math.sin(a) * 18, a, sp, Math.random() < 0.45 ? 0xffd25a : 0xff6a2b);
    }
  }

  /** Bright hitscan line that fades in ~120 ms. */
  beam(x1: number, y1: number, x2: number, y2: number, color: number, crit: boolean): void {
    const b = this.beams[this.beamNext];
    this.beamNext = (this.beamNext + 1) % this.beams.length;
    b.on = true;
    b.t = 0;
    b.dur = 0.13;
    b.x1 = x1; b.y1 = y1; b.x2 = x2; b.y2 = y2;
    b.color = color;
    b.width = crit ? 10 : 6;
    this.linesDirty = true;
    this.glow(x2, y2, color, 20, crit ? 120 : 80, 160, 0.9);
    this.sparks(x2, y2, color, crit ? 10 : 6);
  }

  /** Jagged lightning through enemy points; re-jitters while it fades (~160 ms). */
  chain(points: readonly { x: number; y: number }[], color: number): void {
    if (points.length < 2) return;
    const c = this.chains[this.chainNext];
    this.chainNext = (this.chainNext + 1) % this.chains.length;
    c.on = true;
    c.t = 0;
    c.dur = 0.16;
    c.color = color;
    c.jitterT = 0;
    const n = Math.min(points.length, c.px.length);
    for (let i = 0; i < n; i++) { c.px[i] = points[i].x; c.py[i] = points[i].y; }
    c.pn = n;
    this.jitterChain(c);
    this.linesDirty = true;
    for (let i = 1; i < n; i += 1) {
      if (i > 6) break;
      this.glow(points[i].x, points[i].y, color, 16, 56, 140, 0.8);
    }
  }

  private jitterChain(c: Chain): void {
    let k = 0;
    const SUB = 4;
    for (let i = 0; i < c.pn - 1 && k < CHAIN_BUF - SUB - 1; i++) {
      const x0 = c.px[i], y0 = c.py[i], x1 = c.px[i + 1], y1 = c.py[i + 1];
      const dx = x1 - x0, dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const amp = Math.min(14, len * 0.16);
      c.xs[k] = x0; c.ys[k] = y0; k++;
      for (let s = 1; s < SUB; s++) {
        const t = s / SUB;
        const j = (Math.random() * 2 - 1) * amp;
        c.xs[k] = x0 + dx * t + nx * j;
        c.ys[k] = y0 + dy * t + ny * j;
        k++;
      }
    }
    c.xs[k] = c.px[c.pn - 1]; c.ys[k] = c.py[c.pn - 1]; k++;
    c.n = k;
  }

  private drawLines(dt: number): void {
    if (!this.linesDirty) return;
    const g = this.lines;
    g.clear();
    let any = false;
    for (let i = 0; i < this.beams.length; i++) {
      const b = this.beams[i];
      if (!b.on) continue;
      b.t += dt;
      if (b.t >= b.dur) { b.on = false; continue; }
      any = true;
      const k = 1 - b.t / b.dur;
      g.lineStyle(b.width * 3.2, b.color, 0.22 * k).lineBetween(b.x1, b.y1, b.x2, b.y2);
      g.lineStyle(b.width * 1.6, b.color, 0.55 * k).lineBetween(b.x1, b.y1, b.x2, b.y2);
      g.lineStyle(b.width * 0.5, 0xffffff, 0.95 * k).lineBetween(b.x1, b.y1, b.x2, b.y2);
    }
    for (let i = 0; i < this.chains.length; i++) {
      const c = this.chains[i];
      if (!c.on) continue;
      c.t += dt;
      if (c.t >= c.dur) { c.on = false; continue; }
      any = true;
      c.jitterT += dt;
      if (c.jitterT > 0.05) { c.jitterT = 0; this.jitterChain(c); }
      const k = 1 - c.t / c.dur;
      for (let pass = 0; pass < 3; pass++) {
        if (pass === 0) g.lineStyle(14, c.color, 0.25 * k);
        else if (pass === 1) g.lineStyle(6, c.color, 0.7 * k);
        else g.lineStyle(2.5, 0xffffff, 0.95 * k);
        g.beginPath();
        g.moveTo(c.xs[0], c.ys[0]);
        for (let j = 1; j < c.n; j++) g.lineTo(c.xs[j], c.ys[j]);
        g.strokePath();
      }
    }
    if (!any) this.linesDirty = false;
  }

  /** Element-coloured blast sized by radius: flash, ring, sparks and a puff of dust/smoke. */
  explosion(x: number, y: number, radius: number, element: string): void {
    const color = ELEMENT_COLORS[element] ?? ELEMENT_COLORS.physical;
    const r = Math.max(20, radius);
    this.glow(x, y, 0xffffff, r * 1.0, r * 2.1, 200, 0.5);
    this.glow(x, y, color, r * 1.4, r * 2.8, 300, 0.5);
    this.ring(x, y, color, r * 0.7, r * 2.4, 340, 0.95);
    const n = 5 + r / 7;
    switch (element) {
      case 'frost':
        this.stars(x, y, 0xbfeeff, n * 0.8);
        this.sparks(x, y, 0xffffff, n * 0.6);
        break;
      case 'poison':
        this.bubbles(x, y, n * 0.6, 0x9be85a);
        this.puffs(x, y, 3 + r / 20, 0x8be04e);
        this.sparks(x, y, color, n * 0.5);
        break;
      case 'arcane':
        this.stars(x, y, color, n * 0.7);
        this.sparks(x, y, 0xffffff, n * 0.5);
        break;
      case 'lightning':
        this.sparks(x, y, color, n);
        break;
      case 'fire':
        this.sparks(x, y, color, n);
        this.embers(x, y, n * 0.6);
        this.puffs(x, y, 2 + r / 24, 0x6a5a52);
        break;
      default:
        this.sparks(x, y, 0xffe2b0, n * 0.8);
        this.puffs(x, y, 3 + r / 18, 0xcdb594);
    }
    if (r >= 70) this.shake(r >= 95 ? 6 : 3, 180);
    this.sfx(r >= 80 ? 'explosion_big' : 'explosion', { volume: r >= 80 ? 0.9 : 0.55, gapMs: 60 });
  }

  /** Expanding glow only (no sound), used for hit impacts of lobbed shells etc. */
  impact(x: number, y: number, color: number, size = 34): void {
    this.glow(x, y, color, size * 0.5, size * 1.6, 160, 0.8);
    if (this.quality.preset.hitSparks) this.sparks(x, y, color, 3);
  }

  /** Remove everything running (scene restart safety). */
  clear(): void {
    for (const a of this.anims) { a.on = false; a.done = null; a.img.setVisible(false); }
    for (const b of this.beams) b.on = false;
    for (const c of this.chains) c.on = false;
    this.lines.clear();
    this.linesDirty = false;
    this.timeScale = 1;
    this.hitstopLeft = 0;
    try { this.cam.setScroll(0, 0); } catch { /* camera already gone */ }
  }
}
