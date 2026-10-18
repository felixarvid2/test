import Phaser from 'phaser';
import { services } from '../../services';
import { buyMeta, canBuyMeta, metaCost, metaLevel } from '../../core/meta';
import { META_UPGRADES } from '../../data/meta';
import type { MetaUpgradeDef } from '../../data/types';
import { iconKey } from '../assetKeys';
import { ScrollView } from '../menus/scroll';
import { metaDescription, metaGainText } from '../menus/logic';
import {
  HEADER_H, burst, createHeader, createPips, flyIcons, menuBackground, staggerIn, tickPill, type Pips,
} from '../menus/widgets';
import {
  DEPTH, PALETTE, W, createButton, crispText, drawPanelBody, fadeIn, fitText, floatText, playSfx, reducedMotion, showToast,
  uiIcon, type UIButton, type UIPill,
} from '../ui';
import { SceneKeys } from './keys';

const CARD_W = 664;
const CARD_H = 304;
const GAP = 20;

interface Row {
  def: MetaUpgradeDef;
  card: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  flash: Phaser.GameObjects.Rectangle;
  desc: Phaser.GameObjects.Text;
  levelText: Phaser.GameObjects.Text;
  pips: Pips;
  next: Phaser.GameObjects.Container;
  buy: UIButton;
  maxed: Phaser.GameObjects.Container;
}

/** Permanent upgrades bought with gems: a scrollable list of cards. */
export class ShopScene extends Phaser.Scene {
  private view!: ScrollView;
  private pill!: UIPill;
  private rows: Row[] = [];

  constructor() { super(SceneKeys.Shop); }

  create(): void {
    fadeIn(this);
    menuBackground(this);
    this.rows = [];
    const header = createHeader(this, 'UPGRADES', { gems: true });
    this.pill = header.gemPill as UIPill;

    const top = HEADER_H + 14;
    this.view = new ScrollView(this, 0, top, W, 1280 - top);
    META_UPGRADES.forEach((def, i) => this.rows.push(this.buildRow(def, 14 + CARD_H / 2 + i * (CARD_H + GAP))));
    this.view.setContentHeight(14 + META_UPGRADES.length * (CARD_H + GAP) + 30);
    this.rows.forEach((r) => this.refresh(r, false));
    staggerIn(this, this.rows.map((r) => r.card));
  }

  private buildRow(def: MetaUpgradeDef, y: number): Row {
    const card = this.add.container(W / 2, y);
    const bg = this.add.graphics();
    const flash = this.add.rectangle(0, 0, CARD_W, CARD_H, 0xffffff, 0).setBlendMode(Phaser.BlendModes.ADD);
    const iconTile = this.add.graphics();
    iconTile.fillStyle(PALETTE.outline, 1).fillRoundedRect(-CARD_W / 2 + 24, -CARD_H / 2 + 24, 112, 112, 22);
    iconTile.fillStyle(PALETTE.panelLight, 1).fillRoundedRect(-CARD_W / 2 + 28, -CARD_H / 2 + 28, 104, 104, 19);
    iconTile.fillStyle(0xffffff, 0.1).fillRoundedRect(-CARD_W / 2 + 34, -CARD_H / 2 + 33, 92, 30, 12);
    const icon = uiIcon(this, -CARD_W / 2 + 80, -CARD_H / 2 + 80, iconKey(def.icon), 82);
    const name = crispText(this, -CARD_W / 2 + 156, -CARD_H / 2 + 50, def.name, { preset: 'heading', size: 36 }).setOrigin(0, 0.5);
    fitText(name, 330);
    const levelText = crispText(this, CARD_W / 2 - 30, -CARD_H / 2 + 50, '', { preset: 'number', size: 34, colorNum: PALETTE.goldLight }).setOrigin(1, 0.5);
    const pips = createPips(this, -CARD_W / 2 + 156, -CARD_H / 2 + 104, 0, def.maxLevel, 480);
    const desc = crispText(this, -CARD_W / 2 + 30, -CARD_H / 2 + 150, '', {
      preset: 'body', size: 26, align: 'left', wordWrap: { width: CARD_W - 60 },
    }).setOrigin(0, 0);
    desc.setLineSpacing(2);

    // "Next level +15" preview on the bottom left
    const next = this.add.container(-CARD_W / 2 + 30, CARD_H / 2 - 62);
    const nextLabel = crispText(this, 0, 0, 'Next level', { preset: 'small', size: 22 }).setOrigin(0, 0.5);
    const nextVal = crispText(this, nextLabel.width + 12, 0, metaGainText(def), { preset: 'number', size: 30, colorNum: PALETTE.success }).setOrigin(0, 0.5);
    next.add([nextLabel, nextVal]);

    const buy = createButton(this, CARD_W / 2 - 30 - 130, CARD_H / 2 - 64, {
      label: '0', icon: iconKey('gem'), width: 260, height: 92, fontSize: 40, style: 'success',
      onClick: () => { if (!this.view.dragged) this.buy(def.id); },
    });

    const maxed = this.add.container(CARD_W / 2 - 30 - 130, CARD_H / 2 - 64);
    const mg = this.add.graphics();
    mg.fillStyle(PALETTE.outline, 1).fillRoundedRect(-130, -38, 260, 76, 38);
    mg.fillStyle(PALETTE.goldDark, 1).fillRoundedRect(-126, -34, 252, 68, 34);
    mg.fillStyle(PALETTE.gold, 1).fillRoundedRect(-126, -34, 252, 44, 34);
    maxed.add([mg, crispText(this, 0, 0, 'MAX LEVEL', { preset: 'body', size: 30, colorNum: PALETTE.textDark, strokeThickness: 0 })]);

    card.add([bg, iconTile, icon, name, levelText, pips.container, desc, next, buy.container, maxed, flash]);
    this.view.content.add(card);
    return { def, card, bg, flash, desc, levelText, pips, next, buy, maxed };
  }

