import Phaser from 'phaser';
import { EXTRA_KEY, ICONS_KEY, TILES_KEY, TILE_FRAMES } from '../assets';
import { COSMETICS } from '../../data/buffs';
import { HEROES } from '../../data/heroes';
import type { HeroId } from '../../core/types';
import { services } from '../../services';

// Small visual helpers shared by the menu and overlay scenes: generated textures, sprites, particle
// bursts, flying coins, count-up numbers. Everything honours the "reduced motion" setting.

export const reduced = (): boolean => !!services?.save.data.settings.reducedMotion;

export { fmt } from './format';

export const RARITY_LABEL = { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY' } as const;

// ---- generated textures ---------------------------------------------------------------------------

export const GLOW = 'ui_glow';
export const VIGNETTE = 'ui_vignette';
export const SHEEN = 'ui_sheen';
export const FADE = 'ui_fade';

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

/** Soft radial glow, white (tint it), vignette, diagonal sheen band and a vertical fade strip. */
export function ensureTextures(scene: Phaser.Scene): void {
  canvasTexture(scene, GLOW, 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  canvasTexture(scene, VIGNETTE, 360, 640, (ctx) => {
    const g = ctx.createRadialGradient(180, 320, 150, 180, 320, 420);
    g.addColorStop(0, 'rgba(8,4,14,0)');
    g.addColorStop(1, 'rgba(8,4,14,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 360, 640);
  });
  canvasTexture(scene, SHEEN, 160, 256, (ctx) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(50, 0);
    ctx.lineTo(160, 0);
    ctx.lineTo(110, 256);
    ctx.lineTo(0, 256);
    ctx.closePath();
    ctx.clip();
    const g = ctx.createLinearGradient(0, 0, 160, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 160, 256);
    ctx.restore();
  });
  canvasTexture(scene, FADE, 8, 64, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(20,12,28,1)');
    g.addColorStop(1, 'rgba(20,12,28,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 64);
  });
}

/** Torch flame and spinning coin animations (global, created once). */
export function ensureAnims(scene: Phaser.Scene): void {
  if (!scene.anims.exists('ui_torch')) {
    scene.anims.create({
      key: 'ui_torch',
      frames: [0, 1, 2, 3].map((i) => ({ key: EXTRA_KEY, frame: `torch_${i}` })),
      frameRate: 8,
      repeat: -1,
    });
  }
  if (!scene.anims.exists('ui_coin')) {
    scene.anims.create({
      key: 'ui_coin',
      frames: [0, 1, 2, 3].map((i) => ({ key: EXTRA_KEY, frame: `coin_${i}` })),
      frameRate: 10,
      repeat: -1,
    });
  }
}

// ---- sprites --------------------------------------------------------------------------------------

/** Image for a definition's `frame` string: 'tile:knight' (tiles sheet) or an EXTRA atlas frame. */
export function spriteFor(scene: Phaser.Scene, frame: string, x: number, y: number): Phaser.GameObjects.Image {
  if (frame.startsWith('tile:')) {
    const name = frame.slice(5) as keyof typeof TILE_FRAMES;
    return scene.add.image(x, y, TILES_KEY, TILE_FRAMES[name] ?? TILE_FRAMES.knight);
  }
  return scene.add.image(x, y, EXTRA_KEY, frame);
}

export function skinTint(hero: HeroId): number | undefined {
  const id = services?.save.data.cosmetics.equipped[hero];
  const skin = id ? COSMETICS.find((c) => c.id === id) : undefined;
  return skin?.tint;
}

/** A hero sprite (feet-anchored origin 0.5/1), tinted with the equipped skin unless `tint` is given. */
export function heroSprite(scene: Phaser.Scene, x: number, y: number, hero: HeroId, scale: number, tint?: number | null): Phaser.GameObjects.Image {
  const img = spriteFor(scene, HEROES[hero].frame, x, y).setOrigin(0.5, 1).setScale(scale);
  const t = tint === undefined ? skinTint(hero) : tint;
  if (t !== undefined && t !== null && t !== 0xffffff) img.setTint(t);
  return img;
}

export function icon(scene: Phaser.Scene, key: string, x: number, y: number, scale = 3): Phaser.GameObjects.Image {
  return scene.add.image(x, y, ICONS_KEY, key).setScale(scale);
}

/** Soft additive glow sprite. */
export function glow(scene: Phaser.Scene, x: number, y: number, size: number, color: number, alpha = 0.5): Phaser.GameObjects.Image {
  return scene.add.image(x, y, GLOW).setDisplaySize(size, size).setTint(color).setAlpha(alpha).setBlendMode(Phaser.BlendModes.ADD);
}

// ---- particles & motion ---------------------------------------------------------------------------

function burstEmitter(scene: Phaser.Scene, x: number, y: number, config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, count: number, depth: number): void {
  const emitter = scene.add.particles(x, y, EXTRA_KEY, { ...config, emitting: false }).setDepth(depth);
  emitter.explode(count);
  const life = typeof config.lifespan === 'number' ? config.lifespan : 1200;
  scene.time.delayedCall(life + 200, () => emitter.destroy());
}

/** Coins spraying out of a point. */
export function coinBurst(scene: Phaser.Scene, x: number, y: number, count = 14, depth = 9000): void {
  if (reduced()) count = Math.ceil(count / 3);
  services?.audio.play('coin');
  burstEmitter(scene, x, y, {
    frame: ['coin_0', 'coin_1', 'coin_2', 'coin_3'],
    lifespan: 800,
    speed: { min: 220, max: 520 },
    angle: { min: 215, max: 325 },
    gravityY: 1100,
    scale: { start: 3, end: 2.2 },
    alpha: { start: 1, end: 0, ease: 'Quad.In' },
  }, count, depth);
}

/** Sparks in a colour (level-ups, picks, new best). */
export function sparks(scene: Phaser.Scene, x: number, y: number, color: number, count = 18, depth = 9000, speed = 360): void {
  if (reduced()) count = Math.ceil(count / 3);
  burstEmitter(scene, x, y, {
    frame: 'spark',
    lifespan: 800,
    speed: { min: speed * 0.3, max: speed },
    angle: { min: 0, max: 360 },
    scale: { start: 2.6, end: 0 },
    alpha: { start: 1, end: 0, ease: 'Quad.In' },
    tint: color,
    blendMode: 'ADD',
  }, count, depth);
}

/** Confetti-like rain of stars/sparks from the top edge of a region. */
export function confetti(scene: Phaser.Scene, x: number, y: number, width: number, colors: number[], count = 40, depth = 9000): void {
  if (reduced()) return;
  const emitter = scene.add.particles(x, y, EXTRA_KEY, {
    frame: 'spark',
    lifespan: 1800,
    speedX: { min: -120, max: 120 },
    speedY: { min: -80, max: 140 },
    gravityY: 420,
    scale: { start: 2.4, end: 0.6 },
    alpha: { start: 1, end: 0, ease: 'Quad.In' },
    rotate: { min: 0, max: 360 },
    tint: colors,
    emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-width / 2, 0, width, 4), quantity: 1 },
    emitting: false,
  }).setDepth(depth);
  emitter.explode(count);
  scene.time.delayedCall(2200, () => emitter.destroy());
}

