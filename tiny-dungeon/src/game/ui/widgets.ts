import Phaser from 'phaser';
import { COLORS, ICONS_KEY } from '../assets';
import { services } from '../../services';
import { countTo, fmt, reduced } from './fx';
import { Button, MIN_TOUCH, W, drawBox, hex, textStyle, titleStyle } from './kit';

// Reusable widgets for the menu scenes.

export interface PillOptions {
  icon: string;
  color?: number;        // border colour
  height?: number;
  align?: 'left' | 'right';
  format?: (n: number) => string;
  textColor?: number;
}

/** Icon + number in a rounded box (gold, tokens, counts). Grows with its text. */
export class CounterPill extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private txt: Phaser.GameObjects.Text;
  private img: Phaser.GameObjects.Image;
  private _value: number;
  private readonly h: number;
  private readonly align: 'left' | 'right';
  private readonly fmtFn: (n: number) => string;
  private tween?: Phaser.Tweens.Tween;
  /** Current box width (it grows with the number). */
  boxWidth = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, value: number, private readonly opts: PillOptions) {
    super(scene, x, y);
    this.h = opts.height ?? 64;
    this.align = opts.align ?? 'left';
    this.fmtFn = opts.format ?? fmt;
    this._value = value;
    this.bg = scene.add.graphics();
    this.img = scene.add.image(0, 0, ICONS_KEY, opts.icon).setScale(3);
    this.txt = scene.add.text(0, -2, this.fmtFn(value), textStyle(36, opts.textColor ?? COLORS.text)).setOrigin(0, 0.5);
    this.add([this.bg, this.img, this.txt]);
    this.layout();
    scene.add.existing(this);
  }

  get value(): number { return this._value; }

  /** Centre of the icon in world coordinates (target / origin for flying coins). */
  iconPoint(): { x: number; y: number } {
    return { x: this.x + this.img.x, y: this.y + this.img.y };
  }

  private layout(): void {
    const pad = 14;
    const iconW = 48;
    const w = pad + iconW + 8 + this.txt.width + pad + 4;
    this.boxWidth = w;
    const left = this.align === 'left' ? 0 : -w;
    this.bg.clear();
    drawBox(this.bg, left, -this.h / 2, w, this.h, 0x201528, this.opts.color ?? COLORS.panelLight);
    this.img.setPosition(left + pad + iconW / 2, 0);
    this.txt.setPosition(left + pad + iconW + 8, -2);
  }

  setValue(v: number): this {
    this._value = v;
    this.txt.setText(this.fmtFn(v));
    this.layout();
    return this;
  }

  /** Counts to a new value (spending / earning feedback). */
  tweenTo(v: number, ms = 600): void {
    this.tween?.stop();
    countTo(this.scene, this._value, v, ms, (n) => this.setValue(n));
  }

  pulse(color: number = COLORS.gold): void {
    if (reduced()) return;
    this.scene.tweens.add({ targets: this, scale: 1.12, duration: 90, yoyo: true, ease: 'Sine.Out' });
    this.txt.setColor(hex(color));
    this.scene.time.delayedCall(260, () => this.txt.setColor(hex(this.opts.textColor ?? COLORS.text)));
  }
}

/** Row of level pips (filled / empty). */
export class Pips extends Phaser.GameObjects.Container {
  private fills: Phaser.GameObjects.Rectangle[] = [];
  readonly span: number;

  constructor(scene: Phaser.Scene, x: number, y: number, level: number, readonly max: number, size = 20, gap = 5, private readonly color: number = COLORS.gold) {
    super(scene, x, y);
    for (let i = 0; i < max; i++) {
      const px = i * (size + gap) + size / 2;
      const outline = scene.add.rectangle(px, 0, size + 4, size + 4, COLORS.outline);
      const fill = scene.add.rectangle(px, 0, size, size, i < level ? color : 0x3a2b45);
      this.add([outline, fill]);
      this.fills.push(fill);
    }
    this.span = max * (size + gap) - gap;
    scene.add.existing(this);
  }

  setLevel(level: number, pop = true): void {
    this.fills.forEach((f, i) => {
      const on = i < level;
      f.setFillStyle(on ? this.color : 0x3a2b45);
    });
    if (pop && level > 0 && !reduced()) {
      const f = this.fills[level - 1];
      if (f) this.scene.tweens.add({ targets: f, scale: { from: 1.9, to: 1 }, duration: 320, ease: 'Back.Out' });
    }
  }

