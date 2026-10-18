import Phaser from 'phaser';
import { formatNumber } from './format';
import { reducedMotion } from './env';
import { crispText } from './text';
import { DEPTH, PALETTE } from './theme';

export interface PillOptions {
  /** Texture key of the leading icon (e.g. 'icon_coin'). */
  icon?: string;
  text?: string;
  /** Numeric shortcut: shown with formatNumber (1.2k). */
  value?: number;
  height?: number;
  minWidth?: number;
  /** Border colour, default gold. */
  color?: number;
  /** Which side of x the pill grows from: 'left' (x = left edge), 'right' (x = right edge) or 'center'. */
  align?: 'left' | 'center' | 'right';
  depth?: number;
}

export interface UIPill {
  readonly container: Phaser.GameObjects.Container;
  readonly width: number;
  setText(text: string): void;
  setValue(n: number): void;
  /** World position of the icon (target for flying coins). */
  iconPoint(): { x: number; y: number };
  pulse(): void;
  destroy(): void;
}

/** Rounded counter pill: icon + text (coins, wave, lives). Grows with its text. */
export function createPill(scene: Phaser.Scene, x: number, y: number, opts: PillOptions = {}): UIPill {
  const h = opts.height ?? 64;
  const align = opts.align ?? 'left';
  const border = opts.color ?? PALETTE.gold;
  const container = scene.add.container(x, y).setDepth(opts.depth ?? DEPTH.hud);
  const bg = scene.add.graphics();
  const hasIcon = !!opts.icon && scene.textures.exists(opts.icon);
  const icon = hasIcon ? scene.add.image(0, 0, opts.icon as string).setDisplaySize(h * 0.8, h * 0.8) : undefined;
  const txt = crispText(scene, 0, 0, opts.text ?? (opts.value !== undefined ? formatNumber(opts.value) : ''), { preset: 'number', size: Math.round(h * 0.52) });
  container.add([bg, txt]);
  if (icon) container.add(icon);
  let width = 0;

  const layout = () => {
    const pad = h * 0.3;
    const iconW = icon ? h * 0.8 + 6 : 0;
    width = Math.max(opts.minWidth ?? 0, pad * 2 + iconW + txt.width);
    const left = align === 'left' ? 0 : align === 'right' ? -width : -width / 2;
    bg.clear();
    bg.fillStyle(PALETTE.shadow, 0.3).fillRoundedRect(left, -h / 2 + 5, width, h, h / 2);
    bg.fillStyle(PALETTE.outline, 1).fillRoundedRect(left - 3, -h / 2 - 3, width + 6, h + 6, h / 2 + 3);
    bg.fillStyle(border, 1).fillRoundedRect(left, -h / 2, width, h, h / 2);
    bg.fillStyle(PALETTE.panelDark, 1).fillRoundedRect(left + 4, -h / 2 + 4, width - 8, h - 8, h / 2 - 4);
    bg.fillStyle(0xffffff, 0.07).fillRoundedRect(left + 10, -h / 2 + 8, width - 20, h * 0.28, h * 0.14);
    if (icon) icon.setPosition(left + pad * 0.7 + (h * 0.8) / 2, 0);
    txt.setPosition(left + pad + iconW + txt.width / 2 - (icon ? pad * 0.3 : 0), 0);
  };
  layout();

  const api: UIPill = {
    container,
    get width() { return width; },
    setText(t) { txt.setText(t); layout(); },
    setValue(n) { txt.setText(formatNumber(n)); layout(); },
    iconPoint() {
      const p = new Phaser.Math.Vector2();
      container.getWorldTransformMatrix().transformPoint(icon?.x ?? 0, icon?.y ?? 0, p);
      return { x: p.x, y: p.y };
    },
    pulse() {
      if (reducedMotion()) return;
      scene.tweens.killTweensOf(container);
      container.setScale(1);
      scene.tweens.add({ targets: container, scale: 1.12, duration: 90, yoyo: true, ease: 'Sine.Out' });
    },
    destroy() { scene.tweens.killTweensOf(container); container.destroy(); },
  };
  return api;
}
