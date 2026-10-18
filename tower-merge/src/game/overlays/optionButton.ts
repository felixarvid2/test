/** Wide choice button: icon, bold label, small description and an optional coin cost. */
import Phaser from 'phaser';
import {
  BUTTON_COLORS, DEPTH, PALETTE, attachPress, crispText, formatNumber, playSfx, reducedMotion, touchSize, uiIcon, type ButtonStyleName,
} from '../ui';

export interface OptionButtonOptions {
  label: string;
  description?: string;
  /** Texture key. */
  icon?: string;
  /** Coin cost shown on the right (red when the button is disabled). */
  cost?: number;
  width?: number;
  height?: number;
  style?: ButtonStyleName;
  enabled?: boolean;
  depth?: number;
  onClick?: () => void;
}

export interface UIOptionButton {
  readonly container: Phaser.GameObjects.Container;
  readonly width: number;
  readonly height: number;
  setEnabled(enabled: boolean): void;
  /** Chosen: bright pulse. */
  highlight(): void;
  destroy(): void;
}

export function createOptionButton(scene: Phaser.Scene, x: number, y: number, opts: OptionButtonOptions): UIOptionButton {
  const w = opts.width ?? 620;
  const h = opts.height ?? 132;
  const style = opts.style ?? 'secondary';
  let enabled = opts.enabled ?? true;
  let pressed = false;
  let lit = false;

  const container = scene.add.container(x, y).setDepth(opts.depth ?? DEPTH.panel + 2).setSize(w, h);
  const gfx = scene.add.graphics();
  container.add(gfx);

  const iconSize = Math.min(72, h - 36);
  const iconX = -w / 2 + 24 + iconSize / 2;
  let img: Phaser.GameObjects.Image | Phaser.GameObjects.Arc | undefined;
  if (opts.icon) {
    img = uiIcon(scene, iconX, 0, opts.icon, iconSize);
    container.add(img);
  }

  const textLeft = img ? iconX + iconSize / 2 + 16 : -w / 2 + 28;
  const rightEdge = w / 2 - 22;

  // Cost pill sits on the label row (top right) so the description can use the full width.
  let costW = 0;
  const costObjs: Phaser.GameObjects.GameObject[] = [];
  let costText: Phaser.GameObjects.Text | undefined;
  if (opts.cost !== undefined && opts.cost > 0) {
    costText = crispText(scene, 0, 0, formatNumber(opts.cost), { preset: 'number', size: 34 }).setOrigin(1, 0.5);
    const coin = uiIcon(scene, 0, 0, 'icon_coin', 42);
    costW = costText.width + 42 + 6;
    costText.setX(rightEdge);
    coin.setX(rightEdge - costText.width - 6 - 21);
    costObjs.push(coin, costText);
    container.add(costObjs);
  }

  const labelW = rightEdge - textLeft - (costW ? costW + 12 : 0);
  const label = crispText(scene, textLeft, 0, opts.label, { preset: 'heading', size: 30 }).setOrigin(0, 0.5);
  if (label.width > labelW) label.setScale(labelW / label.width);
  const descW = rightEdge - textLeft;
  const desc = opts.description
    ? crispText(scene, textLeft, 0, opts.description, { preset: 'small', size: 22, colorNum: 0xe4eaff, wordWrap: { width: descW }, align: 'left' }).setOrigin(0, 0)
    : null;
  if (desc && desc.height > 58) desc.setScale(58 / desc.height);
  container.add(label);
  if (desc) container.add(desc);

  const zone = scene.add.zone(0, 0, touchSize(w), touchSize(h)).setInteractive({ useHandCursor: true });
  container.add(zone);

  const draw = (): void => {
    const c = enabled || lit ? BUTTON_COLORS[style] : { top: PALETTE.disabled, bottom: PALETTE.disabledDark, rim: 0x23283d, text: 0xffffff };
    const dy = pressed ? 4 : 0;
    const r = 24;
    gfx.clear();
    gfx.fillStyle(PALETTE.shadow, 0.35).fillRoundedRect(-w / 2, -h / 2 + 8, w, h, r + 2);
    gfx.fillStyle(PALETTE.outline, 1).fillRoundedRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, r + 4);
    gfx.fillStyle(c.rim, 1).fillRoundedRect(-w / 2, -h / 2 + 6, w, h - 6, r);
    gfx.fillStyle(c.bottom, 1).fillRoundedRect(-w / 2, -h / 2 + dy, w, h - 6, r);
    gfx.fillStyle(c.top, 1).fillRoundedRect(-w / 2 + 4, -h / 2 + 4 + dy, w - 8, (h - 6) * 0.5, Math.max(6, r - 4));
    if (lit) gfx.lineStyle(6, 0xffffff, 0.95).strokeRoundedRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12, r + 6);
    const midY = dy - 3;
    const labelY = desc ? midY - h / 2 + 34 : midY;
    label.setY(labelY).setAlpha(enabled || lit ? 1 : 0.7);
    desc?.setY(labelY + 22).setAlpha(enabled || lit ? 1 : 0.65);
    img?.setY(midY);
    if (img && 'setTint' in img) (img as Phaser.GameObjects.Image).setTint(enabled || lit ? 0xffffff : 0x8a8fa6);
    for (const o of costObjs) (o as Phaser.GameObjects.Image).setY(labelY);
    costText?.setColor(enabled || lit ? '#ffffff' : '#ff8a80');
  };
  draw();

  attachPress(scene, zone, container, () => enabled, () => {
    playSfx('click');
    opts.onClick?.();
  }, (down) => { pressed = down; draw(); });

  return {
    container, width: w, height: h,
    setEnabled(e) { enabled = e; if (!e) { pressed = false; container.setScale(1); } draw(); },
    highlight() {
      lit = true;
      draw();
      if (!reducedMotion()) scene.tweens.add({ targets: container, scale: 1.05, duration: 140, yoyo: true, ease: 'Sine.Out' });
    },
    destroy() { scene.tweens.killTweensOf(container); container.destroy(); },
  };
}
