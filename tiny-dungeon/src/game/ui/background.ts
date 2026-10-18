import Phaser from 'phaser';
import { COLORS, EXTRA_KEY, TILE, TILES_KEY, TILE_FRAMES } from '../assets';
import { H, W } from './kit';
import { VIGNETTE, ensureAnims, ensureTextures, glow, reduced } from './fx';

export interface BackgroundOptions {
  /** Brick walls along the top and both sides, with flickering torches. */
  walls?: boolean;
  /** Tiny monsters and heroes strolling across the floor. */
  parade?: boolean;
  /** 0..1 darkness over the floor (0.55 for the menu, more for busy screens). */
  dim?: number;
}

const FLOOR_FRAMES = [TILE_FRAMES.floor, TILE_FRAMES.floor, TILE_FRAMES.floor, TILE_FRAMES.floor, TILE_FRAMES.floorCracked, TILE_FRAMES.floorRubble];
const WALKERS = ['knight', 'mage', 'ranger', 'slime', 'bat', 'necromancer', 'ogre', 'demon', 'ghost', 'spider', 'rat'] as const;

const hash = (a: number, b: number): number => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

/**
 * Floor, walls, darkening and vignette are drawn once into a texture (cached per variant), so the
 * background costs a single full-screen quad per frame instead of ~500 tiles plus overlays.
 */
function bakeBackground(scene: Phaser.Scene, key: string, opts: BackgroundOptions): void {
  if (scene.textures.exists(key)) return;
  const cols = Math.ceil(W / TILE);
  const rows = Math.ceil(H / TILE);
  const rt = scene.make.renderTexture({ x: 0, y: 0, width: W, height: H }, false);
  const stamp = scene.make.image({ key: TILES_KEY, frame: 0, add: false }).setOrigin(0, 0).setScale(3);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      stamp.setFrame(FLOOR_FRAMES[hash(r, c) % FLOOR_FRAMES.length]);
      rt.draw(stamp, c * TILE, r * TILE);
    }
  }
  rt.fill(COLORS.bg, opts.dim ?? 0.6);
  if (opts.walls) {
    const wallFrames = [TILE_FRAMES.wall, TILE_FRAMES.wallAlt, TILE_FRAMES.wallMid];
    stamp.setTint(0x9c8fb0);
    const put = (c: number, r: number, frame: number): void => {
      stamp.setFrame(frame);
      rt.draw(stamp, c * TILE, r * TILE);
    };
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < 3; r++) put(c, r, wallFrames[hash(c, r + 40) % wallFrames.length]);
    }
    for (let r = 3; r < rows; r++) {
      put(0, r, wallFrames[hash(0, r) % wallFrames.length]);
      put(cols - 1, r, wallFrames[hash(1, r) % wallFrames.length]);
    }
    stamp.clearTint();
    // Banners on the top wall.
    for (const c of [3, 11]) put(c, 2, TILE_FRAMES.wallBanner);
    // Wall shadows onto the floor.
    rt.fill(0x000000, 0.35, 0, 3 * TILE, W, 28);
    rt.fill(0x000000, 0.3, TILE, 0, 18, H);
    rt.fill(0x000000, 0.3, W - TILE - 18, 0, 18, H);
  }
  const vignette = scene.make.image({ key: VIGNETTE, add: false }).setOrigin(0, 0).setDisplaySize(W, H);
  rt.draw(vignette, 0, 0);
  rt.saveTexture(key);
  rt.destroy();
  stamp.destroy();
  vignette.destroy();
}

/** Dungeon floor (+ walls, torches, parade) behind a menu screen. Everything sits at negative depth. */
export function createBackground(scene: Phaser.Scene, opts: BackgroundOptions = {}): void {
  ensureTextures(scene);
  ensureAnims(scene);
  const key = `ui_bg_${opts.walls ? 'walls' : 'floor'}_${Math.round((opts.dim ?? 0.6) * 100)}`;
  bakeBackground(scene, key, opts);
  scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(-100);
  if (opts.walls) {
    for (const y of [360, 760, 1160]) {
      torch(scene, TILE / 2, y);
      torch(scene, W - TILE / 2, y);
    }
  }
  if (opts.parade) parade(scene);
}

function torch(scene: Phaser.Scene, x: number, y: number): void {
  const flame = scene.add.sprite(x, y, EXTRA_KEY, 'torch_0').setScale(3).setDepth(-80);
  flame.play({ key: 'ui_torch', startFrame: Phaser.Math.Between(0, 3) });
  const light = glow(scene, x, y - 10, 260, 0xff9a3c, 0.32).setDepth(-81);
  if (!reduced()) {
    scene.tweens.add({
      targets: light,
      alpha: { from: 0.22, to: 0.4 },
      scale: { from: light.scaleX * 0.92, to: light.scaleX * 1.06 },
      duration: Phaser.Math.Between(160, 260),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }
}

function parade(scene: Phaser.Scene): void {
  if (reduced()) return;
  const lanes = [300, 640, 1000];
  let i = 0;
  for (const laneY of lanes) {
    for (let n = 0; n < 2; n++) {
      const name = WALKERS[(i * 3 + n * 5) % WALKERS.length];
      const dir = (i + n) % 2 === 0 ? 1 : -1;
      const speed = Phaser.Math.Between(34, 62);
      const sprite = scene.add.image(0, laneY, TILES_KEY, TILE_FRAMES[name]).setScale(3).setDepth(-86).setTint(0xb8a8c8).setAlpha(0.85);
      sprite.setFlipX(dir < 0);
      const shadow = scene.add.image(0, laneY + 22, EXTRA_KEY, 'shadow').setScale(2.4).setDepth(-87).setAlpha(0.5);
      const span = W + 160;
      const startX = dir > 0 ? -80 : W + 80;
      const track = { p: 0 };
      const walk = scene.tweens.add({
        targets: track,
        p: { from: 0, to: 1 },
        duration: (span / speed) * 1000,
        repeat: -1,
        onUpdate: () => {
          const x = startX + dir * span * track.p;
          sprite.x = x;
          shadow.x = x;
        },
      });
      walk.seek(Phaser.Math.FloatBetween(0, 1));
      // Little steps.
      scene.tweens.add({ targets: sprite, y: laneY - 6, duration: 230, yoyo: true, repeat: -1, ease: 'Sine.Out', delay: n * 90 });
      i += 1;
    }
  }
}
