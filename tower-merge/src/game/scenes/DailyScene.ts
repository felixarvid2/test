import Phaser from 'phaser';
import { services } from '../../services';
import { dailyChallenge, dailyKey } from '../../core/daily';
import type { DailyModifier } from '../../data/types';
import { iconKey } from '../assetKeys';
import {
  dailyStatus, formatCountdown, formatDailyDate, modifierIcon, msUntilNextUtcDay,
} from '../menus/logic';
import { HEADER_H, createHeader, menuBackground, staggerIn } from '../menus/widgets';
import {
  DEPTH, PALETTE, W, createButton, crispText, drawPanelBody, fadeIn, fadeToScene, fitText, reducedMotion, uiIcon,
} from '../ui';
import type { GameSceneData } from './contracts';
import { SceneKeys } from './keys';

const CARD_W = 664;
const CARD_H = 206;

/** Today's daily challenge: two modifiers, your record, a countdown and PLAY DAILY. */
export class DailyScene extends Phaser.Scene {
  private key = '';

  constructor() { super(SceneKeys.Daily); }

  create(): void {
    fadeIn(this);
    menuBackground(this);
    createHeader(this, 'DAILY CHALLENGE');
    const now = new Date();
    this.key = dailyKey(now);
    const challenge = dailyChallenge(this.key);
    const status = dailyStatus(services.save.data.daily, this.key);
    const things: Phaser.GameObjects.Container[] = [];

    crispText(this, W / 2, HEADER_H + 56, formatDailyDate(this.key), { preset: 'heading', size: 38, colorNum: PALETTE.goldLight }).setDepth(DEPTH.hud);
    fitText(crispText(this, W / 2, HEADER_H + 102, 'Same challenge for everyone. Beat your best wave!', { preset: 'small', size: 23 }).setDepth(DEPTH.hud), W - 50);

    let y = HEADER_H + 130;
    challenge.modifiers.forEach((m) => {
      things.push(this.modifierCard(y + CARD_H / 2, m));
      y += CARD_H + 20;
    });
    y += 6;

    // today's record
    things.push(this.statCell(W / 2 - 171, y + 66, 'trophy', status.played ? `Wave ${status.bestWave}` : '-', "Today's best"));
    things.push(this.statCell(W / 2 + 171, y + 66, 'clock', String(status.attempts), status.attempts === 1 ? 'Attempt' : 'Attempts'));
    y += 132 + 22;

    // countdown to the next UTC day
    crispText(this, W / 2, y + 12, 'New challenge in', { preset: 'small', size: 24 }).setDepth(DEPTH.hud);
    const countdown = crispText(this, W / 2, y + 62, formatCountdown(msUntilNextUtcDay(now)), { preset: 'number', size: 54, colorNum: PALETTE.info }).setDepth(DEPTH.hud);
    this.time.addEvent({
      delay: 1000, loop: true,
      callback: () => {
        const t = new Date();
        if (dailyKey(t) !== this.key) { this.scene.restart(); return; }
        countdown.setText(formatCountdown(msUntilNextUtcDay(t)));
      },
    });

    const playY = 1146;
    const holder = this.add.container(W / 2, playY).setDepth(DEPTH.hud);
    const play = createButton(this, 0, 0, {
      label: 'PLAY DAILY', icon: iconKey('crown'), width: 540, height: 132, fontSize: 52, style: 'primary',
      onClick: () => {
        const data: GameSceneData = { daily: { key: challenge.key, seed: challenge.seed, modifiers: challenge.modifiers } };
        if (this.scene.manager.keys[SceneKeys.Game]) fadeToScene(this, SceneKeys.Game, data);
      },
    });
    holder.add(play.container);
    if (!reducedMotion()) {
      holder.setScale(0);
      this.tweens.add({
        targets: holder, scale: 1, duration: 480, delay: 380, ease: 'Back.Out',
        onComplete: () => this.tweens.add({ targets: holder, scale: 1.035, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' }),
      });
    }
    staggerIn(this, things, { step: 90, dy: 60 });
  }

  private modifierCard(y: number, m: DailyModifier): Phaser.GameObjects.Container {
    const c = this.add.container(W / 2, y);
    const g = this.add.graphics();
    drawPanelBody(g, CARD_W, CARD_H, PALETTE.panel, PALETTE.gold, 28, true);
    const tx = -CARD_W / 2 + 28;
    g.fillStyle(PALETTE.outline, 1).fillRoundedRect(tx, -70, 140, 140, 26);
    g.fillStyle(PALETTE.goldDark, 1).fillRoundedRect(tx + 3, -67, 134, 134, 23);
    g.fillStyle(0x3b3560, 1).fillRoundedRect(tx + 8, -62, 124, 124, 19);
    g.fillStyle(0xffffff, 0.08).fillRoundedRect(tx + 14, -57, 112, 34, 14);
    c.add(g);
    c.add(uiIcon(this, tx + 70, 0, iconKey(modifierIcon(m)), 98));
    const x0 = tx + 140 + 26;
    const w = CARD_W / 2 - 28 - x0;
    c.add(fitText(crispText(this, x0, -72, m.name, { preset: 'heading', size: 34, colorNum: PALETTE.goldLight }).setOrigin(0, 0.5), w));
    const desc = crispText(this, x0, -44, m.description, { preset: 'small', size: 24, align: 'left', wordWrap: { width: w }, colorNum: 0xe6ebff }).setOrigin(0, 0);
    desc.setLineSpacing(-1);
    if (desc.height > 112) desc.setScale(112 / desc.height);
    c.add(desc);
    return c;
  }

  private statCell(x: number, y: number, icon: string, value: string, label: string): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    drawPanelBody(g, 322, 132, PALETTE.panel, 0x3a4580, 24, true);
    c.add(g);
    c.add(uiIcon(this, -322 / 2 + 62, 0, iconKey(icon), 80));
    c.add(fitText(crispText(this, -322 / 2 + 118, -14, value, { preset: 'number', size: 40, colorNum: PALETTE.goldLight }).setOrigin(0, 0.5), 190));
    c.add(fitText(crispText(this, -322 / 2 + 118, 30, label, { preset: 'small', size: 23 }).setOrigin(0, 0.5), 190));
    return c;
  }
}
