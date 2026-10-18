import Phaser from 'phaser';
import { services } from '../../services';
import { canUnlockTower, isTowerUnlocked, towerUnlockCost, unlockTower } from '../../core/meta';
import { BOSS_IDS, ENEMY_IDS, MAX_TOWER_LEVEL, TOWER_IDS, type BossId, type EnemyId, type TowerId } from '../../data/types';
import { BOSSES } from '../../data/bosses';
import { ENEMIES } from '../../data/enemies';
import { bossKey, enemyKey, iconKey, towerKey } from '../assetKeys';
import { ScrollView } from '../menus/scroll';
import {
  bossKills, bossName, enemyName, firstSentence, formatStat, towerDef, towerName, towerStatsAt,
} from '../menus/logic';
import {
  HEADER_H, burst, clampLines, createHeader, createTabs, flyIcons, menuBackground, silhouette, spriteFit, staggerIn, tickPill,
} from '../menus/widgets';
import {
  DEPTH, H, PALETTE, TOWER_COLORS, W, createButton, createIconButton, crispText, drawPanelBody, fadeIn, fitText, playSfx,
  reducedMotion, showBanner, showToast, uiIcon, type UIPill,
} from '../ui';
import { SceneKeys } from './keys';

const COLS = 2;
const CARD_W = 322;
const CARD_H = 436;
const GAP = 20;
const ROW_W = 664;

type Tab = 'towers' | 'bestiary';
type Sprite = Phaser.GameObjects.Image | Phaser.GameObjects.Arc;

/** Tower collection (unlock + details) and the bestiary of enemies and bosses. */
export class CollectionScene extends Phaser.Scene {
  private view!: ScrollView;
  private pill!: UIPill;
  private cards = new Map<TowerId, Phaser.GameObjects.Container>();
  private detail?: Phaser.GameObjects.Container;
  private detailDim?: Phaser.GameObjects.Rectangle;
  private detailId?: TowerId;

  constructor() { super(SceneKeys.Collection); }

  create(): void {
    fadeIn(this);
    menuBackground(this);
    this.cards = new Map();
    this.detail = undefined;
    this.detailDim = undefined;
    this.detailId = undefined;
    const header = createHeader(this, 'TOWERS', { gems: true });
    this.pill = header.gemPill as UIPill;
    createTabs(this, HEADER_H + 62, ['TOWERS', 'BESTIARY'], (i) => this.showTab(i === 0 ? 'towers' : 'bestiary'));
    const top = HEADER_H + 120;
    this.view = new ScrollView(this, 0, top, W, H - top);
    this.showTab('towers');
  }

  private showTab(tab: Tab): void {
    this.clearContent();
    if (tab === 'towers') this.buildTowers(); else this.buildBestiary();
    this.view.scrollTo(0);
  }

  /** Empties the list and stops the tweens (idle floats) of everything in it. */
  private clearContent(): void {
    const kill = (o: Phaser.GameObjects.GameObject): void => {
      this.tweens.killTweensOf(o);
      if (o instanceof Phaser.GameObjects.Container) o.list.forEach(kill);
    };
    this.view.content.list.forEach(kill);
    this.view.content.removeAll(true);
    this.cards.clear();
  }

  // ---------- towers ----------

  private buildTowers(): void {
    const kids: Phaser.GameObjects.Container[] = [];
    TOWER_IDS.forEach((id, i) => {
      const col = i % COLS, row = Math.floor(i / COLS);
      const x = W / 2 + (col - (COLS - 1) / 2) * (CARD_W + GAP);
      const y = 16 + CARD_H / 2 + row * (CARD_H + GAP);
      const card = this.buildTowerCard(id, x, y);
      this.cards.set(id, card);
      kids.push(card);
      this.view.content.add(card);
    });
    const rows = Math.ceil(TOWER_IDS.length / COLS);
    this.view.setContentHeight(16 + rows * (CARD_H + GAP) + 20);
    staggerIn(this, kids, { step: 50 });
  }

