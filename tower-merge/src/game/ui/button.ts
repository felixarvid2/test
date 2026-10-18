import Phaser from 'phaser';
import { touchSize } from './format';
import { playSfx, reducedMotion } from './env';
import { crispText, fitText } from './text';
import { BUTTON_COLORS, type ButtonStyleName, DEPTH, MIN_TOUCH, PALETTE } from './theme';

export interface ButtonOptions {
  label?: string;
  /** Texture key of an icon shown left of the label (or alone when there is no label). */
  icon?: string;
  /** Default 280. */
  width?: number;
  /** Default 96. The hit area is never smaller than MIN_TOUCH (88) either way. */
  height?: number;
  style?: ButtonStyleName;
  /** Label font size, default 36. */
  fontSize?: number;
  onClick?: () => void;
  /** Play the 'click' sfx (default true). */
  sound?: boolean;
  enabled?: boolean;
  depth?: number;
}

export interface UIButton {
  readonly container: Phaser.GameObjects.Container;
  readonly width: number;
  readonly height: number;
  readonly enabled: boolean;
  setEnabled(enabled: boolean): UIButton;
  setLabel(label: string): UIButton;
  setIcon(textureKey: string | undefined): UIButton;
  setOnClick(fn: (() => void) | undefined): UIButton;
  setStyle(style: ButtonStyleName): UIButton;
  setPosition(x: number, y: number): UIButton;
  setVisible(v: boolean): UIButton;
  destroy(): void;
}

const LIP = 8;

/** Wires press-squash / release-bounce feedback and tap detection on a zone. */
export function attachPress(
  scene: Phaser.Scene, zone: Phaser.GameObjects.Zone, target: Phaser.GameObjects.Container,
  isEnabled: () => boolean, onFire: () => void, onPressChange?: (down: boolean) => void,
): void {
  let down = false;
  const release = (bounce: boolean) => {
    if (!down) return;
    down = false;
    onPressChange?.(false);
    scene.tweens.killTweensOf(target);
    if (reducedMotion()) target.setScale(1);
    else scene.tweens.add({ targets: target, scaleX: 1, scaleY: 1, duration: bounce ? 220 : 90, ease: bounce ? 'Back.Out' : 'Sine.Out' });
  };
  zone.on('pointerdown', () => {
    if (!isEnabled()) return;
    down = true;
    onPressChange?.(true);
    scene.tweens.killTweensOf(target);
    if (reducedMotion()) target.setScale(0.96);
    else scene.tweens.add({ targets: target, scaleX: 0.93, scaleY: 0.9, duration: 70, ease: 'Sine.Out' });
  });
  zone.on('pointerup', () => {
    if (!down) return;
    release(true);
    onFire();
  });
  zone.on('pointerout', () => release(false));
  zone.on('pointerupoutside', () => release(false));
}

/**
 * Chunky rounded button: dark outline, lip, two-tone face, gloss. (x, y) is the CENTRE.
 * Fires onClick on release inside the button; press squashes, release bounces. Disabled buttons
 * are greyed and ignore taps.
 */
export function createButton(scene: Phaser.Scene, x: number, y: number, opts: ButtonOptions = {}): UIButton {
  const w = opts.width ?? 280;
  const h = opts.height ?? 96;
  let style = opts.style ?? 'primary';
  let enabled = opts.enabled ?? true;
  let onClick = opts.onClick;
  let pressed = false;
  const fontSize = opts.fontSize ?? 36;

  const container = scene.add.container(x, y).setDepth(opts.depth ?? DEPTH.hud);
  const gfx = scene.add.graphics();
  const label = crispText(scene, 0, 0, opts.label ?? '', { preset: 'heading', size: fontSize });
  let iconImg: Phaser.GameObjects.Image | undefined;
  const zone = scene.add.zone(0, 0, touchSize(w), touchSize(h)).setInteractive({ useHandCursor: true });
  container.add([gfx, label, zone]);
  container.setSize(w, h);

  const draw = () => {
    const c = enabled ? BUTTON_COLORS[style] : { top: PALETTE.disabled, bottom: PALETTE.disabledDark, rim: 0x23283d, text: 0xffffff };
    const r = Math.min(26, h / 2.4);
    const dy = pressed ? LIP - 3 : 0; // face sinks when pressed
    const fh = h - LIP;
    gfx.clear();
    gfx.fillStyle(PALETTE.shadow, 0.35).fillRoundedRect(-w / 2, -h / 2 + 8, w, h, r + 2);
    gfx.fillStyle(PALETTE.outline, 1).fillRoundedRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, r + 4);
    gfx.fillStyle(c.rim, 1).fillRoundedRect(-w / 2, -h / 2 + LIP, w, h - LIP, r);
    gfx.fillStyle(c.bottom, 1).fillRoundedRect(-w / 2, -h / 2 + dy, w, fh, r);
    gfx.fillStyle(c.top, 1).fillRoundedRect(-w / 2 + 4, -h / 2 + 4 + dy, w - 8, fh * 0.56, Math.max(6, r - 4));
    if (enabled) gfx.fillStyle(0xffffff, 0.28).fillRoundedRect(-w / 2 + 14, -h / 2 + 9 + dy, w - 28, Math.max(6, fh * 0.12), 6);
    label.setStyle({ stroke: '#' + (c.rim & 0xffffff).toString(16).padStart(6, '0') });
    label.setAlpha(enabled ? 1 : 0.7);
    layoutContent(dy - LIP / 2 + 2);
    if (iconImg) iconImg.setTint(enabled ? 0xffffff : 0x8a8fa6);
  };

  const layoutContent = (dy: number) => {
    const iconSize = Math.min(h - 28, 64);
    const hasLabel = label.text.length > 0;
    const pad = 28;
    const maxLabelW = w - pad * 2 - (iconImg ? iconSize + 10 : 0);
    fitText(label, maxLabelW);
    const labelW = hasLabel ? label.width * label.scaleX : 0;
    const total = labelW + (iconImg ? iconSize + (hasLabel ? 10 : 0) : 0);
    let cx = -total / 2;
    if (iconImg) {
      iconImg.setDisplaySize(iconSize, iconSize).setPosition(cx + iconSize / 2, dy);
      cx += iconSize + (hasLabel ? 10 : 0);
    }
    label.setPosition(cx + labelW / 2, dy);
  };

  const setIconInternal = (key: string | undefined) => {
    iconImg?.destroy();
    iconImg = undefined;
    if (key && scene.textures.exists(key)) {
      iconImg = scene.add.image(0, 0, key);
      container.add(iconImg);
      container.bringToTop(zone);
    }
  };

  setIconInternal(opts.icon);
  draw();

  attachPress(scene, zone, container, () => enabled, () => {
    if (opts.sound !== false) playSfx('click');
    onClick?.();
  }, (down) => { pressed = down; draw(); });

  const api: UIButton = {
    container, width: w, height: h,
    get enabled() { return enabled; },
    setEnabled(e) {
      enabled = e;
      if (!e) { pressed = false; scene.tweens.killTweensOf(container); container.setScale(1); }
      if (zone.input) zone.input.cursor = e ? 'pointer' : 'default';
      draw();
      return api;
    },
    setLabel(text) { label.setText(text); draw(); return api; },
    setIcon(key) { setIconInternal(key); draw(); return api; },
    setOnClick(fn) { onClick = fn; return api; },
    setStyle(s) { style = s; draw(); return api; },
    setPosition(px, py) { container.setPosition(px, py); return api; },
    setVisible(v) { container.setVisible(v); if (zone.input) zone.input.enabled = v; return api; },
    destroy() { scene.tweens.killTweensOf(container); container.destroy(); },
  };
  return api;
}

