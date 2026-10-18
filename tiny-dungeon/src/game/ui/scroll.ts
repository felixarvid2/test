import Phaser from 'phaser';
import { COLORS } from '../assets';
import { FADE } from './fx';
import { H, W } from './kit';

/**
 * A vertically scrolling, masked list: drag with momentum, mouse wheel, rubber-band at the ends and a
 * scrollbar. Children are added to `content` using local coordinates (x 0..w, y 0..contentHeight).
 *
 * Interactive children outside the viewport are shielded by invisible blockers above and below it, so
 * a row hidden under the header can never be tapped. Buttons ignore taps that were really drags.
 */
export class ScrollList {
  readonly content: Phaser.GameObjects.Container;
  private maskGfx: Phaser.GameObjects.Graphics;
  private bar: Phaser.GameObjects.Graphics;
  private fadeTop: Phaser.GameObjects.Image;
  private fadeBottom: Phaser.GameObjects.Image;
  private blockers: Phaser.GameObjects.Rectangle[] = [];

  scrollY = 0;
  private maxScroll = 0;
  private vel = 0;
  private tracking = false;
  private dragged = false;
  private startY = 0;
  private lastY = 0;
  private lastT = 0;
  private barAlpha = 0.4;
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly x: number,
    readonly y: number,
    readonly w: number,
    readonly h: number,
    private contentH: number,
    depth = 0,
  ) {
    this.content = scene.add.container(x, y).setDepth(depth);
    this.maskGfx = scene.make.graphics({}, false);
    this.maskGfx.fillStyle(0xffffff).fillRect(x - 24, y, w + 48, h);
    this.content.setMask(this.maskGfx.createGeometryMask());

    // Shields for everything that scrolls out of the viewport (above and below).
    for (const [top, height] of [[0, y], [y + h, H - (y + h)]] as const) {
      if (height <= 0) continue;
      const r = scene.add.rectangle(W / 2, top + height / 2, W, height, 0x000000, 0).setInteractive().setDepth(depth);
      this.blockers.push(r);
    }

    this.fadeTop = scene.add.image(W / 2, y, FADE).setOrigin(0.5, 0).setDisplaySize(W, 36).setAlpha(0).setDepth(depth);
    this.fadeBottom = scene.add.image(W / 2, y + h, FADE).setOrigin(0.5, 0).setDisplaySize(W, 36).setFlipY(true).setAlpha(0).setDepth(depth);
    this.fadeBottom.setY(y + h - 36);
    this.bar = scene.add.graphics().setDepth(depth);

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.input.on('wheel', this.onWheel, this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.setContentHeight(contentH);
  }

  setContentHeight(h: number): void {
    this.contentH = h;
    this.maxScroll = Math.max(0, h - this.h);
    this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScroll);
    this.apply();
  }

  /** Scrolls so that [top, top+height] (content coordinates) is visible. */
  reveal(top: number, height: number, animate = true): void {
    let target = this.scrollY;
    if (top < this.scrollY) target = top - 12;
    else if (top + height > this.scrollY + this.h) target = top + height - this.h + 12;
    target = Phaser.Math.Clamp(target, 0, this.maxScroll);
    if (!animate) {
      this.scrollY = target;
      this.apply();
      return;
    }
    this.vel = 0;
    this.scene.tweens.add({ targets: this, scrollY: target, duration: 280, ease: 'Cubic.Out', onUpdate: () => this.apply() });
  }

  private inside(p: Phaser.Input.Pointer): boolean {
    return p.x >= this.x - 24 && p.x <= this.x + this.w + 24 && p.y >= this.y && p.y <= this.y + this.h;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.inside(p) || this.maxScroll <= 0) return;
    this.tracking = true;
    this.dragged = false;
    this.startY = p.y;
    this.lastY = p.y;
    this.lastT = this.scene.time.now;
    this.vel = 0;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.tracking || !p.isDown) return;
    if (!this.dragged && Math.abs(p.y - this.startY) < 10) return;
    this.dragged = true;
    const dy = p.y - this.lastY;
    this.lastY = p.y;
    const now = this.scene.time.now;
    const dt = Math.max(1, now - this.lastT) / 1000;
    this.lastT = now;
    // Rubber-band: dragging past either end moves at a third of the speed.
    const over = this.scrollY < 0 || this.scrollY > this.maxScroll;
    this.scrollY -= over ? dy * 0.33 : dy;
    this.vel = Phaser.Math.Linear(this.vel, -dy / dt, 0.4);
    this.barAlpha = 1;
    this.apply();
  }

  private onUp(): void {
    if (!this.tracking) return;
    this.tracking = false;
    if (!this.dragged || this.scene.time.now - this.lastT > 90) this.vel = 0;
    this.vel = Phaser.Math.Clamp(this.vel, -3200, 3200);
  }

  private onWheel(p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    if (!this.inside(p) || this.maxScroll <= 0) return;
    this.vel = 0;
    this.scrollY = Phaser.Math.Clamp(this.scrollY + dy * 0.8, 0, this.maxScroll);
    this.barAlpha = 1;
    this.apply();
  }

  private tick(_time: number, delta: number): void {
    if (this.destroyed) return;
    const dt = Math.min(0.05, delta / 1000);
    if (!this.tracking) {
      if (this.scrollY < 0 || this.scrollY > this.maxScroll) {
        const target = this.scrollY < 0 ? 0 : this.maxScroll;
        this.scrollY += (target - this.scrollY) * Math.min(1, dt * 14);
        if (Math.abs(target - this.scrollY) < 0.4) this.scrollY = target;
        this.vel = 0;
        this.apply();
      } else if (Math.abs(this.vel) > 8) {
        this.scrollY += this.vel * dt;
        this.vel *= Math.pow(0.04, dt); // friction: ~96% of the speed gone per second
        this.apply();
      }
      this.barAlpha = Math.max(0.4, this.barAlpha - dt * 0.8);
    }
  }

  private apply(): void {
    this.content.y = Math.round(this.y - this.scrollY);
    const can = this.maxScroll > 0;
    this.fadeTop.setAlpha(can ? Phaser.Math.Clamp(this.scrollY / 40, 0, 1) : 0);
    this.fadeBottom.setAlpha(can ? Phaser.Math.Clamp((this.maxScroll - this.scrollY) / 40, 0, 1) : 0);
    this.bar.clear();
    if (!can) return;
    const trackX = this.x + this.w + 14;
    const trackH = this.h - 16;
    const ratio = this.h / this.contentH;
    const thumbH = Math.max(56, trackH * ratio);
    const p = Phaser.Math.Clamp(this.scrollY / this.maxScroll, 0, 1);
    const thumbY = this.y + 8 + (trackH - thumbH) * p;
    this.bar.fillStyle(COLORS.outline, 0.5).fillRoundedRect(trackX - 5, this.y + 8, 10, trackH, 5);
    this.bar.fillStyle(COLORS.textDim, this.barAlpha).fillRoundedRect(trackX - 4, thumbY, 8, thumbH, 4);
  }

  /** Objects that must sit above blockers/fades (headers) are created after the list; nothing to do. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const input = this.scene.input;
    input.off('pointerdown', this.onDown, this);
    input.off('pointermove', this.onMove, this);
    input.off('pointerup', this.onUp, this);
    input.off('pointerupoutside', this.onUp, this);
    input.off('wheel', this.onWheel, this);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    // Idempotent: harmless when the scene is shutting down and already destroyed these.
    this.content.clearMask();
    for (const o of [this.content, this.maskGfx, this.bar, this.fadeTop, this.fadeBottom, ...this.blockers]) o.destroy();
  }
}