  private buildTowerCard(id: TowerId, x: number, y: number): Phaser.GameObjects.Container {
    const save = services.save.data;
    const def = towerDef(id);
    const unlocked = isTowerUnlocked(save, id);
    const discovered = save.discoveredTowers.includes(id);
    const color = TOWER_COLORS[id] ?? PALETTE.gold;
    const card = this.add.container(x, y);
    const bg = this.add.graphics();
    drawPanelBody(bg, CARD_W, CARD_H, PALETTE.panel, unlocked ? color : 0x3a4580, 26, true);
    const zone = this.add.zone(0, 0, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => { if (!this.view.dragged && !this.detail) { playSfx('click'); this.openDetail(id); } });
    card.add([bg, zone]);

    if (this.textures.exists('fx_glow')) {
      card.add(this.add.image(0, -118, 'fx_glow').setTint(color).setAlpha(unlocked ? 0.45 : 0.15).setDisplaySize(250, 250).setBlendMode(Phaser.BlendModes.ADD));
    }
    const sprite: Sprite = spriteFit(this, 0, -118, towerKey(id, 1), 180);
    if (!unlocked && !discovered) silhouette(sprite); else if (!unlocked && sprite instanceof Phaser.GameObjects.Image) sprite.setTint(0x8b93b8);
    card.add(sprite);
    if (!unlocked) card.add(uiIcon(this, 0, -104, iconKey('lock'), 70).setAlpha(0.95));
    if (unlocked && !reducedMotion()) this.tweens.add({ targets: sprite, y: sprite.y - 5, duration: 1300 + (TOWER_IDS.indexOf(id) % 3) * 200, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    const name = fitText(crispText(this, 0, 6, towerName(id), { preset: 'heading', size: 30 }), CARD_W - 30);
    const role = clampLines(crispText(this, 0, 36, firstSentence(def?.role ?? ''), {
      preset: 'small', size: 22, wordWrap: { width: CARD_W - 40 }, colorNum: 0xc5cdea,
    }).setOrigin(0.5, 0), 3);
    card.add([name, role]);

    if (unlocked) {
      const chip = this.chip(0, CARD_H / 2 - 56, discovered ? 'UNLOCKED' : 'NEW!', discovered ? PALETTE.successDark : PALETTE.danger);
      card.add(chip);
      if (!discovered && !reducedMotion()) this.tweens.add({ targets: chip, scale: 1.1, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    } else {
      const cost = towerUnlockCost(id);
      const btn = createButton(this, 0, CARD_H / 2 - 62, {
        label: Number.isFinite(cost) ? String(cost) : '?', icon: iconKey('gem'), width: CARD_W - 50, height: 84, fontSize: 36,
        style: 'success', enabled: canUnlockTower(save, id),
        onClick: () => { if (!this.view.dragged) this.unlock(id); },
      });
      card.add(btn.container);
    }
    return card;
  }

  /** Small rounded label (UNLOCKED, NEW!). */
  private chip(x: number, y: number, text: string, fill: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const t = crispText(this, 0, 0, text, { preset: 'body', size: 24, colorNum: 0xffffff });
    const w = Math.max(150, t.width + 44);
    const g = this.add.graphics();
    g.fillStyle(PALETTE.outline, 1).fillRoundedRect(-w / 2 - 3, -25, w + 6, 50, 25);
    g.fillStyle(fill, 1).fillRoundedRect(-w / 2, -22, w, 44, 22);
    g.fillStyle(0xffffff, 0.22).fillRoundedRect(-w / 2 + 8, -18, w - 16, 10, 5);
    c.add([g, t]);
    return c;
  }

  private unlock(id: TowerId): void {
    const before = services.save.data.gems;
    if (!unlockTower(services.save, id)) {
      showToast(this, 'Not enough gems', { kind: 'danger', icon: iconKey('gem') });
      return;
    }
    playSfx('unlock');
    const was = this.cards.get(id);
    const scroll = this.view.scroll;
    const wasOpen = this.detailId === id;
    if (wasOpen) this.closeDetail(true);
    // fly gems from the counter to the card, tick the counter down
    const m = was?.getWorldTransformMatrix();
    const dest = m ? { x: m.tx, y: Phaser.Math.Clamp(m.ty, 330, H - 200) } : { x: W / 2, y: 600 };
    flyIcons(this, this.pill.iconPoint(), dest, iconKey('gem'), 8);
    tickPill(this, this.pill, before, services.save.data.gems);
    // rebuild the grid in place and celebrate on the fresh card
    this.clearContent();
    this.buildTowers();
    this.view.scrollTo(scroll);
    const fresh = this.cards.get(id);
    if (fresh) {
      fresh.setAlpha(1).setY(fresh.y);
      const fm = fresh.getWorldTransformMatrix();
      this.time.delayedCall(450, () => {
        burst(this, fm.tx, fm.ty - 100, TOWER_COLORS[id] ?? PALETTE.gold, 24);
        showBanner(this, 'UNLOCKED!', { sub: towerName(id), color: PALETTE.successDark, y: 560, duration: 1500 });
        if (!reducedMotion()) this.tweens.add({ targets: fresh, scale: 1.06, duration: 160, yoyo: true, ease: 'Sine.Out' });
      });
    }
    if (wasOpen) this.time.delayedCall(1700, () => { if (!this.detail) this.openDetail(id); });
  }

  // ---------- detail panel ----------

  private openDetail(id: TowerId, level = 1): void {
    this.closeDetail(true);
    this.detailId = id;
    const save = services.save.data;
    const def = towerDef(id);
    const unlocked = isTowerUnlocked(save, id);
    const color = TOWER_COLORS[id] ?? PALETTE.gold;
    const PH = unlocked ? 1120 : 1220;
    const top = -PH / 2;

    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, reducedMotion() ? 0.72 : 0).setDepth(DEPTH.modalDim).setInteractive();
    if (!reducedMotion()) this.tweens.add({ targets: dim, fillAlpha: 0.72, duration: 180 });
    dim.on('pointerup', () => this.closeDetail());
    this.detailDim = dim;

    const panel = this.add.container(W / 2, H / 2 + 4).setDepth(DEPTH.modal);
    const body = this.add.graphics();
    drawPanelBody(body, ROW_W, PH, PALETTE.panel, unlocked ? color : PALETTE.gold, 32, true);
    // swallow taps on the panel so they do not close it through the dim layer
    const swallow = this.add.zone(0, 0, ROW_W, PH).setInteractive();
    panel.add([body, swallow]);
    this.detail = panel;

    panel.add(fitText(crispText(this, 0, top + 56, towerName(id).toUpperCase(), { preset: 'heading', size: 44 }), 450));
    const close = createIconButton(this, ROW_W / 2 - 62, top + 58, { size: 84, style: 'danger', onClick: () => this.closeDetail() });
    const x = this.add.graphics();
    x.lineStyle(14, PALETTE.outline, 1).beginPath().moveTo(-16, -16).lineTo(16, 16).moveTo(16, -16).lineTo(-16, 16).strokePath();
    x.lineStyle(8, 0xffffff, 1).beginPath().moveTo(-16, -16).lineTo(16, 16).moveTo(16, -16).lineTo(-16, 16).strokePath();
    close.container.add(x);
    panel.add(close.container);
    panel.add(crispText(this, 0, top + 112, def?.role ?? '', { preset: 'small', size: 23, wordWrap: { width: ROW_W - 90 }, colorNum: 0xc5cdea }).setOrigin(0.5, 0));

    // big sprite of the selected level
    const heroY = top + 215;
    if (this.textures.exists('fx_glow')) panel.add(this.add.image(0, heroY - 6, 'fx_glow').setTint(color).setAlpha(0.5).setDisplaySize(330, 330).setBlendMode(Phaser.BlendModes.ADD));
    const hero = spriteFit(this, 0, heroY, towerKey(id, level), 190);
    if (!unlocked && !save.discoveredTowers.includes(id)) silhouette(hero);
    panel.add(hero);

    // level tiles
    const tileY = top + 395;
    const tiles: Array<{ g: Phaser.GameObjects.Graphics; c: Phaser.GameObjects.Container }> = [];
    const stats = this.add.container(0, 0);
    const perks = this.add.container(0, 0);
    const drawTile = (g: Phaser.GameObjects.Graphics, on: boolean): void => {
      g.clear();
      g.fillStyle(PALETTE.outline, 1).fillRoundedRect(-55, -55, 110, 110, 22);
      g.fillStyle(on ? PALETTE.gold : 0x3a4580, 1).fillRoundedRect(-52, -52, 104, 104, 19);
      g.fillStyle(on ? 0x3b3560 : PALETTE.panelDark, 1).fillRoundedRect(-47, -47, 94, 94, 15);
    };
    const select = (l: number, animate = true): void => {
      tiles.forEach((t, i) => {
        drawTile(t.g, i + 1 === l);
        this.tweens.killTweensOf(t.c);
        const s = i + 1 === l ? 1.1 : 1;
        if (animate && !reducedMotion()) this.tweens.add({ targets: t.c, scale: s, duration: 160, ease: 'Back.Out' }); else t.c.setScale(s);
      });
      if (hero instanceof Phaser.GameObjects.Image) {
        hero.setTexture(towerKey(id, l));
        if (!unlocked && !save.discoveredTowers.includes(id)) hero.setTintFill(0x141a38);
        if (animate && !reducedMotion()) { hero.setScale(hero.scaleX * 0.85); this.tweens.add({ targets: hero, scale: 190 / hero.width, duration: 260, ease: 'Back.Out' }); }
      }
      this.fillStats(stats, id, l, top + 466);
      this.fillPerks(perks, id, l, top + 690, select);
    };
    for (let l = 1; l <= MAX_TOWER_LEVEL; l++) {
      const tx = (l - 3) * 120;
      const c = this.add.container(tx, tileY);
      const g = this.add.graphics();
      const spr = spriteFit(this, 0, -2, towerKey(id, l), 90);
      if (!unlocked && !save.discoveredTowers.includes(id)) silhouette(spr);
      const lab = crispText(this, 0, 40, `L${l}`, { preset: 'small', size: 20, colorNum: 0xffffff });
      const z = this.add.zone(0, 0, 110, 110).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => { playSfx('click'); select(l); });
      c.add([g, spr, lab, z]);
      panel.add(c);
      tiles.push({ g, c });
    }
    panel.add([stats, perks]);
    select(level, false);

    if (!unlocked) {
      const cost = towerUnlockCost(id);
      const btn = createButton(this, 0, PH / 2 - 62, {
        label: `UNLOCK  ${Number.isFinite(cost) ? cost : '?'}`, icon: iconKey('gem'), width: 460, height: 100, fontSize: 40, style: 'success',
        enabled: canUnlockTower(save, id), onClick: () => this.unlock(id),
      });
      panel.add(btn.container);
    }

    if (!reducedMotion()) {
      panel.setScale(0.82).setAlpha(0);
      this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 240, ease: 'Back.Out' });
    }
  }

