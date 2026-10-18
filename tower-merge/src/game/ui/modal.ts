import Phaser from 'phaser';
import { playSfx, reducedMotion } from './env';
import { createButton } from './button';
import type { ButtonStyleName } from './theme';
import { drawPanelBody } from './panel';
import { crispText } from './text';
import { DEPTH, H, PALETTE, W } from './theme';

export interface ModalButton {
  label: string;
  style?: ButtonStyleName;
  /** Called on tap; the modal closes afterwards unless `keepOpen`. */
  onClick?: () => void;
  keepOpen?: boolean;
}

export interface ModalOptions {
  title?: string;
  body?: string;
  /** Default 600. */
  width?: number;
  /** 1 or 2 buttons sit side by side, more are stacked. */
  buttons?: ModalButton[];
  /** Tapping the dim area closes the modal (default false). */
  closeOnDim?: boolean;
  /**
   * Adds custom content between body and buttons. Receives the (centre-origin) container and the
   * y of the content top; return the height it used.
   */
  build?: (container: Phaser.GameObjects.Container, top: number) => number;
  onClose?: () => void;
  depth?: number;
}

export interface UIModal {
  readonly container: Phaser.GameObjects.Container;
  close(): void;
}

/**
 * Dim background + centred panel (title, body, buttons). The dim layer is interactive, so it
 * swallows taps on everything below it in the same scene. Open it from the TOPMOST scene (e.g.
 * the Pause scene, not the Game scene beneath) so lower scenes are covered too.
 */
export function openModal(scene: Phaser.Scene, opts: ModalOptions = {}): UIModal {
  const w = opts.width ?? 600;
  const innerW = w - 80;
  const depth = opts.depth ?? DEPTH.modal;
  const buttons = opts.buttons ?? [];
  let closed = false;

  const dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, reducedMotion() ? 0.7 : 0).setDepth(DEPTH.modalDim).setInteractive();
  if (!reducedMotion()) scene.tweens.add({ targets: dim, fillAlpha: 0.7, duration: 180 });

  const container = scene.add.container(W / 2, H / 2).setDepth(depth);
  const items: Phaser.GameObjects.GameObject[] = [];
  let y = -0; // measured from the top of the panel, laid out first then centred
  const pad = 40;
  y += pad;
  let titleObj: Phaser.GameObjects.Text | undefined;
  let bodyObj: Phaser.GameObjects.Text | undefined;
  if (opts.title) { titleObj = crispText(scene, 0, 0, opts.title, { preset: 'heading', size: 44, wordWrap: { width: innerW } }); y += titleObj.height + 24; }
  if (opts.body) { bodyObj = crispText(scene, 0, 0, opts.body, { preset: 'body', size: 30, wordWrap: { width: innerW } }); y += bodyObj.height + 24; }
  const contentTop = y;
  const holder = scene.add.container(0, 0);
  const extra = opts.build ? opts.build(holder, 0) : 0;
  if (extra > 0) y += extra + 24;

  const stacked = buttons.length > 2;
  const btnH = 92;
  const gap = 20;
  const btnW = buttons.length === 2 ? (innerW - gap) / 2 : Math.min(innerW, 360);
  if (buttons.length) y += stacked ? buttons.length * btnH + (buttons.length - 1) * gap : btnH;
  y += pad;
  const h = Math.max(y, 220);
  const top = -h / 2;

  const g = scene.add.graphics();
  drawPanelBody(g, w, h, PALETTE.panel, PALETTE.gold, 32, true);
  items.push(g);
  let cy = top + pad;
  if (titleObj) { titleObj.setY(cy + titleObj.height / 2); cy += titleObj.height + 24; items.push(titleObj); }
  if (bodyObj) { bodyObj.setY(cy + bodyObj.height / 2); cy += bodyObj.height + 24; items.push(bodyObj); }
  holder.setY(top + contentTop);
  items.push(holder);
  cy = top + contentTop + (extra > 0 ? extra + 24 : 0);

  const close = () => {
    if (closed) return;
    closed = true;
    scene.tweens.killTweensOf([container, dim]);
    const done = () => { container.destroy(); dim.destroy(); opts.onClose?.(); };
    if (reducedMotion()) done();
    else scene.tweens.add({ targets: container, scale: 0.85, alpha: 0, duration: 140, ease: 'Sine.In', onComplete: done });
    if (!reducedMotion()) scene.tweens.add({ targets: dim, fillAlpha: 0, duration: 140 });
  };

  container.add(items);
  buttons.forEach((b, i) => {
    const bx = buttons.length === 2 ? (i === 0 ? -(btnW + gap) / 2 : (btnW + gap) / 2) : 0;
    const by = stacked ? cy + btnH / 2 + i * (btnH + gap) : cy + btnH / 2;
    const ub = createButton(scene, bx, by, {
      label: b.label, style: b.style ?? (i === 0 ? 'primary' : 'secondary'), width: btnW, height: btnH, fontSize: 34, sound: false,
      onClick: () => { playSfx('click'); b.onClick?.(); if (!b.keepOpen) close(); },
    });
    container.add(ub.container);
  });

  if (opts.closeOnDim) dim.on('pointerup', close);

  if (!reducedMotion()) {
    container.setScale(0.8).setAlpha(0);
    scene.tweens.add({ targets: container, scale: 1, alpha: 1, duration: 220, ease: 'Back.Out' });
  }
  return { container, close };
}
