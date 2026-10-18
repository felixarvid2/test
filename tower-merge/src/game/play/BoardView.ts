import Phaser from 'phaser';
import { BOARD, CASTLE, PATH, PATH_WIDTH, SLOTS, SLOT_SIZE, type Point } from '../../data/map';
import type { WorldApi } from '../../sim/api';
import { crispText } from '../ui/text';
import { PALETTE, W, H } from '../ui/theme';
import { D, depthForY } from './constants';
import type { Effects } from './Effects';
import { TEX } from './textures';

/** Tiny seeded generator so the road looks the same every run. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Thick polyline with round joins: a quad per segment and a disc per waypoint. */
function strokeRound(g: Phaser.GameObjects.Graphics, pts: readonly Point[], width: number): void {
  const r = width / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * r;
    const ny = (dx / len) * r;
    g.fillPoints([
      { x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny },
    ] as Phaser.Math.Vector2[], true);
  }
  for (const p of pts) g.fillCircle(p.x, p.y, r);
}

/** Draws the dirt road once into a single static texture: edge, fill, ruts and pebbles. */
function paintPath(g: Phaser.GameObjects.Graphics): void {
  const road: Point[] = [{ x: PATH[0].x, y: PATH[0].y - 40 }, ...PATH];
  g.fillStyle(0x000000, 0.18);
  strokeRound(g, road.map((p) => ({ x: p.x, y: p.y + 5 })), PATH_WIDTH + 26);
  g.fillStyle(0x8b6338, 1);
  strokeRound(g, road, PATH_WIDTH + 18);
  g.fillStyle(0xc49a62, 1);
  strokeRound(g, road, PATH_WIDTH + 8);
  g.fillStyle(0xd9b27c, 1);
  strokeRound(g, road, PATH_WIDTH);
  g.fillStyle(0xe8c894, 0.55);
  strokeRound(g, road, PATH_WIDTH * 0.5);

  const rnd = mulberry(1337);
  // wheel ruts: two dashed darker lines per segment
  g.lineStyle(4, 0xb58a54, 0.4);
  for (let i = 0; i < road.length - 1; i++) {
    const a = road[i];
    const b = road[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    for (const off of [-15, 15]) {
      for (let s = 12; s < len - 30; s += 40 + rnd() * 18) {
        const l = 14 + rnd() * 16;
        const sx = a.x + ux * s - uy * off;
        const sy = a.y + uy * s + ux * off;
        g.lineBetween(sx, sy, sx + ux * l, sy + uy * l);
      }
    }
  }
  // pebbles
  for (let i = 0; i < road.length - 1; i++) {
    const a = road[i];
    const b = road[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const count = Math.round(len / 9);
    for (let k = 0; k < count; k++) {
      const t = rnd() * len;
      const lat = (rnd() - 0.5) * (PATH_WIDTH - 10);
      const x = a.x + ux * t - uy * lat;
      const y = a.y + uy * t + ux * lat;
      const r = 1.6 + rnd() * 3;
      const c = rnd();
      g.fillStyle(c < 0.4 ? 0xefd7a6 : c < 0.75 ? 0xb38f5e : 0x9c7a4d, 0.85).fillEllipse(x, y, r * 2.2, r * 1.6);
    }
  }
  // edge stones
  for (let i = 0; i < road.length - 1; i++) {
    const a = road[i];
    const b = road[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    for (let t = 8; t < len; t += 26 + rnd() * 30) {
      for (const side of [-1, 1]) {
        if (rnd() < 0.45) continue;
        const lat = side * (PATH_WIDTH / 2 + 6 + rnd() * 5);
        const x = a.x + ux * t - uy * lat;
        const y = a.y + uy * t + ux * lat;
        const r = 3 + rnd() * 3.5;
        g.fillStyle(0x6e5a48, 0.9).fillEllipse(x, y + 1.5, r * 2.4, r * 1.7);
        g.fillStyle(0xa8a39a, 1).fillEllipse(x, y, r * 2.2, r * 1.6);
        g.fillStyle(0xd8d4c8, 0.9).fillEllipse(x - r * 0.3, y - r * 0.3, r * 1.1, r * 0.7);
      }
    }
  }
}

/** The cave mouth at the spawn point. */
function paintPortal(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(0x000000, 0.28).fillEllipse(x, y + 12, 112, 54);
  // rock arch
  g.fillStyle(0x4a4658, 1).fillEllipse(x, y, 108, 74);
  g.fillStyle(0x6c6882, 1).fillEllipse(x - 3, y - 4, 100, 66);
  g.fillStyle(0x2b1d3a, 1).fillEllipse(x, y + 4, 76, 52);
  g.fillStyle(0x140c20, 1).fillEllipse(x, y + 8, 62, 40);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    const sx = x + Math.cos(a) * 49;
    const sy = y + Math.sin(a) * 33 + 2;
    g.fillStyle(0x8a86a3, 1).fillCircle(sx, sy, 9).lineStyle(2, 0x2b1d3a, 1).strokeCircle(sx, sy, 9);
  }
}

interface SlotPad {
  pad: Phaser.GameObjects.Image;
  lock: Phaser.GameObjects.Image;
  price: Phaser.GameObjects.Container;
  priceText: Phaser.GameObjects.Text;
  priceBg: Phaser.GameObjects.Graphics;
  affordable: boolean | null;
  shownCost: number;
}

/**
 * Static board: grass background, the dirt road (rendered once), spawn cave, castle, slot pads with
 * unlock prices, and the castle damage / low-HP screen effects.
 */
export class BoardView {
  readonly castle: Phaser.GameObjects.Image;
  private readonly pads: SlotPad[] = [];
  private readonly portalGlow: Phaser.GameObjects.Image;
  private readonly portalRing: Phaser.GameObjects.Image;
  private readonly vignette: Phaser.GameObjects.Image;
  private hurt = 0;
  private castleShake = 0;
  private castleFlash = 0;
  private lowHp = 0;
  private healFlash = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly fx: Effects) {
    scene.add.image(W / 2, H / 2, 'bg_board').setDepth(D.bg);

    const rt = scene.add.renderTexture(0, 0, W, H).setOrigin(0, 0).setDepth(D.path);
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    paintPath(g);
    rt.draw(g);
    g.clear();
    paintPortal(g, PATH[0].x, PATH[0].y + 16);
    rt.draw(g);
    g.destroy();

    this.portalGlow = scene.add.image(PATH[0].x, PATH[0].y + 22, 'fx_glow').setDepth(D.portal).setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xb35cff).setAlpha(0.7);
    this.portalRing = scene.add.image(PATH[0].x, PATH[0].y + 24, 'fx_ring').setDepth(D.portal).setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xd9a8ff).setAlpha(0.8);

    this.castle = scene.add.image(CASTLE.x, CASTLE.y + 6, 'castle').setDepth(depthForY(CASTLE.y + 54));
    this.castle.setScale((CASTLE.width + 24) / this.castle.frame.width);

    for (const def of SLOTS) {
      const pad = scene.add.image(def.x, def.y + 6, 'slot_empty').setDepth(D.slot).setDisplaySize(SLOT_SIZE, SLOT_SIZE);
      const lock = scene.add.image(def.x, def.y + 4, 'slot_locked').setDepth(D.slot + 0.1).setDisplaySize(SLOT_SIZE, SLOT_SIZE).setVisible(false);
      const priceBg = scene.add.graphics();
      const coin = scene.add.image(-30, 0, 'icon_coin').setDisplaySize(34, 34);
      const priceText = crispText(scene, 12, 0, '', { preset: 'number', size: 26 });
      const price = scene.add.container(def.x, def.y + 50, [priceBg, coin, priceText]).setDepth(D.slotFx).setVisible(false);
      this.pads.push({ pad, lock, price, priceText, priceBg, affordable: null, shownCost: -1 });
    }

    this.vignette = scene.add.image(W / 2, H / 2, TEX.vignette).setDisplaySize(W, H).setScrollFactor(0).setDepth(150)
      .setTint(0xff2a1a).setAlpha(0).setVisible(false);
  }

  /** x, y of the slot pad centre. */
  padOf(slot: number): SlotPad { return this.pads[slot]; }

  update(world: WorldApi, time: number, dt: number): void {
    const cost = world.unlockSlotCost();
    const affordable = world.coins >= cost;
    for (let i = 0; i < this.pads.length; i++) {
      const p = this.pads[i];
      const open = world.slots[i].unlocked;
      p.lock.setVisible(!open && p.lock.alpha > 0);
      p.price.setVisible(!open && Number.isFinite(cost));
      if (!open && Number.isFinite(cost)) {
        if (p.shownCost !== cost || p.affordable !== affordable) {
          p.shownCost = cost;
          p.affordable = affordable;
          p.priceText.setText(String(cost)).setColor(affordable ? '#ffe58a' : '#ff9a90');
          const w = 34 + 14 + p.priceText.width + 22;
          const h = 40;
          p.priceBg.clear();
          p.priceBg.fillStyle(PALETTE.outline, 1).fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, h / 2 + 3);
          p.priceBg.fillStyle(affordable ? 0x3a5a2a : 0x3a2a40, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
          p.priceBg.lineStyle(2, affordable ? 0x9be85a : 0x7a6a90, 1).strokeRoundedRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, h / 2 - 1);
          p.priceText.setX(10 + 0);
        }
        // affordable locks wobble invitingly
        if (affordable) p.lock.setAngle(Math.sin(time * 6 + i) * 3); else p.lock.setAngle(0);
      }
      if (open) p.lock.setAlpha(0);
    }
    // portal swirl
    this.portalRing.setRotation(time * 1.6).setScale((78 + 6 * Math.sin(time * 3)) / this.portalRing.frame.width, (50 + 4 * Math.sin(time * 3)) / this.portalRing.frame.height);
    this.portalGlow.setAlpha(0.45 + 0.25 * Math.sin(time * 2.4)).setScale(120 / this.portalGlow.frame.width);

    // castle hit shake / flash and the vignette (hit flash + low-HP pulse)
    const c = this.castle;
    if (this.castleShake > 0) {
      this.castleShake -= dt;
      const k = Math.max(0, this.castleShake / 0.3);
      c.setPosition(CASTLE.x + (Math.random() - 0.5) * 12 * k, CASTLE.y + 6 + (Math.random() - 0.5) * 6 * k);
    } else {
      c.setPosition(CASTLE.x, CASTLE.y + 6);
    }
    if (this.castleFlash > 0) {
      this.castleFlash -= dt;
      c.setTint(0xff6a5a);
    } else if (this.healFlash > 0) {
      this.healFlash -= dt;
      c.setTint(0xb8ffb8);
    } else {
      c.clearTint();
    }
    const ratio = world.castleMaxHp > 0 ? world.castleHp / world.castleMaxHp : 1;
    this.lowHp = ratio < 0.3 && world.castleHp > 0 ? 1 - ratio / 0.3 : 0;
    if (this.hurt > 0) this.hurt = Math.max(0, this.hurt - dt * 2.2);
    let a = this.hurt * 0.75;
    if (this.lowHp > 0) a = Math.max(a, (0.28 + 0.2 * Math.sin(time * 5.5)) * (0.6 + 0.4 * this.lowHp));
    if (a > 0.01) this.vignette.setVisible(true).setAlpha(a);
    else if (this.vignette.visible) this.vignette.setVisible(false);
  }

  castleHit(): void {
    this.hurt = 1;
    this.castleShake = 0.3;
    this.castleFlash = 0.1;
  }

  castleHeal(): void {
    this.healFlash = 0.25;
  }

  /** The lock pops off and flies away, dust bursts from the freed pad. */
  unlocked(slot: number): void {
    const def = SLOTS[slot];
    const p = this.pads[slot];
    p.lock.setAlpha(0).setVisible(false);
    p.price.setVisible(false);
    this.fx.anim('slot_locked', def.x, def.y + 4, SLOT_SIZE, SLOT_SIZE * 1.5, 1, 0, 0.45, 0xffffff, {
      additive: false, tx: def.x + 24, ty: def.y - 50, rot1: 0.7, arc: 24, depth: D.fxTop,
    });
    this.fx.dust(def.x, def.y + 10, 8);
    this.fx.ring(def.x, def.y + 6, 0xffffff, 40, 150, 360, 0.8);
    this.fx.sparks(def.x, def.y, 0xffe58a, 8);
    this.scene.tweens.add({ targets: p.pad, scale: { from: (SLOT_SIZE * 1.12) / p.pad.frame.width, to: SLOT_SIZE / p.pad.frame.width }, duration: 260, ease: 'Back.Out' });
  }

  /** Locked slot refused (not enough coins): the padlock shakes. */
  denied(slot: number): void {
    const p = this.pads[slot];
    const x = SLOTS[slot].x;
    this.scene.tweens.killTweensOf(p.lock);
    p.lock.setX(x);
    this.scene.tweens.add({ targets: p.lock, x: { from: x - 8, to: x + 8 }, duration: 50, yoyo: true, repeat: 3, onComplete: () => p.lock.setX(x) });
    this.scene.tweens.add({ targets: p.price, scale: { from: 1.2, to: 1 }, duration: 200 });
  }

  /** True when (x, y) is on a locked slot pad (taps unlock it). */
  lockedSlotAt(world: WorldApi, x: number, y: number): number {
    for (const def of SLOTS) {
      if (world.slots[def.id].unlocked) continue;
      if (Math.abs(x - def.x) <= SLOT_SIZE / 2 + 6 && y >= def.y - SLOT_SIZE / 2 - 8 && y <= def.y + SLOT_SIZE / 2 + 34) return def.id;
    }
    return -1;
  }

  get boardTop(): number { return BOARD.top; }
}
