/** Small procedural textures the gameplay scene needs on top of the art set (made once per game). */
import Phaser from 'phaser';
import { PALETTE } from '../ui/theme';

export const TEX = {
  shadow: 'play_shadow',
  vignette: 'play_vignette',
  hand: 'play_hand',
  swap: 'play_swap',
  arrow: 'play_arrow',
  ice: 'play_ice',
  dot: 'play_dot',
  flame: 'play_flame',
  plus: 'play_plus',
} as const;

function radial(scene: Phaser.Scene, key: string, w: number, h: number, stops: Array<[number, string]>, ellipse = false): void {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h);
  if (!t) return;
  const c = t.getContext();
  const r = Math.max(w, h) / 2;
  if (ellipse) {
    c.save();
    c.translate(w / 2, h / 2);
    c.scale(1, h / w);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    for (const [o, col] of stops) g.addColorStop(o, col);
    c.fillStyle = g;
    c.fillRect(-w / 2, -w / 2, w, w);
    c.restore();
  } else {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, r);
    for (const [o, col] of stops) g.addColorStop(o, col);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }
  t.refresh();
  t.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

function gfxTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

/** Creates every texture below once; later calls are free. */
export function ensurePlayTextures(scene: Phaser.Scene): void {
  // soft ground shadow (white-black gradient, tinted black at runtime)
  radial(scene, TEX.shadow, 128, 64, [[0, 'rgba(0,0,0,0.55)'], [0.6, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']], true);
  // screen-edge vignette: transparent centre, opaque edge (tinted red for low HP)
  if (!scene.textures.exists(TEX.vignette)) {
    const t = scene.textures.createCanvas(TEX.vignette, 144, 256);
    if (t) {
      const c = t.getContext();
      const g = c.createRadialGradient(72, 128, 55, 72, 128, 150);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.1)');
      g.addColorStop(1, 'rgba(255,255,255,0.95)');
      c.fillStyle = g;
      c.fillRect(0, 0, 144, 256);
      t.refresh();
      t.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  }
  radial(scene, TEX.dot, 32, 32, [[0, 'rgba(255,255,255,1)'], [0.7, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]);

  // fire flame tongue for the cone spray / fire zones: soft teardrop
  gfxTexture(scene, TEX.flame, 64, 64, (g) => {
    g.fillStyle(0xffffff, 0.35).fillEllipse(32, 40, 40, 44);
    g.fillStyle(0xffffff, 0.6).fillEllipse(32, 38, 28, 36);
    g.fillStyle(0xffffff, 0.9).fillEllipse(32, 36, 16, 24);
    g.fillStyle(0xffffff, 0.9).fillTriangle(22, 30, 42, 30, 32, 4);
  });

  gfxTexture(scene, TEX.plus, 48, 48, (g) => {
    g.fillStyle(PALETTE.outline, 1).fillRoundedRect(15, 2, 18, 44, 6).fillRoundedRect(2, 15, 44, 18, 6);
    g.fillStyle(0xffffff, 1).fillRoundedRect(19, 6, 10, 36, 4).fillRoundedRect(6, 19, 36, 10, 4);
  });

  // green "merge here" arrow pointing down
  gfxTexture(scene, TEX.arrow, 64, 72, (g) => {
    g.fillStyle(PALETTE.outline, 1).fillRoundedRect(14, 2, 36, 36, 6).fillTriangle(0, 34, 64, 34, 32, 70);
    g.fillStyle(0x6dff7a, 1).fillRoundedRect(19, 7, 26, 28, 4).fillTriangle(8, 36, 56, 36, 32, 62);
    g.fillStyle(0xffffff, 0.45).fillRoundedRect(22, 9, 8, 22, 3);
  });

  // blue swap disc with two arrows
  gfxTexture(scene, TEX.swap, 64, 64, (g) => {
    g.fillStyle(PALETTE.outline, 1).fillCircle(32, 32, 31);
    g.fillStyle(0x58b4ff, 1).fillCircle(32, 32, 27);
    g.fillStyle(0xffffff, 0.3).fillEllipse(28, 18, 30, 12);
    g.fillStyle(0xffffff, 1);
    g.fillRect(16, 21, 24, 5).fillTriangle(38, 14, 38, 33, 50, 23.5);
    g.fillRect(24, 38, 24, 5).fillTriangle(26, 31, 26, 50, 14, 40.5);
  });

  // ice crystal overlay: translucent faceted diamond
  gfxTexture(scene, TEX.ice, 96, 96, (g) => {
    g.fillStyle(0xbfeeff, 0.55).fillRoundedRect(14, 8, 68, 80, 16);
    g.fillStyle(0xffffff, 0.35).fillTriangle(48, 8, 14, 40, 48, 40);
    g.fillStyle(0x7fdcff, 0.5).fillTriangle(48, 88, 82, 52, 48, 52);
    g.lineStyle(3, 0xffffff, 0.9).strokeRoundedRect(14, 8, 68, 80, 16);
    g.lineStyle(2, 0xffffff, 0.7).lineBetween(48, 8, 48, 88).lineBetween(14, 48, 82, 48);
  });

  // pointing hand (tutorial): white glove, dark outline, fingertip at the top
  gfxTexture(scene, TEX.hand, 96, 112, (g) => {
    const o = PALETTE.outline;
    g.fillStyle(o, 1);
    g.fillRoundedRect(34, 2, 26, 62, 13);
    g.fillRoundedRect(22, 40, 58, 50, 18);
    g.fillRoundedRect(8, 52, 28, 22, 11);
    g.fillRoundedRect(26, 80, 52, 26, 12);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(38, 6, 18, 58, 9);
    g.fillRoundedRect(26, 44, 50, 42, 14);
    g.fillRoundedRect(12, 56, 22, 16, 8);
    g.fillRoundedRect(30, 82, 44, 20, 9);
    g.fillStyle(0xdfe6ff, 1).fillRoundedRect(30, 70, 42, 14, 7);
    g.lineStyle(3, o, 0.55).lineBetween(50, 46, 50, 58).lineBetween(62, 50, 62, 60);
  });
}
