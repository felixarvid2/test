import Phaser from 'phaser';
import { services } from '../../services';
import { H, W } from '../ui/kit';

const RADIUS = 84;
const DEAD_ZONE = 0.12;
const FIXED = { x: W / 2, y: H - 150 };
/** Screen areas that belong to HUD buttons: touches there never start the stick. */
const PAUSE_ZONE = { x: W - 130, y: 0, w: 130, h: 130 };

/**
 * Floating (default) or fixed joystick plus WASD / arrows. Multi-touch safe: it only follows the
 * pointer that started it. Output `x` / `y` is a vector of length 0..1.
 */
export class VirtualJoystick {
  x = 0;
  y = 0;
  enabled = true;
  private pointerId = -1;
  private baseX = 0;
  private baseY = 0;
  private knobX = 0;
  private knobY = 0;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly keys: Record<string, Phaser.Input.Keyboard.Key> | null;
  private anyInput = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(800).setScrollFactor(0);
    const kb = scene.input.keyboard;
    this.keys = kb ? (kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT', false) as Record<string, Phaser.Input.Keyboard.Key>) : null;
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    if (this.fixedMode) this.draw(false);
  }

  private get fixedMode(): boolean {
    return services.save.data.settings.joystick === 'fixed';
  }

  /** True when the player is giving any movement input (the "drag to move" hint fades on it). */
  get hasInput(): boolean {
    return this.anyInput;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.enabled || this.pointerId !== -1) return;
    if (p.x > PAUSE_ZONE.x && p.y < PAUSE_ZONE.h) return;
    if (this.fixedMode) {
      const dx = p.x - FIXED.x;
      const dy = p.y - FIXED.y;
      if (dx * dx + dy * dy > 190 * 190) return;
      this.baseX = FIXED.x;
      this.baseY = FIXED.y;
    } else {
      this.baseX = Phaser.Math.Clamp(p.x, RADIUS + 10, W - RADIUS - 10);
      this.baseY = Phaser.Math.Clamp(p.y, RADIUS + 10, H - RADIUS - 10);
    }
    this.pointerId = p.id;
    this.follow(p.x, p.y);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.follow(p.x, p.y);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.release();
  }

  private follow(px: number, py: number): void {
    let dx = px - this.baseX;
    let dy = py - this.baseY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > RADIUS) {
      if (!this.fixedMode) {
        // Floating stick: the base trails the thumb so it never leaves the stick.
        this.baseX += (dx / d) * (d - RADIUS);
        this.baseY += (dy / d) * (d - RADIUS);
      }
      dx = (dx / d) * RADIUS;
      dy = (dy / d) * RADIUS;
    }
    this.knobX = this.baseX + dx;
    this.knobY = this.baseY + dy;
    const m = Math.min(1, Math.sqrt(dx * dx + dy * dy) / RADIUS);
    if (m < DEAD_ZONE) {
      this.x = this.y = 0;
    } else {
      const k = Math.min(1, ((m - DEAD_ZONE) / (1 - DEAD_ZONE)) * 1.2) / m;
      this.x = dx / RADIUS * k;
      this.y = dy / RADIUS * k;
    }
  }

  release(): void {
    this.pointerId = -1;
    this.x = this.y = 0;
    this.draw(false);
  }

  /** Reads keyboard + stick and redraws the stick. Call once per frame. */
  update(): void {
    let kx = 0;
    let ky = 0;
    const k = this.keys;
    if (k) {
      if (k.A.isDown || k.LEFT.isDown) kx -= 1;
      if (k.D.isDown || k.RIGHT.isDown) kx += 1;
      if (k.W.isDown || k.UP.isDown) ky -= 1;
      if (k.S.isDown || k.DOWN.isDown) ky += 1;
    }
    if (this.pointerId !== -1) {
      this.draw(true);
      this.anyInput = this.x !== 0 || this.y !== 0;
      if (this.anyInput) return;
    }
    if (kx !== 0 || ky !== 0) {
      const l = Math.sqrt(kx * kx + ky * ky);
      this.x = kx / l;
      this.y = ky / l;
      this.anyInput = true;
    } else {
      this.x = this.y = 0;
      this.anyInput = false;
      if (this.fixedMode && this.pointerId === -1) this.draw(false);
    }
  }

  private draw(active: boolean): void {
    const g = this.g;
    g.clear();
    if (!active && !this.fixedMode) return;
    const bx = active ? this.baseX : FIXED.x;
    const by = active ? this.baseY : FIXED.y;
    const kx = active ? this.knobX : FIXED.x;
    const ky = active ? this.knobY : FIXED.y;
    g.fillStyle(0xffffff, active ? 0.1 : 0.06).fillCircle(bx, by, RADIUS);
    g.lineStyle(5, 0xffffff, active ? 0.4 : 0.22).strokeCircle(bx, by, RADIUS);
    g.fillStyle(0xffffff, active ? 0.42 : 0.2).fillCircle(kx, ky, 38);
    g.lineStyle(4, 0xffffff, active ? 0.65 : 0.3).strokeCircle(kx, ky, 38);
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointermove', this.onMove, this);
    this.scene.input.off('pointerup', this.onUp, this);
    this.scene.input.off('pointerupoutside', this.onUp, this);
    this.g.destroy();
  }
}