export interface IconButtonOptions {
  icon?: string;
  /** Visual diameter, default 88. */
  size?: number;
  style?: ButtonStyleName;
  onClick?: () => void;
  sound?: boolean;
  enabled?: boolean;
  depth?: number;
}

export interface UIIconButton {
  readonly container: Phaser.GameObjects.Container;
  readonly size: number;
  setEnabled(enabled: boolean): UIIconButton;
  setIcon(textureKey: string): UIIconButton;
  setOnClick(fn: (() => void) | undefined): UIIconButton;
  setPosition(x: number, y: number): UIIconButton;
  destroy(): void;
}

/** Round icon button (pause, settings, close). (x, y) is the centre; hit area >= 88 px. */
export function createIconButton(scene: Phaser.Scene, x: number, y: number, opts: IconButtonOptions = {}): UIIconButton {
  const size = opts.size ?? MIN_TOUCH;
  const r = size / 2;
  const style = opts.style ?? 'secondary';
  let enabled = opts.enabled ?? true;
  let onClick = opts.onClick;
  let pressed = false;
  const container = scene.add.container(x, y).setDepth(opts.depth ?? DEPTH.hud);
  const gfx = scene.add.graphics();
  let img: Phaser.GameObjects.Image | undefined;
  const zone = scene.add.zone(0, 0, touchSize(size), touchSize(size)).setInteractive({ useHandCursor: true });
  container.add([gfx, zone]);
  container.setSize(size, size);

  const setImg = (key?: string) => {
    img?.destroy();
    img = undefined;
    if (key && scene.textures.exists(key)) {
      img = scene.add.image(0, 0, key).setDisplaySize(size * 0.62, size * 0.62);
      container.add(img);
      container.bringToTop(zone);
    }
  };
  const draw = () => {
    const c = enabled ? BUTTON_COLORS[style] : { top: PALETTE.disabled, bottom: PALETTE.disabledDark, rim: 0x23283d, text: 0xffffff };
    const dy = pressed ? 3 : 0;
    gfx.clear();
    gfx.fillStyle(PALETTE.shadow, 0.35).fillCircle(0, 6, r + 2);
    gfx.fillStyle(PALETTE.outline, 1).fillCircle(0, 0, r + 4);
    gfx.fillStyle(c.rim, 1).fillCircle(0, 5, r);
    gfx.fillStyle(c.bottom, 1).fillCircle(0, dy, r - 1);
    gfx.fillStyle(c.top, 1).fillCircle(0, dy - r * 0.12, r * 0.82);
    if (enabled) gfx.fillStyle(0xffffff, 0.25).fillEllipse(-r * 0.12, dy - r * 0.5, r * 0.9, r * 0.32);
    if (img) { img.setPosition(0, dy); img.setTint(enabled ? 0xffffff : 0x8a8fa6); }
  };
  setImg(opts.icon);
  draw();
  attachPress(scene, zone, container, () => enabled, () => {
    if (opts.sound !== false) playSfx('click');
    onClick?.();
  }, (d) => { pressed = d; draw(); });

  const api: UIIconButton = {
    container, size,
    setEnabled(e) { enabled = e; if (!e) { pressed = false; container.setScale(1); } draw(); return api; },
    setIcon(key) { setImg(key); draw(); return api; },
    setOnClick(fn) { onClick = fn; return api; },
    setPosition(px, py) { container.setPosition(px, py); return api; },
    destroy() { scene.tweens.killTweensOf(container); container.destroy(); },
  };
  return api;
}
