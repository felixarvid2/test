import Phaser from 'phaser';
import { attachPress } from '../ui/button';
import { MIN_TOUCH, PALETTE } from '../ui/theme';
import { D } from './constants';

export interface RoundButton {
  container: Phaser.GameObjects.Container;
  gfx: Phaser.GameObjects.Graphics;
  size: number;
  /** Redraws the disc with these colours. */
  paint(top: number, bottom: number, rim: number, pressed?: boolean): void;
  setEnabledFn(fn: () => boolean): void;
  destroy(): void;
}

/**
 * Round chunky button shell (disc, rim, gloss) with press feedback and an >= 88 px hit area.
 * Content (icon, text) is added by the caller to `container`.
 */
export function createRoundButton(
  scene: Phaser.Scene, x: number, y: number, size: number, onClick: () => void, depth: number = D.shop,
): RoundButton {
  const r = size / 2;
  const container = scene.add.container(x, y).setDepth(depth).setSize(size, size);
  const gfx = scene.add.graphics();
  const zone = scene.add.zone(0, 0, Math.max(size, MIN_TOUCH), Math.max(size, MIN_TOUCH)).setInteractive({ useHandCursor: true });
  container.add([gfx, zone]);
  let colors = { top: 0x5a6bb8, bottom: 0x3d4a94, rim: 0x232b5c };
  let pressed = false;
  let isEnabled: () => boolean = () => true;
  const draw = () => {
    const dy = pressed ? 3 : 0;
    gfx.clear();
    gfx.fillStyle(PALETTE.shadow, 0.35).fillCircle(0, 6, r + 2);
    gfx.fillStyle(PALETTE.outline, 1).fillCircle(0, 0, r + 4);
    gfx.fillStyle(colors.rim, 1).fillCircle(0, 5, r);
    gfx.fillStyle(colors.bottom, 1).fillCircle(0, dy, r - 1);
    gfx.fillStyle(colors.top, 1).fillCircle(0, dy - r * 0.12, r * 0.82);
    gfx.fillStyle(0xffffff, 0.25).fillEllipse(-r * 0.12, dy - r * 0.5, r * 0.9, r * 0.32);
  };
  draw();
  attachPress(scene, zone, container, () => isEnabled(), onClick, (d) => { pressed = d; draw(); });
  container.bringToTop(zone);
  return {
    container, gfx, size,
    paint(top, bottom, rim, p) { colors = { top, bottom, rim }; if (p !== undefined) pressed = p; draw(); },
    setEnabledFn(fn) { isEnabled = fn; },
    destroy() { scene.tweens.killTweensOf(container); container.destroy(); },
  };
}
