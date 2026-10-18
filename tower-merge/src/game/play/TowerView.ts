import Phaser from 'phaser';
import { SLOTS, type SlotDef } from '../../data/map';
import { TOWERS } from '../../data/towers';
import { MAX_TOWER_LEVEL, type TowerId } from '../../data/types';
import type { SlotState, TowerState } from '../../sim/api';
import { towerKey } from '../assetKeys';
import { PALETTE, TOWER_COLORS } from '../ui/theme';
import { D, TOWER_DY, depthForY, towerSize } from './constants';
import type { Effects } from './Effects';
import { TEX } from './textures';

export const LEVEL_COLORS = [0xc5cee0, 0x5ed06a, 0x4fa3ff, 0xb35cff, 0xffb627];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

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
function bounceOut(k: number): number {
  if (k < 1 / 2.75) return 7.5625 * k * k;
  if (k < 2 / 2.75) { k -= 1.5 / 2.75; return 7.5625 * k * k + 0.75; }
  if (k < 2.5 / 2.75) { k -= 2.25 / 2.75; return 7.5625 * k * k + 0.9375; }
  k -= 2.625 / 2.75;
  return 7.5625 * k * k + 0.984375;
}

/** Level pill with 1-5 colour-coded pips, centred on cx with its top at topY. */
export function drawLevelBadge(g: Phaser.GameObjects.Graphics, cx: number, topY: number, level: number): void {
  const n = Math.max(1, Math.min(MAX_TOWER_LEVEL, level));
  const col = LEVEL_COLORS[n - 1];
  const pip = 11;
  const gap = 5;
  const w = n * pip + (n - 1) * gap + 22;
  const h = 24;
  const bx = cx - w / 2;
  g.fillStyle(PALETTE.outline, 1).fillRoundedRect(bx - 3, topY - 3, w + 6, h + 6, h / 2 + 3);
  g.fillStyle(0x1b2140, 1).fillRoundedRect(bx, topY, w, h, h / 2);
  for (let i = 0; i < n; i++) {
    const x = bx + 11 + pip / 2 + i * (pip + gap);
    g.fillStyle(PALETTE.outline, 1).fillCircle(x, topY + h / 2, pip / 2 + 2);
    g.fillStyle(col, 1).fillCircle(x, topY + h / 2, pip / 2);
    g.fillStyle(0xffffff, 0.7).fillCircle(x - 1.5, topY + h / 2 - 2, pip / 6);
  }
}

/** One tower slot on the board: pad shadow, tower sprite, level badge and the animations around them. */
export class TowerView {
  readonly sprite: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly aura: Phaser.GameObjects.Image;
  private readonly badge: Phaser.GameObjects.Graphics;
  private readonly ring: Phaser.GameObjects.Graphics;

  uid = 0;
  type: TowerId = 'arrow';
  level = 1;
  /** While set, the view keeps its old look (a merge/move is still flying in). */
  hold = false;
  ghost = false;
  private pendingDrop = false;
  private pendingSlide: { x: number; y: number } | null = null;

  private recoilT = 9;
  private recoilCos = 0;
  private recoilSin = 0;
  private popT = 9;
  private dropT = 9;
  private landT = 9;
  private slideT = 9;
  private slideX = 0;
  private slideY = 0;
  private flashT = 0;
  private smokeT = 0;
  private maxDisabled = 0;
  private phase: number;
  private shown = false;
  private frenzy = false;

  readonly x: number;
  readonly y: number;

