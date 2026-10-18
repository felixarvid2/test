import Phaser from 'phaser';
import { COLORS, ICONS_KEY } from '../assets';
import { Button, H, W, panel, popIn, textStyle, titleStyle } from './kit';

export interface ModalButton {
  text: string;
  color?: number;
  onClick: () => void;
  /** Ms before the button reacts (guards destructive buttons against double taps). */
  delay?: number;
  icon?: { key: string; frame: string | number; scale?: number };
}

export interface ModalOptions {
  title: string;
  body?: string;
  icon?: string;
  buttons: ModalButton[];
  width?: number;
  depth?: number;
  border?: number;
  titleColor?: number;
}

export interface Modal {
  layer: Phaser.GameObjects.Container;
  close: () => void;
}

/** Centered dialog over a dark veil. Buttons are stacked; the caller decides what each one does. */
export function openModal(scene: Phaser.Scene, opts: ModalOptions): Modal {
  const width = opts.width ?? 620;
  const layer = scene.add.container(0, 0).setDepth(opts.depth ?? 5000);
  const shade = scene.add.rectangle(W / 2, H / 2, W, H, COLORS.bg, 0.82).setInteractive();

  const items: Phaser.GameObjects.GameObject[] = [];
  let y = 0; // relative to box top
  const pad = 36;
  const box = scene.add.container(W / 2, H / 2);

  const iconY = opts.icon ? (y += 70) : 0;
  if (opts.icon) {
    const im = scene.add.image(0, iconY, ICONS_KEY, opts.icon).setScale(5);
    items.push(im);
    y += 62;
  } else {
    y += pad;
  }
  const title = scene.add.text(0, 0, opts.title, titleStyle(44, opts.titleColor ?? COLORS.gold)).setOrigin(0.5, 0);
  title.setY(y);
  items.push(title);
  y += title.height + 20;
  if (opts.body) {
    const body = scene.add.text(0, y, opts.body, textStyle(32, COLORS.text, { wordWrap: { width: width - 80 }, lineSpacing: 6 })).setOrigin(0.5, 0);
    items.push(body);
    y += body.height + 28;
  }
  const buttons: Button[] = [];
  for (const b of opts.buttons) {
    const btn = new Button(scene, 0, y + 48, b.text, () => b.onClick(), { width: width - 100, height: 96, color: b.color ?? 0x3d6e70, icon: b.icon });
    if (b.delay) {
      btn.setEnabled(false);
      scene.time.delayedCall(b.delay, () => btn.active && btn.setEnabled(true));
    }
    buttons.push(btn);
    y += 96 + 16;
  }
  const height = y + pad - 16;
  const top = -height / 2;
  const frame = panel(scene, 0, 0, width, height, COLORS.panel, opts.border ?? COLORS.panelLight);
  box.add(frame);
  for (const it of items) {
    const o = it as unknown as Phaser.GameObjects.Components.Transform;
    o.y += top;
    box.add(it);
  }
  for (const btn of buttons) {
    btn.y += top;
    box.add(btn);
  }
  layer.add([shade, box]);
  if (!scene.cameras.main.fadeEffect.isRunning) popIn(scene, box);
  let closed = false;
  return {
    layer,
    close: () => {
      if (closed) return;
      closed = true;
      layer.destroy();
    },
  };
}

