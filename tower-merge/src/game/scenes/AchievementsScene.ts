import Phaser from 'phaser';
import { services } from '../../services';
import { iconKey } from '../assetKeys';
import { achievementRows, sortAchievementRows, type AchievementRow } from '../menus/logic';
import { ScrollView } from '../menus/scroll';
import { HEADER_H, clampLines, createHeader, menuBackground, staggerIn } from '../menus/widgets';
import {
  DEPTH, H, PALETTE, W, createProgressBar, crispText, drawPanelBody, fadeIn, fitText, formatNumber, reducedMotion, uiIcon,
} from '../ui';
import { SceneKeys } from './keys';

const CARD_W = 664;
const CARD_H = 176;
const GAP = 18;

/** Scrollable achievement list: progress bars, gold glow when unlocked, gem reward on every card. */
export class AchievementsScene extends Phaser.Scene {
  constructor() { super(SceneKeys.Achievements); }

  create(): void {
    fadeIn(this);
    menuBackground(this);
    createHeader(this, 'ACHIEVEMENTS');
    const save = services.save.data;
    const rows = sortAchievementRows(achievementRows(save.stats, save.achievements));
    const done = rows.filter((r) => r.unlocked).length;

    // summary strip under the header
    const sy = HEADER_H + 54;
    crispText(this, W / 2, sy - 6, `${done} / ${rows.length} unlocked`, { preset: 'body', size: 30, colorNum: PALETTE.goldLight }).setDepth(DEPTH.hud);
    createProgressBar(this, W / 2, sy + 34, 420, 22, { value: rows.length ? done / rows.length : 0 }).container.setDepth(DEPTH.hud);

    const top = HEADER_H + 100;
    const view = new ScrollView(this, 0, top, W, H - top);
    const cards = rows.map((r, i) => this.buildCard(view, r, 16 + CARD_H / 2 + i * (CARD_H + GAP)));
    view.setContentHeight(16 + rows.length * (CARD_H + GAP) + 24);
    staggerIn(this, cards, { step: 45 });
  }

  private buildCard(view: ScrollView, r: AchievementRow, y: number): Phaser.GameObjects.Container {
    const card = this.add.container(W / 2, y);
    const unlocked = r.unlocked;
    if (unlocked && this.textures.exists('fx_glow')) {
      const glow = this.add.image(0, 0, 'fx_glow').setTint(PALETTE.gold).setAlpha(0.5).setDisplaySize(CARD_W * 1.28, CARD_H * 1.7).setBlendMode(Phaser.BlendModes.ADD);
      card.add(glow);
      if (!reducedMotion()) this.tweens.add({ targets: glow, alpha: 0.28, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
    const bg = this.add.graphics();
    drawPanelBody(bg, CARD_W, CARD_H, unlocked ? 0x2c2a3f : PALETTE.panel, unlocked ? PALETTE.gold : 0x3a4580, 26, true);
    card.add(bg);

    // icon tile
    const tile = this.add.graphics();
    const tx = -CARD_W / 2 + 28;
    tile.fillStyle(PALETTE.outline, 1).fillRoundedRect(tx, -62, 124, 124, 24);
    tile.fillStyle(unlocked ? PALETTE.gold : 0x3a4580, 1).fillRoundedRect(tx + 3, -59, 118, 118, 21);
    tile.fillStyle(unlocked ? 0x4a3d6a : PALETTE.panelDark, 1).fillRoundedRect(tx + 8, -54, 108, 108, 17);
    card.add(tile);
    const icon = uiIcon(this, tx + 62, 0, iconKey(r.def.icon), 84);
    if (!unlocked) { icon.setAlpha(0.55); if (icon instanceof Phaser.GameObjects.Image) icon.setTint(0x9aa3c4); }
    card.add(icon);

    const x0 = tx + 124 + 24;
    const w = CARD_W / 2 - 24 - x0;
    const name = fitText(crispText(this, x0, -58, r.def.name, { preset: 'heading', size: 32, colorNum: unlocked ? PALETTE.goldLight : 0xffffff }).setOrigin(0, 0.5), w - (unlocked ? 56 : 0));
    const desc = clampLines(crispText(this, x0, -34, r.def.description, { preset: 'small', size: 22, align: 'left', wordWrap: { width: w }, colorNum: 0xdfe5ff }).setOrigin(0, 0), 2);
    desc.setLineSpacing(-2);
    card.add([name, desc]);

    // reward chip (bottom right) and progress bar
    const chipW = 148;
    const chip = this.add.container(CARD_W / 2 - 24 - chipW / 2, 50);
    const cg = this.add.graphics();
    cg.fillStyle(PALETTE.outline, 1).fillRoundedRect(-chipW / 2 - 3, -30, chipW + 6, 60, 30);
    cg.fillStyle(PALETTE.panelDark, 1).fillRoundedRect(-chipW / 2, -27, chipW, 54, 27);
    const gem = uiIcon(this, -chipW / 2 + 34, 0, iconKey('gem'), 42);
    const amount = crispText(this, 22, 1, `+${r.def.reward}`, { preset: 'number', size: 28, colorNum: unlocked ? PALETTE.goldLight : 0xffffff });
    fitText(amount, chipW - 76);
    chip.add([cg, gem, amount]);
    card.add(chip);

    const barW = w - chipW - 16;
    const bar = createProgressBar(this, x0 + barW / 2, 50, barW, 30, {
      value: r.fraction, color: unlocked ? PALETTE.gold : PALETTE.info,
      label: unlocked ? 'DONE' : `${formatNumber(r.value)} / ${formatNumber(r.target)}`,
    });
    card.add(bar.container);

    if (unlocked) {
      // green tick badge next to the name
      const b = this.add.container(CARD_W / 2 - 52, -58);
      const g = this.add.graphics();
      g.fillStyle(PALETTE.outline, 1).fillCircle(0, 0, 26);
      g.fillStyle(PALETTE.success, 1).fillCircle(0, 0, 22);
      g.lineStyle(7, 0xffffff, 1).beginPath().moveTo(-10, 1).lineTo(-3, 9).lineTo(11, -8).strokePath();
      b.add(g);
      card.add(b);
    }
    view.content.add(card);
    return card;
  }
}