  /** Six stat cells for the selected level. `top` is the y of the first row (panel-local). */
  private fillStats(box: Phaser.GameObjects.Container, id: TowerId, level: number, top: number): void {
    box.removeAll(true);
    const def = towerDef(id);
    const s = towerStatsAt(def, level);
    const kills = services.save.data.stats.towerKills[id] ?? 0;
    const cells: Array<{ icon: string; value: string; label: string; color?: number }> = [
      { icon: 'damage', value: s ? formatStat(s.damage) : '-', label: 'Damage' },
      { icon: 'speed', value: s ? `${formatStat(s.fireRate)}/s` : '-', label: 'Attack speed' },
      { icon: 'range', value: s ? formatStat(s.range) : '-', label: 'Range' },
      s && s.splashRadius > 0 ? { icon: 'explosion', value: formatStat(s.splashRadius), label: 'Splash' }
        : s && s.critChance > 0 ? { icon: 'crit', value: `${Math.round(s.critChance * 100)}%`, label: 'Crit chance' }
          : { icon: 'target', value: s ? formatStat(s.dps) : '-', label: 'DPS' },
      { icon: 'arrow', value: def ? (def.hitsAir ? 'Yes' : 'No') : '-', label: 'Hits air', color: def ? (def.hitsAir ? PALETTE.success : PALETTE.danger) : undefined },
      { icon: 'skull', value: formatStat(kills), label: 'Kills' },
    ];
    cells.forEach((c, i) => {
      const cx = (i % 3 - 1) * 206;
      const cy = top + Math.floor(i / 3) * 104 + 46;
      const g = this.add.graphics();
      g.fillStyle(PALETTE.panelDark, 1).fillRoundedRect(cx - 98, cy - 44, 196, 92, 18);
      g.fillStyle(0xffffff, 0.04).fillRoundedRect(cx - 94, cy - 40, 188, 28, 14);
      const icon = uiIcon(this, cx - 62, cy - 4, iconKey(c.icon), 50);
      const val = crispText(this, cx + 22, cy - 12, c.value, { preset: 'number', size: 30, colorNum: c.color ?? 0xffffff });
      fitText(val, 108);
      const lab = crispText(this, cx + 22, cy + 24, c.label, { preset: 'small', size: 19 });
      fitText(lab, 108);
      box.add([g, icon, val, lab]);
    });
  }

