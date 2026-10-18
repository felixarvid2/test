import Phaser from 'phaser';
import { reducedMotion } from './env';
import { crispText } from './text';
import { DEPTH, H, PALETTE, W } from './theme';

export type ToastKind = 'info' | 'success' | 'danger' | 'gold';
const TOAST_COLORS: Record<ToastKind, number> = {
  info: PALETTE.info, success: PALETTE.success, danger: PALETTE.danger, gold: PALETTE.gold,
};

export interface ToastOptions {
  kind?: ToastKind;
  /** Icon texture key shown left of the text. */
  icon?: string;
  /** Visible time in ms (default 1800). */
  duration?: number;
  /** Resting y (default 150). */
  y?: number;
}

/** Small pill that slides in from the top, waits, slides out and destroys itself. */
export function showToast(scene: Phaser.Scene, text: string, opts: ToastOptions = {}): Phaser.GameObjects.Container {
  const color = TOAST_COLORS[opts.kind ?? 'info'];
  const restY = opts.y ?? 150;
  const label = crispText(scene, 0, 0, text, { preset: 'body', size: 30, wordWrap: { width: W - 200 } });
  const iconOk = !!opts.icon && scene.textures.exists(opts.icon);
  const iconSize = 48;
  const w = Math.min(W - 48, label.width + 64 + (iconOk ? iconSize + 10 : 0));
  const h = Math.max(72, label.height + 28);
  const c = scene.add.container(W / 2, -h).setDepth(DEPTH.toast);
  const bg = scene.add.graphics();
  bg.fillStyle(PALETTE.shadow, 0.35).fillRoundedRect(-w / 2, -h / 2 + 6, w, h, h / 2);
  bg.fillStyle(PALETTE.outline, 1).fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, h / 2 + 3);
  bg.fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  bg.fillStyle(PALETTE.panel, 1).fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, h / 2 - 4);
  c.add(bg);
  const shift = iconOk ? (iconSize + 10) / 2 : 0;
  if (iconOk) c.add(scene.add.image(-w / 2 + 32 + iconSize / 2, 0, opts.icon as string).setDisplaySize(iconSize, iconSize));
  label.setX(shift);
  c.add(label);

  const dur = opts.duration ?? 1800;
  if (reducedMotion()) {
    c.setY(restY);
    scene.time.delayedCall(dur, () => c.destroy());
  } else {
    scene.tweens.add({
      targets: c, y: restY, duration: 260, ease: 'Back.Out',
      onComplete: () => scene.tweens.add({
        targets: c, y: -h, alpha: 0, delay: dur, duration: 220, ease: 'Sine.In', onComplete: () => c.destroy(),
      }),
    });
  }
  return c;
}

export interface BannerOptions {
  /** Second smaller line. */
  sub?: string;
  /** Band colour, default danger red (wave / boss warnings); pass PALETTE.gold etc. */
  color?: number;
  duration?: number;
  y?: number;
}

/** Full-width announcement band (WAVE 5, BOSS INCOMING): scales in, holds, fades out. */
export function showBanner(scene: Phaser.Scene, title: string, opts: BannerOptions = {}): Phaser.GameObjects.Container {
  const color = opts.color ?? PALETTE.danger;
  const h = opts.sub ? 170 : 130;
  const c = scene.add.container(W / 2, opts.y ?? H * 0.3).setDepth(DEPTH.toast);
  const bg = scene.add.graphics();
  bg.fillStyle(PALETTE.outline, 1).fillRect(-W / 2, -h / 2 - 5, W, h + 10);
  bg.fillStyle(color, 0.95).fillRect(-W / 2, -h / 2, W, h);
  bg.fillStyle(0xffffff, 0.16).fillRect(-W / 2, -h / 2, W, h * 0.3);
  bg.fillStyle(0x000000, 0.2).fillRect(-W / 2, h / 2 - 10, W, 10);
  c.add(bg);
  c.add(crispText(scene, 0, opts.sub ? -22 : 0, title, { preset: 'title', size: 60 }));
  if (opts.sub) c.add(crispText(scene, 0, 42, opts.sub, { preset: 'body', size: 30 }));
  const dur = opts.duration ?? 1600;
  if (reducedMotion()) {
    scene.time.delayedCall(dur, () => c.destroy());
  } else {
    c.setScale(1, 0.01).setAlpha(0);
    scene.tweens.add({
      targets: c, scaleY: 1, alpha: 1, duration: 220, ease: 'Back.Out',
      onComplete: () => scene.tweens.add({ targets: c, alpha: 0, scaleY: 0.2, delay: dur, duration: 260, ease: 'Sine.In', onComplete: () => c.destroy() }),
    });
  }
  return c;
}
