import Phaser from 'phaser';
import { reducedMotion } from './env';
import { crispText } from './text';
import { DEPTH, PALETTE, type TextPreset } from './theme';

export interface FloatTextOptions {
  /** Text colour (0xRRGGBB), default white. */
  color?: number;
  size?: number;
  preset?: TextPreset;
  /** Pixels it rises (default 70). */
  rise?: number;
  duration?: number;
  depth?: number;
}

/** Text that floats up and fades out, then destroys itself ("+25", "Merged!", damage numbers). */
export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, opts: FloatTextOptions = {}): Phaser.GameObjects.Text {
  const t = crispText(scene, x, y, text, { preset: opts.preset ?? 'number', size: opts.size ?? 36, colorNum: opts.color ?? PALETTE.text });
  t.setDepth(opts.depth ?? DEPTH.fx + 20);
  const dur = reducedMotion() ? 500 : opts.duration ?? 800;
  scene.tweens.add({
    targets: t, y: y - (reducedMotion() ? 0 : opts.rise ?? 70), alpha: 0, duration: dur, ease: 'Sine.Out', onComplete: () => t.destroy(),
  });
  if (!reducedMotion()) {
    t.setScale(0.6);
    scene.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.Out' });
  }
  return t;
}

const FADING = '__tmFading';

/** Fades the camera out (default 220 ms), then starts `key` with `data`. Ignores repeat calls. */
export function fadeToScene(scene: Phaser.Scene, key: string, data?: object, duration = 220): void {
  if (scene.registry.get(FADING) === scene.scene.key) return;
  scene.registry.set(FADING, scene.scene.key);
  const go = () => { scene.registry.remove(FADING); scene.scene.start(key, data); };
  if (reducedMotion() || duration <= 0) { go(); return; }
  scene.cameras.main.fadeOut(duration, 15, 20, 48);
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, go);
}

/** Call at the start of `create()` of every scene so it fades in after fadeToScene. */
export function fadeIn(scene: Phaser.Scene, duration = 220): void {
  scene.registry.remove(FADING);
  if (!reducedMotion()) scene.cameras.main.fadeIn(duration, 15, 20, 48);
}

/**
 * Image from a texture key scaled to a square `size`, or a plain grey disc when the texture is
 * missing. Use for icon_* keys so a missing icon never crashes a scene.
 */
export function uiIcon(scene: Phaser.Scene, x: number, y: number, key: string, size: number): Phaser.GameObjects.Image | Phaser.GameObjects.Arc {
  if (scene.textures.exists(key)) return scene.add.image(x, y, key).setDisplaySize(size, size);
  return scene.add.circle(x, y, size / 2, PALETTE.disabled);
}
