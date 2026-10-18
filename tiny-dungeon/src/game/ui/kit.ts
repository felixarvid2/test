import Phaser from 'phaser';
import { COLORS, FONT, FONT_TITLE } from '../assets';
import { services } from '../../services';

// Shared UI building blocks so every screen looks the same. All sizes are in world px (720x1280).

export const W = 720;
export const H = 1280;
export const MIN_TOUCH = 88; // smallest tappable size

export function hex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

export function textStyle(
  size: number,
  color: number = COLORS.text,
  opts: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color: hex(color),
    stroke: hex(COLORS.outline),
    strokeThickness: Math.max(4, Math.round(size / 8)),
    align: 'center',
    ...opts,
  };
}

export function titleStyle(size: number, color: number = COLORS.gold): Phaser.Types.GameObjects.Text.TextStyle {
  return textStyle(size, color, { fontFamily: FONT_TITLE, strokeThickness: Math.round(size / 6) });
}

export function label(
  scene: Phaser.Scene, x: number, y: number, text: string, size = 36, color: number = COLORS.text,
  opts: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {},
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, textStyle(size, color, opts)).setOrigin(0.5);
}

/** Chunky pixel-style box: dark outline, body, top highlight and bottom shade. */
export function drawBox(
  g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number,
  fill: number = COLORS.panel, border: number = COLORS.panelLight,
): void {
  const r = 10;
  g.fillStyle(COLORS.outline, 1).fillRoundedRect(x - 4, y - 4, w + 8, h + 8, r + 3);
  g.fillStyle(border, 1).fillRoundedRect(x, y, w, h, r);
  g.fillStyle(fill, 1).fillRoundedRect(x + 4, y + 4, w - 8, h - 8, r - 3);
  g.fillStyle(0xffffff, 0.08).fillRoundedRect(x + 8, y + 7, w - 16, Math.min(44, Math.max(4, h * 0.22)), 6);
  g.fillStyle(0x000000, 0.18).fillRect(x + 8, y + h - 12, w - 16, 5);
}

export function panel(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number,
  fill: number = COLORS.panel, border: number = COLORS.panelLight,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  drawBox(g, x - w / 2, y - h / 2, w, h, fill, border);
  return g;
}

export interface ButtonOptions {
  width?: number;
  height?: number;
  color?: number;        // body colour
  textColor?: number;
  fontSize?: number;
  icon?: { key: string; frame: string | number; scale?: number };
  sound?: boolean;
  /** Use the chunky title font (PLAY, big headings). */
  title?: boolean;
  /** Smaller second line under the main text (needs a button height of ~110). */
  subText?: string;
}

