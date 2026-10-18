import Phaser from 'phaser';
import { SLOTS } from '../../data/map';
import { TOWERS } from '../../data/towers';
import type { WorldApi } from '../../sim/api';
import { PALETTE, TOWER_COLORS, hex } from '../ui/theme';
import { createButton, type UIButton } from '../ui/button';
import { crispText, fitText } from '../ui/text';
import { D, TOWER_DY, towerSize } from './constants';

const CARD_W = 340;

/**
 * Tap a tower: show its range circle and a small info card (DPS, range, perks) with a Sell button.
 * The card closes on any tap elsewhere (the scene calls hide()).
 */
export class TowerInfo {
  private readonly range: Phaser.GameObjects.Graphics;
  private readonly card: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly stats: Phaser.GameObjects.Text;
  private readonly perks: Phaser.GameObjects.Text;
  private readonly sell: UIButton;
  private slot = -1;
  private uid = 0;
  private bounds = new Phaser.Geom.Rectangle(0, 0, 0, 0);

  constructor(private readonly scene: Phaser.Scene, private readonly world: () => WorldApi, private readonly onSell: (slot: number) => void) {
    this.range = scene.add.graphics().setDepth(D.ground + 0.5).setVisible(false);
    this.bg = scene.add.graphics();
    this.title = crispText(scene, 0, 0, '', { preset: 'heading', size: 30 });
    this.stats = crispText(scene, 0, 0, '', { preset: 'body', size: 26, lineSpacing: 6 });
    this.perks = crispText(scene, 0, 0, '', { preset: 'small', size: 22, color: '#ffe9a8', lineSpacing: 4, wordWrap: { width: CARD_W - 50 } });
    this.card = scene.add.container(0, 0, [this.bg, this.title, this.stats, this.perks]).setDepth(D.card).setVisible(false);
    this.sell = createButton(scene, 0, 0, {
      label: 'SELL', icon: 'icon_coin', width: 230, height: 76, fontSize: 30, style: 'danger', depth: D.card + 1,
      onClick: () => { if (this.slot >= 0) this.onSell(this.slot); },
    });
    this.sell.setVisible(false);
  }

  get open(): boolean { return this.slot >= 0; }
  get selectedSlot(): number { return this.slot; }

  contains(x: number, y: number): boolean {
    return this.slot >= 0 && this.bounds.contains(x, y);
  }

  show(slot: number): void {
    const world = this.world();
    const tw = world.slots[slot]?.tower;
    const st = world.describeTower(slot);
    if (!tw || !st) { this.hide(); return; }
    this.slot = slot;
    this.uid = tw.uid;
    const def = TOWERS[tw.type];
    const col = TOWER_COLORS[tw.type] ?? def.color;
    const sd = SLOTS[slot];
    const cx = sd.x;
    const cy = sd.y + TOWER_DY;

    this.range.clear().setVisible(true);
    this.range.fillStyle(0xffffff, 0.11).fillCircle(cx, cy, st.range);
    this.range.lineStyle(4, col, 0.85).strokeCircle(cx, cy, st.range);
    this.range.lineStyle(2, 0xffffff, 0.5).strokeCircle(cx, cy, st.range - 3);

    this.title.setText(`${def.name}  Lv ${tw.level}`).setColor(hex(col === 0x3b5b9a ? 0x8fb4ff : col));
    fitText(this.title, CARD_W - 40);
    const lines = [
      `DPS ${fmt(st.dps)}    Range ${Math.round(st.range)}`,
      `Dmg ${fmt(st.damage)} x ${st.fireRate.toFixed(1)}/s`,
    ];
    if (st.splashRadius > 0) lines.push(`Splash ${Math.round(st.splashRadius)}`);
    if (st.critChance > 0.005) lines.push(`Crit ${Math.round(st.critChance * 100)}%`);
    this.stats.setText(lines.join('\n'));
    this.perks.setText(st.perks.length ? st.perks.map((p) => `+ ${p}`).join('\n') : 'Merge twins to unlock perks!');

    const pad = 20;
    const h = pad + this.title.height + 8 + this.stats.height + 8 + this.perks.height + 14 + 76 + pad;
    const w = CARD_W;
    // above the tower when there is room, else below
    const above = cy - towerSize(tw.level) - 20 - h > 118;
    const cardCx = Phaser.Math.Clamp(cx, w / 2 + 16, 720 - w / 2 - 16);
    const top = above ? cy - towerSize(tw.level) - 24 - h : cy + 56;
    this.bounds.setTo(cardCx - w / 2, top, w, h);

    const g = this.bg.clear();
    g.fillStyle(PALETTE.shadow, 0.35).fillRoundedRect(cardCx - w / 2, top + 7, w, h, 26);
    g.fillStyle(PALETTE.outline, 1).fillRoundedRect(cardCx - w / 2 - 4, top - 4, w + 8, h + 8, 30);
    g.fillStyle(col, 1).fillRoundedRect(cardCx - w / 2, top, w, h, 26);
    g.fillStyle(PALETTE.panel, 1).fillRoundedRect(cardCx - w / 2 + 5, top + 5, w - 10, h - 10, 22);
    g.fillStyle(0xffffff, 0.06).fillRoundedRect(cardCx - w / 2 + 12, top + 10, w - 24, 34, 14);

    let y = top + pad;
    this.title.setPosition(cardCx, y + this.title.height / 2);
    y += this.title.height + 8;
    this.stats.setPosition(cardCx, y + this.stats.height / 2);
    y += this.stats.height + 8;
    this.perks.setPosition(cardCx, y + this.perks.height / 2);
    y += this.perks.height + 14;
    this.sell.setLabel(`SELL ${world.sellValue(slot)}`);
    this.sell.setPosition(cardCx, y + 38);
    this.card.setVisible(true).setAlpha(0);
    this.sell.setVisible(true);
    this.sell.container.setAlpha(0);
    this.scene.tweens.add({ targets: [this.card, this.sell.container], alpha: 1, duration: 120 });
  }

  hide(): void {
    this.slot = -1;
    this.uid = 0;
    this.range.clear().setVisible(false);
    this.card.setVisible(false);
    this.sell.setVisible(false);
  }

  /** Close when the tower under the card changed or disappeared. */
  update(): void {
    if (this.slot < 0) return;
    const tw = this.world().slots[this.slot]?.tower;
    if (!tw || tw.uid !== this.uid) this.hide();
  }

  destroy(): void {
    this.range.destroy();
    this.card.destroy();
    this.sell.destroy();
  }
}

function fmt(v: number): string {
  return v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '');
}