export interface FlyCoinOpts {
  onLaunch?: (i: number) => void;
  onArrive?: (i: number) => void;
  onDone?: () => void;
  depth?: number;
}

/** Coins that fly from one point to another one after the other (shop purchase, gold payout). */
export function flyCoins(scene: Phaser.Scene, from: { x: number; y: number }, to: { x: number; y: number }, count: number, opts: FlyCoinOpts = {}): void {
  const n = reduced() ? 1 : Math.max(1, count);
  let arrived = 0;
  for (let i = 0; i < n; i++) {
    const coin = scene.add.sprite(from.x, from.y, EXTRA_KEY, 'coin_0').setScale(3).setDepth(opts.depth ?? 9000).setVisible(false);
    coin.play('ui_coin');
    const cx = (from.x + to.x) / 2 + Phaser.Math.Between(-90, 90);
    const cy = Math.min(from.y, to.y) - Phaser.Math.Between(20, 120);
    const path = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(from.x, from.y), new Phaser.Math.Vector2(cx, cy), new Phaser.Math.Vector2(to.x, to.y));
    const tracker = { t: 0 };
    scene.tweens.add({
      targets: tracker,
      t: 1,
      delay: i * 55,
      duration: 520,
      ease: 'Sine.In',
      onStart: () => {
        coin.setVisible(true);
        opts.onLaunch?.(i);
      },
      onUpdate: () => {
        const p = path.getPoint(tracker.t);
        coin.setPosition(p.x, p.y).setScale(3 - tracker.t * 1.2);
      },
      onComplete: () => {
        coin.destroy();
        opts.onArrive?.(i);
        services?.audio.play('coin');
        arrived += 1;
        if (arrived === n) opts.onDone?.();
      },
    });
  }
}