  /** Marks the pip that the next level will fill (pulsing outline) - used on upgrade cards. */
  highlight(index: number, color: number): void {
    const f = this.fills[index];
    if (!f) return;
    f.setFillStyle(color);
    if (!reduced()) this.scene.tweens.add({ targets: f, alpha: { from: 1, to: 0.35 }, duration: 520, yoyo: true, repeat: -1 });
  }
}

/** Thin progress bar. */
export class ProgressBar extends Phaser.GameObjects.Graphics {
  constructor(scene: Phaser.Scene, x: number, y: number, private readonly barW: number, private readonly barH: number, private readonly color: number = COLORS.xp) {
    super(scene, { x, y });
    scene.add.existing(this);
    this.set(0);
  }

  set(p: number): void {
    const v = Phaser.Math.Clamp(p, 0, 1);
    this.clear();
    this.fillStyle(COLORS.outline, 1).fillRoundedRect(-3, -3, this.barW + 6, this.barH + 6, 6);
    this.fillStyle(0x3a2b45, 1).fillRoundedRect(0, 0, this.barW, this.barH, 4);
    if (v > 0) {
      this.fillStyle(this.color, 1).fillRoundedRect(0, 0, Math.max(this.barH, this.barW * v), this.barH, 4);
      this.fillStyle(0xffffff, 0.25).fillRect(4, 3, Math.max(0, this.barW * v - 8), 3);
    }
  }
}

/** Small rounded label chip (badges, synergy hints). Returns the container; `width` is its size. */
export function chip(
  scene: Phaser.Scene, x: number, y: number, text: string, color: number, opts: { icon?: string; textColor?: number; size?: number; height?: number } = {},
): Phaser.GameObjects.Container & { width: number } {
  const size = opts.size ?? 28;
  const h = opts.height ?? 44;
  const t = scene.add.text(0, -2, text, textStyle(size, opts.textColor ?? COLORS.text, { strokeThickness: 4 })).setOrigin(0, 0.5);
  const iconW = opts.icon ? 34 : 0;
  const w = 20 + iconW + t.width + 10;
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(COLORS.outline, 1).fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 12);
  g.fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 10);
  g.fillStyle(0xffffff, 0.15).fillRoundedRect(-w / 2 + 4, -h / 2 + 3, w - 8, h * 0.3, 6);
  c.add(g);
  let tx = -w / 2 + 12;
  if (opts.icon) {
    c.add(scene.add.image(tx + 13, 0, ICONS_KEY, opts.icon).setScale(2));
    tx += iconW;
  }
  t.setX(tx);
  c.add(t);
  return Object.assign(c, { width: w });
}

/** Horizontal slider with a big draggable knob; values 0..1. */
export class Slider extends Phaser.GameObjects.Container {
  private track: Phaser.GameObjects.Graphics;
  private knob: Phaser.GameObjects.Container;
  private _value: number;
  private dragging = false;
  private readonly trackW: number;

  constructor(
    scene: Phaser.Scene, x: number, y: number, width: number, value: number,
    private readonly onChange: (v: number) => void, private readonly onRelease?: (v: number) => void,
  ) {
    super(scene, x, y);
    this.trackW = width;
    this._value = Phaser.Math.Clamp(value, 0, 1);
    this.track = scene.add.graphics();
    const kg = scene.add.graphics();
    kg.fillStyle(COLORS.outline, 1).fillCircle(0, 0, 34);
    kg.fillStyle(COLORS.gold, 1).fillCircle(0, 0, 29);
    kg.fillStyle(0xffffff, 0.35).fillCircle(-8, -9, 9);
    kg.fillStyle(0x000000, 0.18).fillCircle(5, 9, 15);
    this.knob = scene.add.container(0, 0, [kg]);
    this.add([this.track, this.knob]);
    this.setSize(width + 96, MIN_TOUCH + 12);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', (p: Phaser.Input.Pointer) => this.begin(p));
    scene.input.on('pointermove', this.move, this);
    scene.input.on('pointerup', this.end, this);
    scene.input.on('pointerupoutside', this.end, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unhook());
    this.on('destroy', () => this.unhook());
    this.redraw();
    scene.add.existing(this);
  }

  get value(): number { return this._value; }

  private unhook(): void {
    this.scene?.input.off('pointermove', this.move, this);
    this.scene?.input.off('pointerup', this.end, this);
    this.scene?.input.off('pointerupoutside', this.end, this);
  }

  private begin(p: Phaser.Input.Pointer): void {
    this.dragging = true;
    this.knob.setScale(1.15);
    this.setFromPointer(p);
  }

  private move(p: Phaser.Input.Pointer): void {
    if (this.dragging && p.isDown) this.setFromPointer(p);
  }

