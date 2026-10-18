import Phaser from 'phaser';
import { COLORS, ICONS_KEY } from '../assets';
import { services } from '../../services';
import type { AchievementDef } from '../../core/types';
import type { SaveData } from '../../save/schema';
import { ACHIEVEMENTS } from '../../data/achievements';
import { createBackground } from '../ui/background';
import { achievementProgress, fmt } from '../ui/format';
import { W, drawBox, fadeInScene, goto, textStyle } from '../ui/kit';
import { ScrollList } from '../ui/scroll';
import { CounterPill, ProgressBar, header } from '../ui/widgets';
import { SCENES } from './keys';

const ROW_W = 656;
const ROW_H = 196;
const ROW_GAP = 14;
const LIST_Y = 206;

export class AchievementsScene extends Phaser.Scene {
  constructor() { super(SCENES.achievements); }

  create(): void {
    const save = services.save.data;
    fadeInScene(this);
    createBackground(this, { dim: 0.8 });

    const contentH = ACHIEVEMENTS.length * (ROW_H + ROW_GAP) + 6;
    const list = new ScrollList(this, (W - ROW_W) / 2, LIST_Y, ROW_W, 1280 - LIST_Y - 24, contentH);
    // Unlocked ones first would hide the order the player is working through; keep the data order.
    ACHIEVEMENTS.forEach((a, i) => list.content.add(this.buildRow(a, i * (ROW_H + ROW_GAP) + 6, save)));

    const done = ACHIEVEMENTS.filter((a) => save.achievements[a.id] !== undefined).length;
    new CounterPill(this, W - 20, 60, done, {
      icon: 'trophy', color: COLORS.epic, align: 'right', format: (n) => `${n}/${ACHIEVEMENTS.length}`,
    });
    header(this, 'TROPHIES', () => goto(this, SCENES.menu));
  }

  private buildRow(a: AchievementDef, top: number, save: SaveData): Phaser.GameObjects.Container {
    const ts = save.achievements[a.id];
    const unlocked = ts !== undefined;
    const box = this.add.container(0, top);
    const bg = this.add.graphics();
    drawBox(bg, 0, 0, ROW_W, ROW_H, unlocked ? 0x2a2438 : 0x201830, unlocked ? COLORS.gold : COLORS.panelLight);
    const iconBox = this.add.graphics();
    iconBox.fillStyle(COLORS.outline, 1).fillRoundedRect(24, 24, 100, 100, 14);
    iconBox.fillStyle(unlocked ? 0x4a3516 : 0x1a1222, 1).fillRoundedRect(28, 28, 92, 92, 11);
    const icon = this.add.image(76, 76, ICONS_KEY, a.icon).setScale(4);
    box.add([bg, iconBox, icon]);
    const content: Phaser.GameObjects.GameObject[] = [];

    const name = this.add.text(148, 22, a.name, textStyle(38, unlocked ? COLORS.gold : COLORS.text, { align: 'left' })).setOrigin(0, 0);
    const desc = this.add.text(148, 68, a.desc, textStyle(28, COLORS.textDim, { align: 'left', wordWrap: { width: 480 } })).setOrigin(0, 0);
    content.push(name, desc);

    // Reward icons, top right.
    let rx = ROW_W - 28;
    const r = a.reward;
    const rewardItem = (frame: string, text?: string): void => {
      const t = text ? this.add.text(rx, 40, text, textStyle(28, COLORS.text, { align: 'right' })).setOrigin(1, 0.5) : null;
      if (t) { content.push(t); rx -= t.width + 6; }
      const im = this.add.image(rx - 16, 38, ICONS_KEY, frame).setScale(2);
      content.push(im);
      rx -= 44;
    };
    if (r?.unlock) rewardItem(r.unlock.startsWith('skin_') ? 'hero' : 'skull');
    if (r?.tokens) rewardItem('clover', `${r.tokens}`);
    if (r?.gold) rewardItem('gold', fmt(r.gold));

    if (unlocked) {
      const date = new Date(ts).toISOString().slice(0, 10);
      const check = this.add.image(160, 152, ICONS_KEY, 'trophy').setScale(2);
      const t = this.add.text(190, 152, `Unlocked ${date}`, textStyle(28, COLORS.heal, { align: 'left' })).setOrigin(0, 0.5);
      content.push(check, t);
    } else {
      const prog = achievementProgress(a.check, save);
      if (prog) {
        const p = Math.min(1, prog.cur / prog.max);
        const bar = new ProgressBar(this, 148, 142, 300, 22, COLORS.xp);
        bar.set(p);
        const t = this.add.text(148 + 300 + 20, 152, `${fmt(Math.min(prog.cur, prog.max))}/${fmt(prog.max)}`, textStyle(28, COLORS.text, { align: 'left' })).setOrigin(0, 0.5);
        content.push(bar, t);
      } else {
        content.push(this.add.text(148, 152, 'Not yet defeated', textStyle(28, COLORS.textDim, { align: 'left' })).setOrigin(0, 0.5));
      }
      // Locked: dimmed, with a padlock on the icon.
      icon.setTint(0x6a6078).setAlpha(0.75);
      const lock = this.add.image(104, 104, ICONS_KEY, 'lock').setScale(2);
      box.add(lock);
      for (const o of content) (o as unknown as Phaser.GameObjects.Components.Alpha).setAlpha?.(0.85);
    }
    box.add(content);
    return box;
  }
}