/** Quick horizontal shake of any object (not enough gold, wrong tap). */
export function shake(scene: Phaser.Scene, target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, amp = 10): void {
  const x = target.x;
  scene.tweens.killTweensOf(target);
  target.x = x;
  if (reduced()) return;
  scene.tweens.add({
    targets: target,
    x: { from: x - amp, to: x + amp },
    duration: 55,
    yoyo: true,
    repeat: 3,
    ease: 'Sine.InOut',
    onComplete: () => { target.x = x; },
  });
}

/** Numbers that count up (or down); `onTick` fires about every `tickEvery` ms for sound. */
export function countTo(
  scene: Phaser.Scene, from: number, to: number, ms: number, onUpdate: (v: number) => void,
  opts: { onTick?: () => void; tickEvery?: number; onDone?: () => void } = {},
): void {
  if (reduced() || from === to) {
    onUpdate(to);
    opts.onDone?.();
    return;
  }
  const state = { v: from };
  let lastTick = 0;
  scene.tweens.add({
    targets: state,
    v: to,
    duration: ms,
    ease: 'Cubic.Out',
    onUpdate: (tween) => {
      onUpdate(Math.round(state.v));
      if (opts.onTick) {
        const now = tween.elapsed;
        if (now - lastTick >= (opts.tickEvery ?? 70)) {
          lastTick = now;
          opts.onTick();
        }
      }
    },
    onComplete: () => {
      onUpdate(to);
      opts.onDone?.();
    },
  });
}

/**
 * A diagonal highlight that sweeps across a w x h area of `parent` every `period` ms. The sheen image
 * is cropped to the area so it never spills out of rounded buttons or cards.
 */
export function addSheen(
  scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number,
  opts: { period?: number; alpha?: number; bandWidth?: number; delay?: number } = {},
): Phaser.GameObjects.Image | null {
  if (reduced()) return null;
  const bandW = opts.bandWidth ?? Math.min(150, w * 0.35);
  const sx = bandW / 160;
  const sy = h / 256;
  const img = scene.add.image(x, y, SHEEN).setOrigin(0, 0).setScale(sx, sy).setAlpha(opts.alpha ?? 0.5).setBlendMode(Phaser.BlendModes.ADD);
  parent.add(img);
  const track = { p: -bandW };
  scene.tweens.add({
    targets: track,
    p: w,
    duration: (opts.period ?? 2600) * 0.45,
    delay: opts.delay ?? 0,
    repeat: -1,
    repeatDelay: (opts.period ?? 2600) * 0.55,
    ease: 'Sine.InOut',
    onUpdate: () => {
      const left = Math.max(0, -track.p);
      const right = Math.min(bandW, w - track.p);
      if (right - left <= 1) {
        img.setVisible(false);
        return;
      }
      img.setVisible(true);
      img.setPosition(x + track.p, y);
      img.setCrop(left / sx, 0, (right - left) / sx, 256);
    },
  });
  return img;
}

/** Gentle repeating bob (idle animation). */
export function bob(scene: Phaser.Scene, target: object, amp = 6, ms = 1400, delay = 0): void {
  if (reduced()) return;
  const t = target as Phaser.GameObjects.Components.Transform;
  scene.tweens.add({ targets: target, y: t.y - amp, duration: ms, delay, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
}