  /** Redraws everything that depends on the save: level, texts, price, affordability. */
  private refresh(r: Row, animatePips: boolean): void {
    const save = services.save.data;
    const level = metaLevel(save, r.def.id);
    const isMax = level >= r.def.maxLevel;
    const afford = canBuyMeta(save, r.def.id);
    drawPanelBody(r.bg, CARD_W, CARD_H, isMax ? 0x1d2f33 : PALETTE.panel, isMax ? PALETTE.gold : afford ? PALETTE.success : 0x3a4580, 26, true);
    r.levelText.setText(`${level}/${r.def.maxLevel}`);
    r.pips.setLevel(level, animatePips);
    r.desc.setText(metaDescription(r.def, level));
    r.next.setVisible(!isMax);
    r.buy.setVisible(!isMax);
    r.maxed.setVisible(isMax);
    if (!isMax) {
      r.buy.setLabel(String(metaCost(r.def, level + 1)));
      r.buy.setEnabled(afford);
      r.buy.setStyle('success');
    }
  }

  private buy(id: string): void {
    const row = this.rows.find((r) => r.def.id === id);
    if (!row) return;
    const save = services.save.data;
    const level = metaLevel(save, id);
    const cost = metaCost(row.def, level + 1);
    const before = save.gems;
    if (!buyMeta(services.save, id)) {
      showToast(this, 'Not enough gems', { kind: 'danger', icon: iconKey('gem') });
      return;
    }
    playSfx('purchase');

    // card flash + pop
    if (!reducedMotion()) {
      row.flash.setFillStyle(0xffffff, 0.55);
      this.tweens.add({ targets: row.flash, fillAlpha: 0, duration: 420, ease: 'Sine.Out' });
      this.tweens.add({ targets: row.card, scale: 1.035, duration: 110, yoyo: true, ease: 'Sine.Out' });
    }
    // gems fly from the counter to the buy button; the counter ticks down meanwhile
    const m = row.buy.container.getWorldTransformMatrix();
    const target = { x: m.tx, y: m.ty };
    const worldTop = this.view.viewportTop;
    const inView = target.y > worldTop && target.y < 1280;
    const dest = inView ? target : { x: W / 2, y: worldTop + 120 };
    flyIcons(this, this.pill.iconPoint(), dest, iconKey('gem'), Math.min(10, Math.max(4, Math.round(cost / 12))), {
      onArrive: (i) => { if (i === 0) burst(this, dest.x, dest.y, PALETTE.gold, 10); },
    });
    tickPill(this, this.pill, before, services.save.data.gems);

    this.rows.forEach((r) => this.refresh(r, r === row));
    const newLevel = metaLevel(services.save.data, id);
    const gain = metaGainText(row.def);
    floatText(this, dest.x, dest.y - 70, gain, { color: PALETTE.success, size: 44, depth: DEPTH.toast - 5 });
    if (newLevel >= row.def.maxLevel) {
      playSfx('achievement');
      burst(this, row.card.getWorldTransformMatrix().tx, dest.y, PALETTE.goldLight, 22);
    }
  }
}
