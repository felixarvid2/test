import Phaser from 'phaser';
import { textResolutionFor } from './format';
import { type TextPreset, type TextStyleLike, W, textStyle } from './theme';

/**
 * Phaser 3.90 renders Text objects to a canvas at world size, so on a high-DPI phone they look
 * soft. Each Text object has its own `resolution`; this returns the right one for the current
 * on-screen scale (display width / 720 x devicePixelRatio, 1..3).
 */
export function textResolution(scene: Phaser.Scene): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return textResolutionFor(scene.scale.displaySize.width, W, dpr);
}

export type CrispStyle = TextPreset | (TextStyleLike & { size?: number; colorNum?: number; preset?: TextPreset });

/**
 * The way to create text. `style` is a preset name ('title' | 'heading' | 'body' | 'small' |
 * 'number') or an object: `{ preset?: 'body', size?: 36, colorNum?: 0xffd35e, ...Phaser style }`.
 * Origin is centred (0.5) and the resolution matches the screen, so text stays sharp.
 */
export function crispText(
  scene: Phaser.Scene, x: number, y: number, text: string, style: CrispStyle = 'body',
): Phaser.GameObjects.Text {
  const s = typeof style === 'string' ? textStyle(style) : textStyle(style.preset ?? 'body', style);
  const t = scene.add.text(x, y, text, s as Phaser.Types.GameObjects.Text.TextStyle);
  t.setOrigin(0.5).setResolution(textResolution(scene));
  return t;
}

/** Shrinks a Text object (scale) until it fits `maxWidth`; never enlarges. */
export function fitText(t: Phaser.GameObjects.Text, maxWidth: number): Phaser.GameObjects.Text {
  t.setScale(1);
  if (t.width > maxWidth && t.width > 0) t.setScale(maxWidth / t.width);
  return t;
}
