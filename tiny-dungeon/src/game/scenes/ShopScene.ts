import Phaser from 'phaser';
import { COLORS, ICONS_KEY } from '../assets';
import { services } from '../../services';
import { buyMeta, canBuyMeta, metaCost } from '../../core/meta';
import type { MetaUpgradeDef } from '../../core/types';
import { META_UPGRADES } from '../../data/meta';
import { createBackground } from '../ui/background';
import { flyCoins, reduced, shake, sparks } from '../ui/fx';
import { fmt, metaEffectText } from '../ui/format';
import { Button, W, drawBox, fadeInScene, goto, textStyle } from '../ui/kit';
import { ScrollList } from '../ui/scroll';
import { CounterPill, Pips, header } from '../ui/widgets';
import { SCENES } from './keys';

const ROW_W = 656;
const ROW_H = 246;
const ROW_GAP = 14;
const LIST_Y = 206;

interface Row {
  def: MetaUpgradeDef;
  top: number;
  box: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  pips: Pips;
  levelTxt: Phaser.GameObjects.Text;
  curTxt: Phaser.GameObjects.Text;
  arrow: Phaser.GameObjects.Text;
  nextTxt: Phaser.GameObjects.Text;
  btn: Button;
  iconImg: Phaser.GameObjects.Image;
}

export class ShopScene extends Phaser.Scene {
  private goldPill!: CounterPill;
  private list!: ScrollList;
  private rows: Row[] = [];
  private busy = false;

  constructor() { super(SCENES.shop); }

  create(): void {
    const save = services.save.data;
    fadeInScene(this);
    createBackground(this, { dim: 0.8 });
    this.rows = [];
    this.busy = false;

    const contentH = META_UPGRADES.length * (ROW_H + ROW_GAP) + 10;
    this.list = new ScrollList(this, (W - ROW_W) / 2, LIST_Y, ROW_W, 1280 - LIST_Y - 24, contentH);
    META_UPGRADES.forEach((def, i) => this.rows.push(this.buildRow(def, i * (ROW_H + ROW_GAP) + 6, i)));

    // Header sits above the list's blockers (created after it).
    this.goldPill = new CounterPill(this, W - 20, 60, save.gold, { icon: 'gold', color: COLORS.gold, align: 'right' });
    header(this, 'UPGRADES', () => goto(this, SCENES.menu));
    this.refreshRows(false);
  }

  private buildRow(def: MetaUpgradeDef, top: number, index: number): Row {
    const save = services.save.data;
    const level = save.meta[def.id] ?? 0;
    const box = this.add.container(0, top);
    const bg = this.add.graphics();
    const iconBox = this.add.graphics();
    iconBox.fillStyle(COLORS.outline, 1).fillRoundedRect(24, 20, 104, 104, 14);
    iconBox.fillStyle(0x1a1222, 1).fillRoundedRect(28, 24, 96, 96, 11);
    const iconImg = this.add.image(76, 72, ICONS_KEY, def.icon).setScale(4);
    const name = this.add.text(148, 22, def.name, textStyle(40, COLORS.text, { align: 'left' })).setOrigin(0, 0);
    const levelTxt = this.add.text(ROW_W - 28, 38, '', textStyle(30, COLORS.textDim, { align: 'right' })).setOrigin(1, 0.5);
    const pips = new Pips(this, 148, 92, level, def.maxLevel, def.maxLevel > 6 ? 22 : 30, def.maxLevel > 6 ? 5 : 8);
    const desc = this.add.text(28, 132, def.desc, textStyle(28, COLORS.textDim, { align: 'left', wordWrap: { width: ROW_W - 56 } })).setOrigin(0, 0);
    const curTxt = this.add.text(28, 184, '', textStyle(32, COLORS.text, { align: 'left' })).setOrigin(0, 0.5);
    const arrow = this.add.text(0, 184, '→', textStyle(32, COLORS.textDim)).setOrigin(0, 0.5);
    const nextTxt = this.add.text(0, 184, '', textStyle(32, COLORS.heal, { align: 'left' })).setOrigin(0, 0.5);
    const btn = new Button(this, ROW_W - 28 - 120, 184, '', () => this.tryBuy(index), {
      width: 240, height: 88, fontSize: 40, icon: { key: ICONS_KEY, frame: 'gold', scale: 3 },
    });
    box.add([bg, iconBox, iconImg, name, levelTxt, pips, desc, curTxt, arrow, nextTxt, btn]);
    this.list.content.add(box);
    return { def, top, box, bg, pips, levelTxt, curTxt, arrow, nextTxt, btn, iconImg };
  }

