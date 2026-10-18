import Phaser from 'phaser';
import { ENEMY_BY_ID } from '../../../data/enemies';
import { COLORS, EXTRA_KEY, TILES_KEY, TILE_FRAMES } from '../../assets';
import { FX_GLOW } from '../Effects';
import { TAU } from '../layout';
import type { World } from '../World';

// The Mimic King's room starts with three identical closed chests. One of them is the boss.

export interface MimicChest {
  x: number;
  y: number;
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
}

const SPOTS = [
  { x: 168, y: 520 },
  { x: 552, y: 520 },
  { x: 360, y: 800 },
];

const GOLD = 0xffd860;
/** How close the hero must come to a chest to set the ambush off early. */
export const MIMIC_TRIGGER_DIST = 120;

export function placeMimicChests(scene: Phaser.Scene): MimicChest[] {
  return SPOTS.map((s) => {
    const glow = scene.add.image(s.x, s.y, FX_GLOW).setScale(3.4).setTint(0xffc840).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD).setDepth(7);
    const shadow = scene.add.image(s.x, s.y + 24, EXTRA_KEY, 'shadow').setScale(4.5, 3.5).setAlpha(0.5).setDepth(8);
    const img = scene.add.image(s.x, s.y, TILES_KEY, TILE_FRAMES.chestClosed).setScale(4.5).setDepth(100 + s.y * 0.1);
    return { x: s.x, y: s.y, img, glow, shadow };
  });
}

export function destroyChests(chests: MimicChest[]): void {
  for (const c of chests) {
    c.img.scene?.tweens.killTweensOf([c.img, c.glow]);
    c.img.destroy();
    c.glow.destroy();
    c.shadow.destroy();
  }
  chests.length = 0;
}

/** All three chests start to rattle, the lid twitching. */
export function rattleChests(scene: Phaser.Scene, chests: MimicChest[], reduced: boolean): void {
  if (reduced) return;
  chests.forEach((c, i) => {
    scene.tweens.add({ targets: c.img, angle: { from: -7, to: 7 }, duration: 70, yoyo: true, repeat: -1, delay: i * 23 });
    scene.tweens.add({ targets: c.img, scaleY: { from: 4.5, to: 4.9 }, duration: 160, yoyo: true, repeat: -1, delay: i * 40 });
    scene.tweens.add({ targets: c.glow, alpha: { from: 0.4, to: 0.9 }, duration: 120, yoyo: true, repeat: -1 });
  });
}

/** The chest the boss bursts out of: lid flies off, coins fly everywhere, the room shakes. */
export function burstChest(w: World, c: MimicChest): void {
  const { x, y } = c;
  w.fx.flash(0xffe080, 0.5, 0.3);
  w.fx.shake(0.9);
  w.fx.ring(x, y, 20, 300, 0.6, GOLD, 0.9);
  w.fx.ring(x, y, 10, 200, 0.45, 0xffffff, 0.8);
  w.fx.ring(x, y, 10, 150, 0.4, COLORS.danger, 0.8);
  w.fx.emit('coin_0', x, y - 10, 26, -1.57, 2.8, 180, 620, 0.5, 1, 2, 1.6, 0xffffff, 760, false);
  w.fx.emit('spark', x, y - 10, 26, 0, TAU, 120, 520, 0.35, 0.8, 1.6, 0.1, GOLD, 200, true);
  w.fx.emit('puff', x, y, 14, 0, TAU, 60, 280, 0.4, 0.8, 2.6, 0.6, 0xd8c8a0, 0, false, 0.9);
  w.fx.emit('spark', x, y - 12, 8, -1.57, 1.6, 200, 480, 0.4, 0.7, 2.4, 0.2, 0x8a5a2a, 600, false);
  destroyChests([c]);
}

/** A decoy chest: it pops into a regular mimic (or just a puff when the room is full). */
export function popDecoy(w: World, c: MimicChest): void {
  const { x, y } = c;
  const e = w.enemies.spawnNow(ENEMY_BY_ID.mimic, x, y, false, true);
  if (e) e.squash = 1;
  w.fx.ring(x, y, 10, 110, 0.35, GOLD);
  w.fx.emit('puff', x, y, 8, 0, TAU, 60, 200, 0.35, 0.65, 1.8, 0.4, 0xd8c8a0, 0, false, 0.9);
  w.fx.emit('coin_0', x, y - 10, 8, -1.57, 2.2, 140, 400, 0.4, 0.7, 1.8, 1.2, 0xffffff, 640, false);
  w.fx.shake(0.2);
  destroyChests([c]);
}
