import Phaser from 'phaser';
import { crispText } from './text';
import { DEPTH, PALETTE, RARITY_COLORS } from './theme';
import type { Rarity } from '../../data/types';

export interface PanelOptions {
  fill?: number;
  /** Border colour, default warm gold. */
  border?: number;
  radius?: number;
  shadow?: boolean;
  /** Heading drawn at the top inside the panel. */
  title?: string;
  depth?: number;
}

/** Draws the panel body into `g` (origin at the centre). Shared by panels, modals and cards. */
export function drawPanelBody(
  g: Phaser.GameObjects.Graphics, w: number, h: number,
  fill: number = PALETTE.panel, border: number = PALETTE.gold, radius = 28, shadow = true,
): void {
  g.clear();
  if (shadow) g.fillStyle(PALETTE.shadow, 0.35).fillRoundedRect(-w / 2, -h / 2 + 10, w, h, radius);
  g.fillStyle(PALETTE.outline, 1).fillRoundedRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, radius + 4);
  g.fillStyle(border, 1).fillRoundedRect(-w / 2, -h / 2, w, h, radius);
  g.fillStyle(fill, 1).fillRoundedRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, Math.max(4, radius - 5));
  // soft top light and bottom shade for depth
  g.fillStyle(0xffffff, 0.06).fillRoundedRect(-w / 2 + 10, -h / 2 + 10, w - 20, Math.min(h * 0.3, 90), Math.max(4, radius - 10));
  g.fillStyle(0x000000, 0.14).fillRoundedRect(-w / 2 + 10, h / 2 - 22, w - 20, 12, 6);
}

/**
 * Rounded card: dark outline, warm gold border, navy body. (x, y) is the CENTRE; children added
 * to the returned container use coordinates relative to the centre.
 */
export function createPanel(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, opts: PanelOptions = {},
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y).setDepth(opts.depth ?? DEPTH.panel).setSize(w, h);
  const g = scene.add.graphics();
  drawPanelBody(g, w, h, opts.fill, opts.border, opts.radius, opts.shadow ?? true);
  container.add(g);
  if (opts.title) container.add(crispText(scene, 0, -h / 2 + 50, opts.title, 'heading'));
  return container;
}

export interface CardFrame {
  readonly container: Phaser.GameObjects.Container;
  readonly rarity: Rarity;
  setSelected(selected: boolean): void;
}

/**
 * Upgrade/collection card frame tinted by rarity. Epic and legendary get a pulsing glow behind
 * the card (uses the 'fx_glow' texture). (x, y) is the CENTRE; put content in the container.
 */
export function createCardFrame(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, rarity: Rarity,
  opts: { depth?: number } = {},
): CardFrame {
  const color = RARITY_COLORS[rarity];
  const container = scene.add.container(x, y).setDepth(opts.depth ?? DEPTH.panel).setSize(w, h);
  const parts: Phaser.GameObjects.GameObject[] = [];
  if ((rarity === 'epic' || rarity === 'legendary') && scene.textures.exists('fx_glow')) {
    const glow = scene.add.image(0, 0, 'fx_glow').setTint(color).setAlpha(rarity === 'legendary' ? 0.75 : 0.5)
      .setDisplaySize(w * 1.7, h * 1.45).setBlendMode(Phaser.BlendModes.ADD);
    parts.push(glow);
    scene.tweens.add({ targets: glow, alpha: glow.alpha * 0.55, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }
  const g = scene.add.graphics();
  drawPanelBody(g, w, h, PALETTE.panel, color, 24, true);
  // rarity band across the top of the card
  g.fillStyle(color, 0.28).fillRoundedRect(-w / 2 + 6, -h / 2 + 6, w - 12, 46, { tl: 19, tr: 19, bl: 0, br: 0 });
  g.fillStyle(color, 1).fillRect(-w / 2 + 6, -h / 2 + 50, w - 12, 4);
  parts.push(g);
  const sel = scene.add.graphics().setVisible(false);
  sel.lineStyle(6, 0xffffff, 0.95).strokeRoundedRect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16, 30);
  parts.push(sel);
  container.add(parts);
  return {
    container, rarity,
    setSelected(s) { sel.setVisible(s); },
  };
}
