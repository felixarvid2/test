import Phaser from 'phaser';
import { BALANCE } from '../../config/balance';
import { EXTRA_KEY } from '../assets';
import { services } from '../../services';
import { H, W } from '../ui/kit';
import { TAU } from './layout';

// Juice: pooled particles, rings, sprite animations, jagged lightning, screen shake / flash / hitstop.
// Everything honours settings.reducedMotion / screenShake. Pools have fixed caps, nothing is created
// per frame; spawn calls reuse the oldest slot when a pool is full.

export const FX_RING = 'fx_ring';
export const FX_GLOW = 'fx_glow';
export const FX_VIGNETTE = 'fx_vignette';

/** Generates the shared radial-gradient / ring textures once. */
export function ensureFxTextures(scene: Phaser.Scene): void {
  const tm = scene.textures;
  if (!tm.exists(FX_RING)) {
    const t = tm.createCanvas(FX_RING, 128, 128);
    if (t) {
      const c = t.getContext();
      c.strokeStyle = '#ffffff';
      c.lineWidth = 7;
      c.beginPath();
      c.arc(64, 64, 59, 0, TAU);
      c.stroke();
      t.refresh();
      t.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  }
  if (!tm.exists(FX_GLOW)) {
    const t = tm.createCanvas(FX_GLOW, 128, 128);
    if (t) {
      const c = t.getContext();
      const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 128);
      t.refresh();
      t.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  }
  if (!tm.exists(FX_VIGNETTE)) {
    const t = tm.createCanvas(FX_VIGNETTE, 144, 256);
    if (t) {
      const c = t.getContext();
      const g = c.createRadialGradient(72, 128, 40, 72, 128, 150);
      g.addColorStop(0, 'rgba(8,4,16,0)');
      g.addColorStop(0.6, 'rgba(8,4,16,0.18)');
      g.addColorStop(1, 'rgba(8,4,16,0.78)');
      c.fillStyle = g;
      c.fillRect(0, 0, 144, 256);
      t.refresh();
      t.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  }
}

interface Particle {
  img: Phaser.GameObjects.Image;
  on: boolean;
  x: number; y: number; vx: number; vy: number; g: number;
  life: number; max: number;
  s0: number; s1: number; a0: number;
  rot: number; vr: number;
}

interface Ring {
  img: Phaser.GameObjects.Image;
  on: boolean;
  life: number; max: number;
  r0: number; r1: number; a0: number;
}

interface Anim {
  img: Phaser.GameObjects.Image;
  on: boolean;
  life: number; max: number;
  mode: number; // 0 linear, 1 squash-pop, 2 flash (hold then fade)
  sx0: number; sy0: number; sx1: number; sy1: number;
  a0: number; a1: number;
  vx: number; vy: number; vr: number;
}

interface Bolt {
  on: boolean;
  life: number; max: number;
  n: number;
  pts: Float32Array;
  color: number;
}

const MAX_RINGS = 24;
const MAX_ANIMS = 48;
const MAX_BOLTS = 16;
const BOLT_SEGMENTS = 7;

export class Effects {
  /** Set by hitstop(); GameScene freezes simulation time while it is above 0. */
  hitstopLeft = 0;

  private readonly parts: Particle[] = [];
  private nextPart = 0;
  private readonly rings: Ring[] = [];
  private nextRing = 0;
  private readonly anims: Anim[] = [];
  private nextAnim = 0;
  private readonly bolts: Bolt[] = [];
  private nextBolt = 0;
  private readonly boltGfx: Phaser.GameObjects.Graphics;
  private readonly flashRect: Phaser.GameObjects.Rectangle;
  private flashLeft = 0;
  private flashMax = 1;
  private flashAlpha = 0;
  private trauma = 0;
  private readonly cam: Phaser.Cameras.Scene2D.Camera;
  /** Where homing particles (soul wisps) fly to. */
  targetX = W / 2;
  targetY = H / 2;
  private readonly wisps: { on: boolean; x: number; y: number; vx: number; vy: number; life: number; img: Phaser.GameObjects.Image; tint: number }[] = [];

  constructor(scene: Phaser.Scene) {
    ensureFxTextures(scene);
    this.cam = scene.cameras.main;
    const cap = BALANCE.limits.maxParticles;
    for (let i = 0; i < cap; i++) {
      const img = scene.add.image(0, 0, EXTRA_KEY, 'spark').setVisible(false).setDepth(410);
      this.parts.push({ img, on: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1, s0: 1, s1: 0, a0: 1, rot: 0, vr: 0 });
    }
    for (let i = 0; i < MAX_RINGS; i++) {
      const img = scene.add.image(0, 0, FX_RING).setVisible(false).setDepth(405);
      this.rings.push({ img, on: false, life: 0, max: 1, r0: 0, r1: 1, a0: 1 });
    }
    for (let i = 0; i < MAX_ANIMS; i++) {
      const img = scene.add.image(0, 0, EXTRA_KEY, 'spark').setVisible(false).setDepth(420);
      this.anims.push({ img, on: false, life: 0, max: 1, mode: 0, sx0: 1, sy0: 1, sx1: 1, sy1: 1, a0: 1, a1: 0, vx: 0, vy: 0, vr: 0 });
    }
    for (let i = 0; i < MAX_BOLTS; i++) {
      this.bolts.push({ on: false, life: 0, max: 1, n: 0, pts: new Float32Array((BOLT_SEGMENTS + 1) * 2), color: 0xfff36b });
    }
    for (let i = 0; i < 16; i++) {
      const img = scene.add.image(0, 0, EXTRA_KEY, 'spark').setVisible(false).setDepth(415).setBlendMode(Phaser.BlendModes.ADD);
      this.wisps.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, img, tint: 0xb455f0 });
    }
    this.boltGfx = scene.add.graphics().setDepth(430);
    this.flashRect = scene.add.rectangle(W / 2, H / 2, W, H, 0xffffff).setDepth(990).setAlpha(0).setScrollFactor(0);
  }

  get reduced(): boolean {
    return services.save.data.settings.reducedMotion;
  }

  // ---- particles --------------------------------------------------------------------------------

  /**
   * Emits `count` particles from (x, y) in direction `ang` +- spread/2. `frame` is an extra-atlas frame
   * ('spark', 'puff', 'ice_shard', ...). Counts are reduced under reduced motion.
   */
  emit(
    frame: string, x: number, y: number, count: number, ang: number, spread: number,
    speedMin: number, speedMax: number, lifeMin: number, lifeMax: number,
    s0: number, s1: number, tint: number, gravity = 0, additive = true, a0 = 1,
  ): void {
    const n = this.reduced ? Math.max(1, Math.ceil(count * 0.35)) : count;
    for (let i = 0; i < n; i++) {
      const p = this.parts[this.nextPart];
      this.nextPart = (this.nextPart + 1) % this.parts.length;
      const a = ang + (Math.random() - 0.5) * spread;
      const sp = speedMin + Math.random() * (speedMax - speedMin);
      p.on = true;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.g = gravity;
      p.max = p.life = lifeMin + Math.random() * (lifeMax - lifeMin);
      p.s0 = s0; p.s1 = s1; p.a0 = a0;
      p.rot = Math.random() * TAU;
      p.vr = (Math.random() - 0.5) * 8;
      p.img.setFrame(frame).setTint(tint).setBlendMode(additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
        .setPosition(x, y).setScale(s0).setAlpha(a0).setRotation(p.rot).setVisible(true);
    }
  }

  burst(frame: string, x: number, y: number, count: number, speedMin: number, speedMax: number, life: number, s0: number, s1: number, tint: number, gravity = 0, additive = true): void {
    this.emit(frame, x, y, count, 0, TAU, speedMin, speedMax, life * 0.6, life, s0, s1, tint, gravity, additive);
  }

  hitSparks(x: number, y: number, tint: number, crit: boolean, ang: number): void {
    this.emit('spark', x, y, crit ? 9 : 4, ang, crit ? TAU : 1.6, 120, crit ? 340 : 240, 0.14, 0.3, crit ? 1.5 : 1, 0.1, tint, 0, true);
  }

  puff(x: number, y: number, tint: number, count = 5, size = 1.2): void {
    this.emit('puff', x, y, count, 0, TAU, 20, 110, 0.25, 0.5, size, size * 2, tint, -40, false, 0.8);
  }

  deathBurst(x: number, y: number, tint: number, big = false): void {
    this.emit('puff', x, y, big ? 12 : 5, 0, TAU, 40, big ? 240 : 150, 0.3, 0.55, big ? 2 : 1.2, 0.2, 0xe8e0d0, 0, false, 0.85);
    this.emit('spark', x, y, big ? 16 : 7, 0, TAU, 80, big ? 420 : 260, 0.25, 0.5, big ? 1.8 : 1.1, 0.1, tint, 140, true);
  }

  // ---- rings & sprite animations -----------------------------------------------------------------

  ring(x: number, y: number, r0: number, r1: number, life: number, tint: number, alpha = 0.9, additive = true): void {
    const r = this.rings[this.nextRing];
    this.nextRing = (this.nextRing + 1) % this.rings.length;
    r.on = true; r.life = r.max = life; r.r0 = r0; r.r1 = r1; r.a0 = alpha;
    r.img.setTint(tint).setBlendMode(additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
      .setPosition(x, y).setScale(r0 / 60).setAlpha(alpha).setVisible(true);
  }

  /** Generic short sprite animation from the extra atlas. mode: 0 linear, 1 squash-pop, 2 flash. */
  anim(
    frame: string, x: number, y: number, life: number, sx0: number, sy0: number, sx1: number, sy1: number,
    tint: number, mode = 0, rot = 0, alpha0 = 1, alpha1 = 0, additive = false, flipX = false,
    originX = 0.5, originY = 0.5, vx = 0, vy = 0, vr = 0, depth = 420, key: string = EXTRA_KEY,
  ): void {
    const a = this.anims[this.nextAnim];
    this.nextAnim = (this.nextAnim + 1) % this.anims.length;
    a.on = true; a.life = a.max = life; a.mode = mode;
    a.sx0 = sx0; a.sy0 = sy0; a.sx1 = sx1; a.sy1 = sy1; a.a0 = alpha0; a.a1 = alpha1;
    a.vx = vx; a.vy = vy; a.vr = vr;
    a.img.setTexture(key, frame).setOrigin(originX, originY).setTint(tint).setFlipX(flipX)
      .setBlendMode(additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL).setDepth(depth)
      .setPosition(x, y).setScale(sx0, sy0).setRotation(rot).setAlpha(alpha0).setVisible(true);
  }

  /** Death: the sprite squashes, pops and vanishes. */
  popSprite(key: string, frame: string | number, x: number, y: number, scale: number, flipX: boolean, tint: number): void {
    const a = this.anims[this.nextAnim];
    this.nextAnim = (this.nextAnim + 1) % this.anims.length;
    a.on = true; a.life = a.max = 0.28; a.mode = 1;
    a.sx0 = scale; a.sy0 = scale; a.sx1 = 0; a.sy1 = 0; a.a0 = 1; a.a1 = 0; a.vx = 0; a.vy = -30; a.vr = 0;
    a.img.setTexture(key, frame).setOrigin(0.5, 0.5).setFlipX(flipX).setBlendMode(Phaser.BlendModes.NORMAL)
      .setDepth(100 + y * 0.1 + 1).setPosition(x, y).setScale(scale).setRotation(0).setAlpha(1).setVisible(true);
    a.img.setTintFill(tint);
  }

  skyBolt(x: number, y: number, height: number, tint = 0xffffff): void {
    this.anim('lightning', x, y, 0.28, height / 40 * 0.7, height / 40, height / 40 * 0.55, height / 40, tint, 2, 0, 1, 0, true, false, 0.5, 1);
  }

  // ---- lightning ---------------------------------------------------------------------------------

  lightning(x1: number, y1: number, x2: number, y2: number, color: number, life = 0.2, jitter = 16): void {
    const b = this.bolts[this.nextBolt];
    this.nextBolt = (this.nextBolt + 1) % this.bolts.length;
    b.on = true; b.life = b.max = life; b.color = color; b.n = BOLT_SEGMENTS + 1;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    for (let i = 0; i <= BOLT_SEGMENTS; i++) {
      const t = i / BOLT_SEGMENTS;
      const off = i === 0 || i === BOLT_SEGMENTS ? 0 : (Math.random() - 0.5) * 2 * jitter;
      b.pts[i * 2] = x1 + dx * t + nx * off;
      b.pts[i * 2 + 1] = y1 + dy * t + ny * off;
    }
  }

  /** A small wisp that flies to (targetX, targetY), e.g. Soul Harvest. */
  wisp(x: number, y: number, tint: number): void {
    for (let i = 0; i < this.wisps.length; i++) {
      const w = this.wisps[i];
      if (w.on) continue;
      w.on = true; w.x = x; w.y = y; w.life = 1.2; w.tint = tint;
      const a = Math.random() * TAU;
      w.vx = Math.cos(a) * 160; w.vy = Math.sin(a) * 160 - 60;
      w.img.setTint(tint).setPosition(x, y).setScale(1.6).setAlpha(1).setVisible(true);
      return;
    }
  }

  // ---- screen ------------------------------------------------------------------------------------

  /** `amount` is trauma 0..1 (small hit ~0.15, big hit ~0.4, boss slam ~0.7). */
  shake(amount: number): void {
    const s = services.save.data.settings;
    if (!s.screenShake || s.reducedMotion) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  flash(color: number, alpha: number, seconds: number): void {
    if (this.reduced) return;
    this.flashRect.setFillStyle(color, 1);
    this.flashAlpha = alpha;
    this.flashLeft = this.flashMax = seconds;
  }

  hitstop(ms: number): void {
    if (this.reduced) return;
    this.hitstopLeft = Math.max(this.hitstopLeft, ms / 1000);
  }

  // ---- update ------------------------------------------------------------------------------------

  /** `dt` is simulation time (slow-motion aware); `realDt` drives shake / flash so they stay snappy. */
  update(dt: number, realDt: number): void {
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; p.img.setVisible(false); continue; }
      const k = 1 - p.life / p.max;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.img.setPosition(p.x, p.y).setScale(p.s0 + (p.s1 - p.s0) * k).setAlpha(p.a0 * (1 - k * k)).setRotation(p.rot);
    }
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      if (!r.on) continue;
      r.life -= dt;
      if (r.life <= 0) { r.on = false; r.img.setVisible(false); continue; }
      const k = 1 - r.life / r.max;
      const e = 1 - (1 - k) * (1 - k);
      r.img.setScale((r.r0 + (r.r1 - r.r0) * e) / 60).setAlpha(r.a0 * (1 - k));
    }
    for (let i = 0; i < this.anims.length; i++) {
      const a = this.anims[i];
      if (!a.on) continue;
      a.life -= dt;
      if (a.life <= 0) { a.on = false; a.img.setVisible(false); a.img.clearTint(); continue; }
      const k = 1 - a.life / a.max;
      if (a.mode === 1) {
        const f = 1 - k * k * k;
        a.img.setScale(a.sx0 * (1 + 0.5 * k) * f, a.sy0 * (1 - 0.3 * k) * f).setAlpha(k < 0.5 ? 1 : 1 - (k - 0.5) * 2);
      } else if (a.mode === 2) {
        const h = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65;
        a.img.setScale(a.sx0 + (a.sx1 - a.sx0) * Math.min(1, k * 3), a.sy0 + (a.sy1 - a.sy0) * Math.min(1, k * 3)).setAlpha(h);
      } else {
        a.img.setScale(a.sx0 + (a.sx1 - a.sx0) * k, a.sy0 + (a.sy1 - a.sy0) * k).setAlpha(a.a0 + (a.a1 - a.a0) * k);
      }
      if (a.vx !== 0 || a.vy !== 0) a.img.setPosition(a.img.x + a.vx * dt, a.img.y + a.vy * dt);
      if (a.vr !== 0) a.img.setRotation(a.img.rotation + a.vr * dt);
    }
    for (let i = 0; i < this.wisps.length; i++) {
      const w = this.wisps[i];
      if (!w.on) continue;
      w.life -= dt;
      const dx = this.targetX - w.x;
      const dy = this.targetY - w.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d < 26 || w.life <= 0) {
        w.on = false; w.img.setVisible(false);
        this.emit('spark', this.targetX, this.targetY, 3, 0, TAU, 40, 120, 0.2, 0.35, 1, 0.1, w.tint);
        continue;
      }
      const accel = 1500;
      w.vx = w.vx * (1 - 3 * dt) + (dx / d) * accel * dt;
      w.vy = w.vy * (1 - 3 * dt) + (dy / d) * accel * dt;
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      w.img.setPosition(w.x, w.y);
      if (Math.random() < 0.5) this.emit('spark', w.x, w.y, 1, 0, TAU, 0, 20, 0.2, 0.3, 0.8, 0.1, w.tint);
    }
    // lightning
    this.boltGfx.clear();
    for (let i = 0; i < this.bolts.length; i++) {
      const b = this.bolts[i];
      if (!b.on) continue;
      b.life -= dt;
      if (b.life <= 0) { b.on = false; continue; }
      const alpha = Math.min(1, b.life / b.max * 1.6);
      this.boltGfx.lineStyle(9, b.color, 0.28 * alpha);
      this.strokeBolt(b);
      this.boltGfx.lineStyle(3, 0xffffff, alpha);
      this.strokeBolt(b);
    }
    // flash
    if (this.flashLeft > 0) {
      this.flashLeft -= realDt;
      this.flashRect.setAlpha(Math.max(0, this.flashLeft / this.flashMax) * this.flashAlpha);
    } else if (this.flashRect.alpha !== 0) {
      this.flashRect.setAlpha(0);
    }
    // shake (trauma model)
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - realDt * 1.7);
      const amp = 16 * this.trauma * this.trauma;
      this.cam.setScroll((Math.random() - 0.5) * 2 * amp, (Math.random() - 0.5) * 2 * amp);
    } else if (this.cam.scrollX !== 0 || this.cam.scrollY !== 0) {
      this.cam.setScroll(0, 0);
    }
    if (this.hitstopLeft > 0) this.hitstopLeft = Math.max(0, this.hitstopLeft - realDt);
  }

  private strokeBolt(b: Bolt): void {
    this.boltGfx.beginPath();
    this.boltGfx.moveTo(b.pts[0], b.pts[1]);
    for (let i = 1; i < b.n; i++) this.boltGfx.lineTo(b.pts[i * 2], b.pts[i * 2 + 1]);
    this.boltGfx.strokePath();
  }

  /** Stops everything in flight (room change). */
  clear(): void {
    for (const p of this.parts) { p.on = false; p.img.setVisible(false); }
    for (const r of this.rings) { r.on = false; r.img.setVisible(false); }
    for (const a of this.anims) { a.on = false; a.img.setVisible(false); }
    for (const w of this.wisps) { w.on = false; w.img.setVisible(false); }
    for (const b of this.bolts) b.on = false;
    this.boltGfx.clear();
  }

  shutdown(): void {
    this.cam.setScroll(0, 0);
  }
}

