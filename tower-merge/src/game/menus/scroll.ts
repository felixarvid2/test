import Phaser from 'phaser';
import { DEPTH, PALETTE, clamp } from '../ui';

/** Game objects carrying this data flag (sliders) keep a drag that starts on them from scrolling. */
export const NO_SCROLL = 'noScroll';

const DRAG_THRESHOLD = 12;
const OVERSCROLL_MAX = 90;

/**
 * Vertical scroll list: drag with a finger or the mouse, mouse wheel, inertia and a soft
 * rubber-band at both ends. Put children into `content` using (0, 0) = top-left of the viewport
 * at scroll 0. A mask clips the content to the viewport.
 *
 * A drag that scrolled leaves `dragged` true until the next press, so tap handlers inside the list
 * can ignore the release that ends a scroll gesture:  onClick: () => { if (view.dragged) return; ... }
 */
export class ScrollView {
  readonly content: Phaser.GameObjects.Container;
  private scrollY = 0;
  private contentH = 0;
  private active = false;
  private moved = false;
  private startY = 0;
  private lastY = 0;
  private velocity = 0;
  private dragFlag = false;
  private bar: Phaser.GameObjects.Graphics;
  private barAlpha = 0;
  private maskGfx: Phaser.GameObjects.Graphics;
  private settle?: Phaser.Tweens.Tween;
  /** Set while a modal is open so the list behind it does not scroll. */
  locked = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    private readonly w: number,
    private readonly h: number,
  ) {
    this.content = scene.add.container(x, y).setDepth(DEPTH.world);
    this.maskGfx = scene.make.graphics({ x: 0, y: 0 }, false);
    this.maskGfx.fillStyle(0xffffff, 1).fillRect(x, y, w, h);
    this.content.setMask(this.maskGfx.createGeometryMask());
    this.bar = scene.add.graphics().setDepth(DEPTH.hud - 10);

    const input = scene.input;
    input.on('pointerdown', this.onDown, this);
    input.on('pointermove', this.onMove, this);
    input.on('pointerup', this.onUp, this);
    input.on('pointerupoutside', this.onUp, this);
    input.on('wheel', this.onWheel, this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  /** True when the last gesture scrolled the list (cleared by the next press). */
  get dragged(): boolean { return this.dragFlag; }
  get scroll(): number { return this.scrollY; }
  get maxScroll(): number { return Math.max(0, this.contentH - this.h); }
  get viewportTop(): number { return this.y; }

  setContentHeight(h: number): void {
    this.contentH = h;
    this.applyScroll(clamp(this.scrollY, 0, this.maxScroll));
  }

  /** Jumps (or glides) so that `top` of the content is at the top of the viewport. */
  scrollTo(top: number, animate = false): void {
    const target = clamp(top, 0, this.maxScroll);
    this.settle?.stop();
    if (!animate) { this.applyScroll(target); return; }
    const s = { v: this.scrollY };
    this.settle = this.scene.tweens.add({ targets: s, v: target, duration: 260, ease: 'Sine.Out', onUpdate: () => this.applyScroll(s.v) });
  }

  private inside(p: Phaser.Input.Pointer): boolean {
    return p.x >= this.x && p.x <= this.x + this.w && p.y >= this.y && p.y <= this.y + this.h;
  }

  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[] = []): void {
    this.dragFlag = false;
    if (this.locked || !this.inside(p)) return;
    if (over.some((o) => o.getData?.(NO_SCROLL))) return;
    this.settle?.stop();
    this.active = true;
    this.moved = false;
    this.startY = this.lastY = p.y;
    this.velocity = 0;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.active || !p.isDown) return;
    if (!this.moved && Math.abs(p.y - this.startY) > DRAG_THRESHOLD) {
      this.moved = true;
      this.dragFlag = true;
      this.lastY = p.y;
    }
    if (!this.moved) return;
    let dy = p.y - this.lastY;
    this.lastY = p.y;
    // resistance beyond the ends
    if ((this.scrollY < 0 && dy > 0) || (this.scrollY > this.maxScroll && dy < 0)) dy *= 0.4;
    this.velocity = this.velocity * 0.5 + dy * 0.5;
    this.applyScroll(clamp(this.scrollY - dy, -OVERSCROLL_MAX, this.maxScroll + OVERSCROLL_MAX));
  }

  private onUp(): void {
    if (!this.active) return;
    this.active = false;
    if (!this.moved) return;
    if (this.scrollY < 0 || this.scrollY > this.maxScroll) this.scrollTo(this.scrollY < 0 ? 0 : this.maxScroll, true);
  }

  private onWheel(p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    if (this.locked || !this.inside(p)) return;
    this.settle?.stop();
    this.velocity = 0;
    this.applyScroll(clamp(this.scrollY + dy * 0.9, 0, this.maxScroll));
  }

  private update(_t: number, dtMs: number): void {
    if (!this.active && Math.abs(this.velocity) > 0.3 && this.scrollY >= 0 && this.scrollY <= this.maxScroll) {
      // inertia: velocity is px per frame at ~60 fps
      const frames = dtMs / 16.67;
      this.applyScroll(clamp(this.scrollY - this.velocity * frames, 0, this.maxScroll));
      this.velocity *= Math.pow(0.94, frames);
    } else if (!this.active) {
      this.velocity = 0;
    }
    if (this.barAlpha > 0 && !this.active && Math.abs(this.velocity) < 0.3) {
      this.barAlpha = Math.max(0, this.barAlpha - dtMs / 700);
      this.drawBar();
    }
  }

  private applyScroll(v: number): void {
    this.scrollY = v;
    this.content.y = this.y - v;
    if (this.maxScroll > 0) { this.barAlpha = 1; this.drawBar(); }
  }

  private drawBar(): void {
    this.bar.clear();
    if (this.maxScroll <= 0 || this.barAlpha <= 0) return;
    const trackH = this.h - 24;
    const thumbH = Math.max(60, (this.h / this.contentH) * trackH);
    const t = clamp(this.scrollY / this.maxScroll, 0, 1);
    const ty = this.y + 12 + (trackH - thumbH) * t;
    this.bar.fillStyle(PALETTE.shadow, 0.35 * this.barAlpha).fillRoundedRect(this.x + this.w - 14, ty, 8, thumbH, 4);
    this.bar.fillStyle(PALETTE.textDim, 0.7 * this.barAlpha).fillRoundedRect(this.x + this.w - 15, ty - 1, 8, thumbH, 4);
  }

  destroy(): void {
    const input = this.scene.input;
    input?.off('pointerdown', this.onDown, this);
    input?.off('pointermove', this.onMove, this);
    input?.off('pointerup', this.onUp, this);
    input?.off('pointerupoutside', this.onUp, this);
    input?.off('wheel', this.onWheel, this);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    this.settle?.stop();
    this.maskGfx.destroy();
  }
}