  /** Perk rows for levels 2..5; the selected level is highlighted, higher ones are dimmed. */
  private fillPerks(box: Phaser.GameObjects.Container, id: TowerId, selected: number, top: number, onSelect: (l: number) => void): void {
    box.removeAll(true);
    const def = towerDef(id);
    box.add(crispText(this, 0, top, 'LEVEL PERKS', { preset: 'small', size: 22, colorNum: PALETTE.gold }));
    for (let l = 2; l <= MAX_TOWER_LEVEL; l++) {
      const lv = def?.levels?.[l - 1];
      const y = top + 52 + (l - 2) * 100;
      const on = l === selected;
      const reached = l <= selected;
      const g = this.add.graphics();
      g.fillStyle(on ? PALETTE.gold : PALETTE.outline, 1).fillRoundedRect(-ROW_W / 2 + 34, y - 48, ROW_W - 68, 96, 18);
      g.fillStyle(on ? 0x3b3560 : PALETTE.panelDark, 1).fillRoundedRect(-ROW_W / 2 + 38, y - 44, ROW_W - 76, 88, 15);
      const badge = this.add.graphics();
      badge.fillStyle(reached ? PALETTE.gold : PALETTE.disabledDark, 1).fillRoundedRect(-ROW_W / 2 + 50, y - 29, 64, 58, 14);
      const lab = crispText(this, -ROW_W / 2 + 82, y, `L${l}`, { preset: 'number', size: 28, colorNum: reached ? PALETTE.textDark : 0xffffff, strokeThickness: 0 });
      const name = crispText(this, -ROW_W / 2 + 134, y - 25, lv?.perkName ?? 'Stronger', { preset: 'body', size: 26, colorNum: reached ? PALETTE.goldLight : 0xaab4d4, align: 'left' }).setOrigin(0, 0.5);
      const desc = clampLines(crispText(this, -ROW_W / 2 + 134, y - 6, lv?.perkDesc ?? '', {
        preset: 'small', size: 21, align: 'left', wordWrap: { width: ROW_W - 200 }, colorNum: reached ? 0xdfe5ff : 0x8a93b4,
      }).setOrigin(0, 0), 2);
      desc.setLineSpacing(-2);
      fitText(name, ROW_W - 200);
      const z = this.add.zone(0, y, ROW_W - 68, 96).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => { playSfx('click'); onSelect(l); });
      box.add([g, badge, lab, name, desc, z]);
    }
  }

  private closeDetail(instant = false): void {
    const panel = this.detail, dim = this.detailDim;
    this.detail = undefined;
    this.detailDim = undefined;
    this.detailId = undefined;
    if (!panel) return;
    const done = (): void => { panel.destroy(); dim?.destroy(); };
    if (instant || reducedMotion()) { done(); return; }
    this.tweens.add({ targets: panel, scale: 0.85, alpha: 0, duration: 140, ease: 'Sine.In', onComplete: done });
    if (dim) this.tweens.add({ targets: dim, fillAlpha: 0, duration: 140 });
  }

  // ---------- bestiary ----------

  private buildBestiary(): void {
    const stats = services.save.data.stats;
    const kids: Phaser.GameObjects.Container[] = [];
    let y = 20;
    const section = (label: string): void => {
      const c = this.add.container(W / 2, y + 28);
      const g = this.add.graphics();
      g.fillStyle(PALETTE.gold, 1).fillRect(-ROW_W / 2, 26, ROW_W, 4);
      c.add([g, crispText(this, -ROW_W / 2 + 4, 0, label, { preset: 'heading', size: 32, colorNum: PALETTE.goldLight }).setOrigin(0, 0.5)]);
      this.view.content.add(c);
      y += 76;
    };
    section('ENEMIES');
    (ENEMY_IDS as readonly EnemyId[]).forEach((id) => { kids.push(this.enemyRow(id, y + 85)); y += 170 + 14; });
    section('BOSSES');
    (BOSS_IDS as readonly BossId[]).forEach((id) => { kids.push(this.bossRow(id, y + 90, bossKills(stats, id))); y += 180 + 14; });
    this.view.setContentHeight(y + 24);
    staggerIn(this, kids, { step: 40 });
  }

  private rowFrame(h: number, border: number): { c: Phaser.GameObjects.Container; tile: Phaser.GameObjects.Graphics } {
    const c = this.add.container(W / 2, 0);
    const g = this.add.graphics();
    drawPanelBody(g, ROW_W, h, PALETTE.panel, border, 24, true);
    const tile = this.add.graphics();
    tile.fillStyle(PALETTE.outline, 1).fillRoundedRect(-ROW_W / 2 + 18, -h / 2 + 18, h - 36, h - 36, 20);
    tile.fillStyle(PALETTE.panelDark, 1).fillRoundedRect(-ROW_W / 2 + 22, -h / 2 + 22, h - 44, h - 44, 17);
    c.add([g, tile]);
    this.view.content.add(c);
    return { c, tile };
  }

  private enemyRow(id: EnemyId, y: number): Phaser.GameObjects.Container {
    const def = (ENEMIES as Record<string, (typeof ENEMIES)[EnemyId] | undefined>)[id];
    const H_ = 170;
    const { c } = this.rowFrame(H_, 0x3a4580);
    c.setY(y);
    const size = H_ - 44;
    c.add(spriteFit(this, -ROW_W / 2 + 18 + (H_ - 36) / 2, 0, enemyKey(id), size - 8));
    const tx = -ROW_W / 2 + H_ + 8;
    const tw = ROW_W - H_ - 40;
    c.add(fitText(crispText(this, tx, -H_ / 2 + 36, enemyName(id), { preset: 'heading', size: 32 }).setOrigin(0, 0.5), tw));
    const desc = clampLines(crispText(this, tx, -H_ / 2 + 62, def?.description ?? '', { preset: 'small', size: 22, align: 'left', wordWrap: { width: tw }, colorNum: 0xdfe5ff }).setOrigin(0, 0), 3);
    desc.setLineSpacing(-1);
    c.add(desc);
    if (def) {
      const bits = [`HP ${formatStat(def.hp)}`, `Speed ${formatStat(def.speed)}`];
      if (def.armor > 0) bits.push(`Armor ${Math.round(def.armor * 100)}%`);
      if (def.flying) bits.push('Flying');
      c.add(fitText(crispText(this, tx, H_ / 2 - 28, bits.join('   '), { preset: 'small', size: 22, align: 'left', colorNum: def.flying ? PALETTE.info : PALETTE.goldLight }).setOrigin(0, 0.5), tw));
    }
    return c;
  }

  private bossRow(id: BossId, y: number, kills: number): Phaser.GameObjects.Container {
    const def = (BOSSES as Record<string, (typeof BOSSES)[BossId] | undefined>)[id];
    const known = kills > 0;
    const H_ = 180;
    const { c } = this.rowFrame(H_, known ? PALETTE.gold : 0x2c3358);
    c.setY(y);
    const spr = spriteFit(this, -ROW_W / 2 + 18 + (H_ - 36) / 2, 0, bossKey(id), H_ - 30);
    if (!known) silhouette(spr, 0x2a3158);
    c.add(spr);
    const tx = -ROW_W / 2 + H_ + 8;
    const tw = ROW_W - H_ - 40;
    c.add(fitText(crispText(this, tx, -H_ / 2 + 40, known ? bossName(id) : '???', { preset: 'heading', size: 34, colorNum: known ? 0xffffff : 0x8a93b4 }).setOrigin(0, 0.5), tw));
    const sub = known ? (def?.title ?? '') : `Appears around wave ${def?.wave ?? '?'}`;
    c.add(fitText(crispText(this, tx, -H_ / 2 + 80, sub, { preset: 'small', size: 24, align: 'left', colorNum: known ? PALETTE.goldLight : 0x8a93b4 }).setOrigin(0, 0.5), tw));
    const line = known
      ? `Defeated ${kills}x${def ? `   HP ${formatStat(def.hp)}   ${def.flying ? 'Flying' : 'Ground'}` : ''}`
      : 'Defeat it to reveal its secrets';
    c.add(fitText(crispText(this, tx, H_ / 2 - 36, line, { preset: 'small', size: 22, align: 'left', colorNum: known ? PALETTE.success : 0x8a93b4 }).setOrigin(0, 0.5), tw));
    if (!known) c.add(uiIcon(this, ROW_W / 2 - 52, -H_ / 2 + 44, iconKey('lock'), 56).setAlpha(0.8));
    return c;
  }
}