  private end(): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.knob.setScale(1);
    this.onRelease?.(this._value);
  }

  private setFromPointer(p: Phaser.Input.Pointer): void {
    const local = p.x - this.getWorldTransformMatrix().tx;
    const v = Phaser.Math.Clamp((local + this.trackW / 2) / this.trackW, 0, 1);
    const snapped = Math.round(v * 20) / 20;
    if (snapped === this._value) return;
    this._value = snapped;
    this.redraw();
    this.onChange(snapped);
  }

  private redraw(): void {
    const w = this.trackW;
    const h = 28;
    this.track.clear();
    this.track.fillStyle(COLORS.outline, 1).fillRoundedRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 16);
    this.track.fillStyle(0x3a2b45, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    if (this._value > 0) {
      this.track.fillStyle(0x3d9e6c, 1).fillRoundedRect(-w / 2, -h / 2, Math.max(h, w * this._value), h, 12);
      this.track.fillStyle(0xffffff, 0.22).fillRoundedRect(-w / 2 + 6, -h / 2 + 4, Math.max(0, w * this._value - 12), 6, 3);
    }
    this.knob.x = -w / 2 + w * this._value;
  }
}

/** A full-width row with a label and an on/off switch. The whole row is the tap target. */
export class ToggleRow extends Phaser.GameObjects.Container {
  private sw: Phaser.GameObjects.Graphics;
  private handle: Phaser.GameObjects.Ellipse;
  private stateTxt: Phaser.GameObjects.Text;
  private _on: boolean;
  private readonly swX: number;

  constructor(
    scene: Phaser.Scene, x: number, y: number, width: number, text: string, on: boolean,
    private readonly onChange: (on: boolean) => void, private readonly stateText: (on: boolean) => string = (v) => (v ? 'ON' : 'OFF'),
  ) {
    super(scene, x, y);
    this._on = on;
    const bg = scene.add.graphics();
    drawBox(bg, -width / 2, -MIN_TOUCH / 2, width, MIN_TOUCH, COLORS.panel, COLORS.panelLight);
    const t = scene.add.text(-width / 2 + 28, -2, text, textStyle(36)).setOrigin(0, 0.5);
    this.stateTxt = scene.add.text(width / 2 - 170, -2, '', textStyle(32)).setOrigin(1, 0.5);
    this.sw = scene.add.graphics();
    this.handle = scene.add.ellipse(0, 0, 40, 40, 0xffffff);
    this.handle.setStrokeStyle(4, COLORS.outline);
    this.add([bg, t, this.stateTxt, this.sw, this.handle]);
    this.setSize(width, MIN_TOUCH);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() > 24) return;
      services?.audio.play('click');
      this.set(!this._on, true);
      this.onChange(this._on);
    });
    this.swX = width / 2 - 100;
    this.set(on, false);
    scene.add.existing(this);
  }

  get isOn(): boolean { return this._on; }

  set(on: boolean, animate: boolean): void {
    this._on = on;
    const w = 96;
    const h = 52;
    this.sw.clear();
    this.sw.fillStyle(COLORS.outline, 1).fillRoundedRect(this.swX - w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 30);
    this.sw.fillStyle(on ? 0x3d9e6c : 0x5a4a62, 1).fillRoundedRect(this.swX - w / 2, -h / 2, w, h, 26);
    const hx = this.swX + (on ? 22 : -22);
    if (animate && !reduced()) this.scene.tweens.add({ targets: this.handle, x: hx, duration: 120, ease: 'Sine.Out' });
    else this.handle.x = hx;
    this.stateTxt.setText(this.stateText(on));
    this.stateTxt.setColor(hex(on ? COLORS.heal : COLORS.textDim));
  }
}

/** Standard header: Back button (left), optional right-side content, big title underneath. */
export function header(scene: Phaser.Scene, title: string, onBack: () => void, y = 150): { back: Button; title: Phaser.GameObjects.Text } {
  const back = new Button(scene, 24 + 100, 60, '◀ Back', onBack, { width: 200, height: MIN_TOUCH, color: 0x5a4a62, fontSize: 36 });
  const t = scene.add.text(W / 2, y, title, titleStyle(52)).setOrigin(0.5);
  return { back, title: t };
}

/** Pops a quick "tap feedback" scale on any object. */
export function punch(scene: Phaser.Scene, target: object, to = 1.15): void {
  if (reduced()) return;
  scene.tweens.add({ targets: target, scale: to, duration: 90, yoyo: true, ease: 'Sine.Out' });
}