  constructor(private readonly scene: Phaser.Scene, readonly def: SlotDef, private readonly fx: Effects) {
    this.x = def.x;
    this.y = def.y;
    this.phase = def.id * 1.7;
    const baseY = def.y + TOWER_DY;
    const depth = depthForY(baseY);
    this.shadow = scene.add.image(def.x, baseY + 6, TEX.shadow).setDepth(D.ground).setDisplaySize(96, 40).setVisible(false);
    this.aura = scene.add.image(def.x, baseY - 40, 'fx_glow').setDepth(depth - 0.01).setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xff4a3a).setVisible(false);
    this.sprite = scene.add.image(def.x, baseY, towerKey('arrow', 1)).setOrigin(0.5, 0.875).setDepth(depth).setVisible(false);
    this.badge = scene.add.graphics().setDepth(depth + 0.02).setVisible(false);
    this.ring = scene.add.graphics().setDepth(depth + 0.03).setVisible(false);
  }

  // --- control ----------------------------------------------------------------------------------

  /** Next tower that appears here drops in from above. */
  markDrop(): void { this.pendingDrop = true; }

  /** Next tower that appears here slides in from a point (swap). */
  markSlide(fromX: number, fromY: number): void { this.pendingSlide = { x: fromX, y: fromY }; }

  recoil(angle: number): void {
    this.recoilT = 0;
    this.recoilCos = Math.cos(angle);
    this.recoilSin = Math.sin(angle);
  }

  /** Elastic punch of a freshly merged tower. */
  pop(): void { this.popT = 0; this.flashT = 0.07; }

  /** Squash when something lands on the tower (merge target before the pop). */
  squash(): void { this.landT = 0; this.flashT = 0.06; }

  /** Little hop + dust when a tower is dropped into place. */
  land(): void {
    this.landT = 0;
  }

  setGhost(on: boolean): void { this.ghost = on; }

  /** Current anchor of the tower base (for flying sprites). */
  anchor(): { x: number; y: number } { return { x: this.x, y: this.y + TOWER_DY }; }

  muzzle(angle: number): { x: number; y: number } {
    const h = towerSize(this.level);
    return { x: this.x + Math.cos(angle) * 20, y: this.y + TOWER_DY - h * 0.62 + Math.sin(angle) * 12 };
  }

  setFrenzy(on: boolean): void { this.frenzy = on; }

  // --- per-frame sync ---------------------------------------------------------------------------

  sync(tw: TowerState | null, time: number, dt: number): void {
    if (!tw) {
      if (this.uid !== 0 && !this.hold) this.clear();
      else if (this.hold) this.drawHeld(time, dt);
      return;
    }
    if (tw.uid !== this.uid && !this.hold) this.adopt(tw);
    if (this.hold) { this.drawHeld(time, dt); return; }
    if (!this.shown) this.setShown(true);
    this.animate(tw, time, dt);
  }

  private adopt(tw: TowerState): void {
    this.uid = tw.uid;
    this.type = tw.type;
    this.level = tw.level;
    this.maxDisabled = 0;
    this.sprite.setTexture(towerKey(tw.type, tw.level));
    this.drawBadge();
    this.ghost = false;
    if (this.pendingDrop) {
      this.pendingDrop = false;
      this.dropT = 0;
    }
    if (this.pendingSlide) {
      this.slideX = this.pendingSlide.x - this.x;
      this.slideY = this.pendingSlide.y - this.y;
      this.pendingSlide = null;
      this.slideT = 0;
    }
    this.setShown(true);
  }

  private clear(): void {
    this.uid = 0;
    this.ghost = false;
    this.setShown(false);
    this.ring.clear();
  }

  private setShown(on: boolean): void {
    this.shown = on;
    this.sprite.setVisible(on);
    this.shadow.setVisible(on);
    this.badge.setVisible(on);
    if (!on) { this.aura.setVisible(false); this.ring.setVisible(false); }
  }

  /** Held views keep their last frame (the old tower) so merge targets stay on screen until the hit. */
  private drawHeld(time: number, dt: number): void {
    if (!this.shown && this.uid !== 0) this.setShown(true);
    if (this.shown) this.animate(null, time, dt);
  }

  /** Release a hold: re-sync to the world's tower (new texture, pop/land animation decided by the caller). */
  release(tw: TowerState | null): void {
    this.hold = false;
    if (tw) this.adopt(tw);
    else this.clear();
  }

  private drawBadge(): void {
    drawLevelBadge(this.badge.clear(), this.x, this.y + TOWER_DY + 22, this.level);
  }

  private animate(tw: TowerState | null, time: number, dt: number): void {
    const s = this.sprite;
    const size = towerSize(this.level);
    const base = size / s.frame.height;
    let sx = base;
    let sy = base;
    let ox = 0;
    let oy = 0;

    // idle breathing
    const breathe = Math.sin(time * 2.1 + this.phase);
    sy *= 1 + 0.016 * breathe;
    sx *= 1 - 0.01 * breathe;

    // recoil squash-and-stretch
    if (this.recoilT < 0.18) {
      this.recoilT += dt;
      const k = clamp01(1 - this.recoilT / 0.18);
      const kk = k * k;
      sy *= 1 - 0.13 * kk;
      sx *= 1 + 0.09 * kk;
      ox -= this.recoilCos * 4 * kk;
      oy -= this.recoilSin * 3 * kk;
    }
    if (this.landT < 0.3) {
      this.landT += dt;
      const k = clamp01(this.landT / 0.3);
      const sq = Math.sin(k * Math.PI) * Math.pow(1 - k, 0.5);
      sy *= 1 - 0.22 * sq;
      sx *= 1 + 0.2 * sq;
    }
    if (this.popT < 0.7) {
      this.popT += dt;
      const p = punchScale(this.popT);
      sx *= p;
      sy *= p;
    }
    if (this.dropT < 0.6) {
      this.dropT += dt;
      const k = clamp01(this.dropT / 0.55);
      oy -= 280 * (1 - bounceOut(k));
      if (this.dropT >= 0.6) this.landT = 0;
    }
    if (this.slideT < 0.22) {
      this.slideT += dt;
      const k = 1 - clamp01(this.slideT / 0.22);
      const e = k * k;
      ox += this.slideX * e;
      oy += this.slideY * e;
    }
    s.setPosition(this.x + ox, this.y + TOWER_DY + oy);
    s.setScale(sx, sy);
    const lifted = oy < -6 ? clamp01(-oy / 280) : 0;
    this.shadow.setPosition(this.x + ox, this.y + TOWER_DY + 6 + Math.max(0, oy * 0.2)).setAlpha(this.ghost ? 0.25 : 1 - lifted * 0.4);
    this.shadow.setScale((96 / this.shadow.frame.width) * (1 - lifted * 0.35), (40 / this.shadow.frame.height) * (1 - lifted * 0.35));

    // tint / alpha: ghost while dragged, grey when disabled, white flash on impact
    if (this.flashT > 0) {
      this.flashT -= dt;
      s.setTintFill(0xffffff);
    } else if (tw && tw.disabledTime > 0) {
      s.setTint(0x8f94a8);
    } else if (this.ghost) {
      s.setTint(0x9aa6c0);
    } else {
      s.clearTint();
    }
    s.setAlpha(this.ghost ? 0.32 : 1);
    this.badge.setAlpha(this.ghost ? 0 : 1);

    // dragon disable: smoke puffs + countdown ring
    if (tw && tw.disabledTime > 0) {
      if (tw.disabledTime > this.maxDisabled) this.maxDisabled = tw.disabledTime;
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.22;
        this.fx.puffs(this.x + (Math.random() - 0.5) * 30, this.y + TOWER_DY - size * 0.6, 1, 0x7c7c88);
      }
      const k = clamp01(tw.disabledTime / Math.max(0.01, this.maxDisabled));
      const g = this.ring;
      g.setVisible(true).clear();
      const cx = this.x;
      const cy = this.y + TOWER_DY - 38;
      g.lineStyle(9, PALETTE.outline, 0.9).beginPath().arc(cx, cy, 58, 0, Math.PI * 2).strokePath();
      g.lineStyle(6, 0xff5a4f, 1).beginPath().arc(cx, cy, 58, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k).strokePath();
    } else if (this.ring.visible) {
      this.ring.clear().setVisible(false);
      this.maxDisabled = 0;
    }

    // frenzy aura
    if (this.frenzy && !this.ghost) {
      const a = 0.35 + 0.25 * Math.sin(time * 9 + this.phase);
      this.aura.setVisible(true).setPosition(this.x, this.y + TOWER_DY - 40).setAlpha(a).setScale((150 + 14 * Math.sin(time * 7)) / this.aura.frame.width);
    } else if (this.aura.visible) {
      this.aura.setVisible(false);
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
    this.aura.destroy();
    this.badge.destroy();
    this.ring.destroy();
  }
}

/** The twelve tower views, indexed by slot id. */
export class TowerLayer {
  readonly views: TowerView[] = [];

  constructor(scene: Phaser.Scene, fx: Effects) {
    for (const def of SLOTS) this.views.push(new TowerView(scene, def, fx));
  }

  update(slots: readonly SlotState[], time: number, dt: number, frenzy: boolean): void {
    for (let i = 0; i < this.views.length; i++) {
      const v = this.views[i];
      v.setFrenzy(frenzy);
      v.sync(slots[i]?.tower ?? null, time, dt);
    }
  }

  color(type: TowerId): number {
    return TOWER_COLORS[type] ?? TOWERS[type].color;
  }

  destroy(): void {
    for (const v of this.views) v.destroy();
    this.views.length = 0;
  }
}
