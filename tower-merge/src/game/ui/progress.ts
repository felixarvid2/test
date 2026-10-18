import Phaser from 'phaser';
import { clamp, fillWidth } from './format';
import { reducedMotion } from './env';
import { crispText } from './text';
import { DEPTH, PALETTE } from './theme';

export interface ProgressBarOptions {
  /** Fill colour, default gold. */
  color?: number;
  value?: number;
  /** Centered label inside the bar (e.g. "12 / 30"). */
  label?: string;
  depth?: number;
}

export interface UIProgressBar {
  readonly container: Phaser.GameObjects.Container;
  readonly value: number;
  /** Sets 0..1; animates (200 ms) unless `animate` is false or reduced motion is on. */
  setValue(v: number, animate?: boolean): void;
  setColor(color: number): void;
  setLabel(text: string): void;
  destroy(): void;
}

/** Rounded progress bar. (x, y) is the CENTRE. Height defaults to 28. */
export function createProgressBar(
  scene: Phaser.Scene, x: number, y: number, w: number, h = 28, opts: ProgressBarOptions = {},
): UIProgressBar {
  let color = opts.color ?? PALETTE.gold;
  let target = clamp(opts.value ?? 0, 0, 1);
  const state = { shown: target };
  const container = scene.add.container(x, y).setDepth(opts.depth ?? DEPTH.hud).setSize(w, h);
  const track = scene.add.graphics();
  track.fillStyle(PALETTE.outline, 1).fillRoundedRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, h / 2 + 4);
  track.fillStyle(PALETTE.panelDark, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  const fill = scene.add.graphics();
  const label = opts.label !== undefined ? crispText(scene, 0, 0, opts.label, { preset: 'small', size: Math.max(16, h * 0.62), colorNum: 0xffffff }) : undefined;
  container.add([track, fill]);
  if (label) container.add(label);

  const draw = () => {
    const inner = w - 8;
    const fw = fillWidth(state.shown, inner, h - 8);
    fill.clear();
    if (fw <= 0) return;
    const fh = h - 8;
    fill.fillStyle(color, 1).fillRoundedRect(-w / 2 + 4, -fh / 2, fw, fh, fh / 2);
    fill.fillStyle(0xffffff, 0.3).fillRoundedRect(-w / 2 + 4 + fh * 0.3, -fh / 2 + 2, Math.max(0, fw - fh * 0.6), Math.max(2, fh * 0.28), fh * 0.14);
    fill.fillStyle(0x000000, 0.15).fillRoundedRect(-w / 2 + 4 + fh * 0.3, fh / 2 - fh * 0.22 - 1, Math.max(0, fw - fh * 0.6), fh * 0.22, fh * 0.1);
  };
  draw();

  const api: UIProgressBar = {
    container,
    get value() { return target; },
    setValue(v, animate = true) {
      target = clamp(v, 0, 1);
      scene.tweens.killTweensOf(state);
      if (!animate || reducedMotion()) { state.shown = target; draw(); return; }
      scene.tweens.add({ targets: state, shown: target, duration: 200, ease: 'Sine.Out', onUpdate: draw });
    },
    setColor(c) { color = c; draw(); },
    setLabel(t) { label?.setText(t); },
    destroy() { scene.tweens.killTweensOf(state); container.destroy(); },
  };
  return api;
}