/**
 * A large touch-friendly button. Returns a container with `setEnabled(bool)` and `setText(str)`.
 * Fires on pointerup inside the button so a drag that leaves the button cancels the press.
 */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private txt: Phaser.GameObjects.Text;
  private sub?: Phaser.GameObjects.Text;
  private icon?: Phaser.GameObjects.Image;
  private enabled = true;
  private pressed = false;
  readonly w: number;
  readonly h: number;
  private color: number;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, private onClick: () => void, opts: ButtonOptions = {}) {
    super(scene, x, y);
    this.w = opts.width ?? 360;
    this.h = Math.max(MIN_TOUCH, opts.height ?? 96);
    this.color = opts.color ?? 0x3d6e70;
    this.bg = scene.add.graphics();
    const size = opts.fontSize ?? 40;
    const style = opts.title ? titleStyle(size, opts.textColor ?? COLORS.text) : textStyle(size, opts.textColor ?? COLORS.text);
    this.txt = scene.add.text(0, opts.subText ? -16 : -2, text, style).setOrigin(0.5);
    this.add([this.bg, this.txt]);
    if (opts.subText) {
      this.sub = scene.add.text(0, 26, opts.subText, textStyle(28, COLORS.text, { color: '#d8cfe0' })).setOrigin(0.5);
      this.add(this.sub);
    }
    if (opts.icon) {
      this.icon = scene.add.image(0, 0, opts.icon.key, opts.icon.frame).setScale(opts.icon.scale ?? 3);
      this.add(this.icon);
      this.layoutIcon();
    }
    this.redraw();
    this.setSize(this.w, this.h);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => { if (this.enabled) { this.pressed = true; this.setScale(0.95); } });
    this.on('pointerout', () => { this.pressed = false; this.setScale(1); this.redraw(); });
    this.on('pointerover', () => { if (this.enabled) this.redraw(true); });
    this.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      // A drag that started on the button (scrolling a list) is not a tap.
      const fire = this.pressed && this.enabled && pointer.getDistance() < 24;
      this.pressed = false;
      this.setScale(1);
      if (fire) {
        if (opts.sound !== false) services?.audio.play('click');
        this.onClick();
      }
    });
    scene.add.existing(this);
  }

  private layoutIcon(): void {
    if (!this.icon) return;
    const iconW = this.icon.displayWidth;
    if (this.sub) {
      // Two text lines: icon at the left edge, the lines centred in the space that is left.
      const left = -this.w / 2 + 26 + iconW;
      const cx = (left + 14 + this.w / 2 - 16) / 2;
      this.icon.setX(-this.w / 2 + 26 + iconW / 2);
      this.txt.setX(cx);
      this.sub.setX(cx);
      return;
    }
    const total = iconW + 12 + this.txt.width;
    this.icon.setX(-total / 2 + iconW / 2);
    this.txt.setX(-total / 2 + iconW + 12 + this.txt.width / 2);
  }

  private redraw(hover = false): void {
    const body = this.enabled ? (hover ? Phaser.Display.Color.ValueToColor(this.color).lighten(12).color : this.color) : 0x3a3440;
    const border = this.enabled ? Phaser.Display.Color.ValueToColor(this.color).lighten(25).color : 0x4a4450;
    this.bg.clear();
    drawBox(this.bg, -this.w / 2, -this.h / 2, this.w, this.h, body, border);
    this.txt.setAlpha(this.enabled ? 1 : 0.5);
    this.sub?.setAlpha(this.enabled ? 1 : 0.5);
    this.icon?.setAlpha(this.enabled ? 1 : 0.5);
  }

  setEnabled(on: boolean): this {
    this.enabled = on;
    this.redraw();
    return this;
  }

  setText(text: string): this {
    this.txt.setText(text);
    this.layoutIcon();
    return this;
  }

  setSubText(text: string): this {
    this.sub?.setText(text);
    return this;
  }

  setColor(color: number): this {
    this.color = color;
    this.redraw();
    return this;
  }
}

/** Pops an object in with a little overshoot (skipped when reduced motion is on). */
export function popIn(scene: Phaser.Scene, obj: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, delay = 0): void {
  if (services?.save.data.settings.reducedMotion) return;
  const target = obj as unknown as Phaser.GameObjects.Components.Transform;
  const sx = target.scaleX;
  const sy = target.scaleY;
  target.setScale(sx * 0.6, sy * 0.6);
  scene.tweens.add({ targets: obj, scaleX: sx, scaleY: sy, duration: 260, delay, ease: 'Back.Out' });
}

/** Fades the camera out, then starts the next scene (which should call fadeInScene). */
export function goto(scene: Phaser.Scene, key: string, data?: object): void {
  const cam = scene.cameras.main;
  if (services?.save.data.settings.reducedMotion) {
    scene.scene.start(key, data);
    return;
  }
  cam.fadeOut(180, 20, 12, 28);
  cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => scene.scene.start(key, data));
}

export function fadeInScene(scene: Phaser.Scene): void {
  if (!services?.save.data.settings.reducedMotion) scene.cameras.main.fadeIn(220, 20, 12, 28);
}

/** Dark full-screen veil used behind overlays; swallows input so the scene below gets none. */
export function veil(scene: Phaser.Scene, alpha = 0.7): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(W / 2, H / 2, W, H, COLORS.bg, alpha).setInteractive();
}

/** Small toast message that floats up and fades. */
export function toast(scene: Phaser.Scene, text: string, color: number = COLORS.text, y = 220): void {
  const t = label(scene, W / 2, y, text, 40, color).setDepth(10000);
  scene.tweens.add({ targets: t, y: y - 60, alpha: 0, delay: 900, duration: 600, onComplete: () => t.destroy() });
}