  /** Redraws state-dependent bits of every row (affordability, level, texts). */
  private refreshRows(animatePips: boolean, boughtId?: string): void {
    const save = services.save.data;
    for (const r of this.rows) {
      const level = save.meta[r.def.id] ?? 0;
      const maxed = level >= r.def.maxLevel;
      const afford = canBuyMeta(save, r.def.id);
      r.bg.clear();
      drawBox(r.bg, 0, 0, ROW_W, ROW_H, maxed ? 0x1f2d27 : COLORS.panel, maxed ? 0x3d9e6c : afford ? COLORS.gold : COLORS.panelLight);
      r.levelTxt.setText(`Lv ${level}/${r.def.maxLevel}`);
      r.pips.setLevel(level, animatePips && r.def.id === boughtId);
      r.curTxt.setText(metaEffectText(r.def, level));
      r.curTxt.setColor(maxed ? '#63c74d' : '#f4ecd8');
      r.arrow.setVisible(!maxed);
      r.nextTxt.setVisible(!maxed);
      if (!maxed) {
        r.arrow.setX(r.curTxt.x + r.curTxt.width + 14);
        r.nextTxt.setText(metaEffectText(r.def, level + 1));
        r.nextTxt.setX(r.arrow.x + r.arrow.width + 14);
      } else {
        r.curTxt.setText(`${metaEffectText(r.def, level)} (max)`);
      }
      if (maxed) {
        r.btn.setText('MAX').setColor(0x2f6e44).setEnabled(false);
      } else {
        r.btn.setText(fmt(metaCost(r.def, level)));
        r.btn.setColor(afford ? 0x2f9e4e : 0x4a4050);
        r.btn.setEnabled(true);
      }
    }
  }

  private tryBuy(index: number): void {
    if (this.busy) return;
    const save = services.save.data;
    const r = this.rows[index];
    const level = save.meta[r.def.id] ?? 0;
    const cost = metaCost(r.def, level);
    const goldBefore = save.gold;
    if (!buyMeta(save, r.def.id)) {
      services.audio.play('error');
      shake(this, r.btn, 12);
      this.goldPill.pulse(COLORS.danger);
      return;
    }
    this.busy = true;
    void services.save.save();
    services.audio.play('purchase');
    // Gold leaves the counter coin by coin and flies into the upgrade's icon.
    const n = Phaser.Math.Clamp(Math.round(cost / 40), 4, 12);
    const from = this.goldPill.iconPoint();
    const to = { x: this.list.x + 76, y: this.list.content.y + r.top + 72 };
    let shown = goldBefore;
    const finish = (): void => {
      this.goldPill.setValue(save.gold);
      this.goldPill.pulse(COLORS.textDim);
      this.refreshRows(true, r.def.id);
      sparks(this, to.x, to.y, COLORS.gold, 20, 9000, 380);
      if (!reduced()) this.tweens.add({ targets: r.iconImg, scale: { from: 6, to: 4 }, duration: 380, ease: 'Back.Out' });
      this.busy = false;
    };
    flyCoins(this, from, to, n, {
      onLaunch: () => {
        shown -= cost / n;
        this.goldPill.setValue(Math.max(save.gold, Math.round(shown)));
      },
      onDone: finish,
    });
  }
}
