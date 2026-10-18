import Phaser from 'phaser';
import { services } from '../../services';
import { BOSS_IDS, type BossId } from '../../data/types';
import { bossKey, iconKey, towerKey } from '../assetKeys';
import {
  bossKills, bossName, formatRunDate, rankSynergies, rankTowerKills, synergyIcon, synergyName, towerName,
} from '../menus/logic';
import { ScrollView } from '../menus/scroll';
import { HEADER_H, createHeader, menuBackground, sectionHeader, silhouette, spriteFit, staggerIn } from '../menus/widgets';
import {
  H, PALETTE, TOWER_COLORS, W, createProgressBar, crispText, drawPanelBody, fadeIn, fitText, formatNumber, uiIcon,
} from '../ui';
import { SceneKeys } from './keys';

const ROW_W = 664;
const TILE_W = 322;
const TILE_H = 132;
const GAP = 20;

/** Lifetime stats, best run, bosses slain and the most successful towers and synergies. */
export class StatsScene extends Phaser.Scene {
  constructor() { super(SceneKeys.Stats); }

  create(): void {
    fadeIn(this);
    menuBackground(this);
    createHeader(this, 'STATS');
    const top = HEADER_H + 14;
    const view = new ScrollView(this, 0, top, W, H - top);
    const box = view.content;
    const save = services.save.data;
    const s = save.stats;
    const animated: Phaser.GameObjects.Container[] = [];
    let y = 8;

    // ---- lifetime tiles
    y += sectionHeader(this, box, y, 'LIFETIME');
    const tiles: Array<[string, string, string]> = [
      ['clock', formatNumber(s.runs), 'Runs played'],
      ['trophy', formatNumber(s.bestWave), 'Best wave'],
      ['castle', formatNumber(s.wavesSurvived), 'Waves survived'],
      ['skull', formatNumber(s.enemiesKilled), 'Enemies defeated'],
      ['merge', formatNumber(s.towersMerged), 'Towers merged'],
      ['star', s.highestTowerLevel > 0 ? `Lv ${s.highestTowerLevel}` : '-', 'Highest tower'],
      ['crown', formatNumber(s.bossesKilled), 'Bosses defeated'],
      ['gem', formatNumber(s.gemsEarned), 'Gems earned'],
    ];
    tiles.forEach(([icon, value, label], i) => {
      const x = W / 2 + ((i % 2) - 0.5) * (TILE_W + GAP);
      const t = this.tile(x, y + TILE_H / 2 + Math.floor(i / 2) * (TILE_H + GAP), icon, value, label);
      box.add(t);
      animated.push(t);
    });
    y += Math.ceil(tiles.length / 2) * (TILE_H + GAP) + 6;

    // ---- best run
    y += sectionHeader(this, box, y, 'BEST RUN');
    const best = this.bestRunCard(y + 100);
    box.add(best);
    animated.push(best);
    y += 200 + GAP + 6;

    // ---- bosses
    y += sectionHeader(this, box, y, 'BOSSES DEFEATED');
    const bosses = this.bossesCard(y + 96);
    box.add(bosses);
    animated.push(bosses);
    y += 192 + GAP + 6;

    // ---- top towers
    y += sectionHeader(this, box, y, 'TOP TOWERS');
    const ranked = rankTowerKills(s.towerKills);
    if (ranked.length === 0) {
      const e = this.emptyCard(y + 60, 'Defeat enemies to rank your towers.');
      box.add(e);
      y += 120 + GAP;
    } else {
      ranked.forEach((r, i) => {
        const row = this.rankRow(y + 48, i + 1, r.fraction, formatNumber(r.value), towerName(r.id), TOWER_COLORS[r.id] ?? PALETTE.gold,
          spriteFit(this, 0, 0, towerKey(r.id, 3), 92));
        box.add(row);
        if (i < 5) animated.push(row);
        y += 96 + 14;
      });
    }
    y += 12;

    // ---- synergies
    y += sectionHeader(this, box, y, 'TOP SYNERGIES');
    const syn = rankSynergies(s.synergyCounts, 5);
    if (syn.length === 0) {
      box.add(this.emptyCard(y + 60, 'Combine the right towers to trigger synergies.'));
      y += 120 + GAP;
    } else {
      syn.forEach((r, i) => {
        box.add(this.rankRow(y + 48, i + 1, r.fraction, `x${formatNumber(r.value)}`, synergyName(r.id), PALETTE.info, uiIcon(this, 0, 0, iconKey(synergyIcon(r.id)), 66)));
        y += 96 + 14;
      });
    }
    view.setContentHeight(y + 30);
    staggerIn(this, animated, { step: 35, max: 8 });
  }

  /** Icon + big value + label tile. */
  private tile(x: number, y: number, icon: string, value: string, label: string): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    drawPanelBody(g, TILE_W, TILE_H, PALETTE.panel, 0x3a4580, 24, true);
    const ic = this.add.graphics();
    ic.fillStyle(PALETTE.outline, 1).fillRoundedRect(-TILE_W / 2 + 16, -44, 88, 88, 20);
    ic.fillStyle(PALETTE.panelLight, 1).fillRoundedRect(-TILE_W / 2 + 19, -41, 82, 82, 17);
    const img = uiIcon(this, -TILE_W / 2 + 60, 0, iconKey(icon), 62);
    const tx = -TILE_W / 2 + 118;
    const tw = TILE_W - 118 - 14;
    c.add([g, ic, img,
      fitText(crispText(this, tx, -14, value, { preset: 'number', size: 38, colorNum: PALETTE.goldLight }).setOrigin(0, 0.5), tw),
      fitText(crispText(this, tx, 28, label, { preset: 'small', size: 22 }).setOrigin(0, 0.5), tw)]);
    return c;
  }

  private bestRunCard(y: number): Phaser.GameObjects.Container {
    const run = services.save.data.bestRun;
    const c = this.add.container(W / 2, y);
    const g = this.add.graphics();
    drawPanelBody(g, ROW_W, 200, PALETTE.panel, run ? PALETTE.gold : 0x3a4580, 26, true);
    c.add(g);
    if (!run) {
      c.add(crispText(this, 0, 0, 'Finish a run to set your record!', { preset: 'body', size: 30, wordWrap: { width: ROW_W - 80 } }));
      return c;
    }
    c.add(uiIcon(this, -ROW_W / 2 + 78, -30, iconKey('trophy'), 92));
    c.add(crispText(this, -ROW_W / 2 + 156, -48, `Wave ${run.wave}`, { preset: 'title', size: 56 }).setOrigin(0, 0.5));
    const date = formatRunDate(run.date);
    if (date) c.add(crispText(this, ROW_W / 2 - 28, -64, date, { preset: 'small', size: 22 }).setOrigin(1, 0.5));
    const cells: Array<[string, string, string]> = [
      ['skull', formatNumber(run.kills), 'defeated'], ['merge', formatNumber(run.merges), 'merges'], ['gem', formatNumber(run.gems), 'gems'],
    ];
    cells.forEach(([icon, value, label], i) => {
      const cx = -ROW_W / 2 + 42 + i * 214;
      c.add(uiIcon(this, cx + 22, 56, iconKey(icon), 46));
      c.add(crispText(this, cx + 54, 46, value, { preset: 'number', size: 30 }).setOrigin(0, 0.5));
      c.add(crispText(this, cx + 54, 78, label, { preset: 'small', size: 20 }).setOrigin(0, 0.5));
    });
    return c;
  }

  private bossesCard(y: number): Phaser.GameObjects.Container {
    const c = this.add.container(W / 2, y);
    const g = this.add.graphics();
    drawPanelBody(g, ROW_W, 192, PALETTE.panel, 0x3a4580, 26, true);
    c.add(g);
    const stats = services.save.data.stats;
    (BOSS_IDS as readonly BossId[]).forEach((id, i) => {
      const cx = (i - 1) * 214;
      const n = bossKills(stats, id);
      const spr = spriteFit(this, cx, -30, bossKey(id), 112);
      if (n === 0) silhouette(spr, 0x2a3158);
      c.add(spr);
      c.add(fitText(crispText(this, cx, 52, n > 0 ? bossName(id) : '???', { preset: 'small', size: 22, colorNum: n > 0 ? 0xffffff : 0x8a93b4 }), 200));
      c.add(crispText(this, cx, 80, `x${n}`, { preset: 'number', size: 28, colorNum: n > 0 ? PALETTE.goldLight : 0x8a93b4 }));
    });
    return c;
  }

  /** Ranked row: place, sprite, name and a bar scaled to the best entry. */
  private rankRow(
    y: number, place: number, fraction: number, valueText: string, name: string, color: number,
    sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Arc,
  ): Phaser.GameObjects.Container {
    const c = this.add.container(W / 2, y);
    const g = this.add.graphics();
    drawPanelBody(g, ROW_W, 96, PALETTE.panel, place === 1 ? PALETTE.gold : 0x3a4580, 22, true);
    c.add(g);
    c.add(crispText(this, -ROW_W / 2 + 40, 0, String(place), { preset: 'number', size: 34, colorNum: place === 1 ? PALETTE.gold : PALETTE.textDim }));
    sprite.setPosition(-ROW_W / 2 + 118, 0);
    c.add(sprite);
    const x0 = -ROW_W / 2 + 178;
    c.add(fitText(crispText(this, x0, -22, name, { preset: 'body', size: 28, align: 'left' }).setOrigin(0, 0.5), 280));
    const barW = 280;
    const bar = createProgressBar(this, x0 + barW / 2, 20, barW, 22, { value: Math.max(0.04, fraction), color });
    c.add(bar.container);
    c.add(crispText(this, ROW_W / 2 - 28, 0, valueText, { preset: 'number', size: 32, colorNum: PALETTE.goldLight }).setOrigin(1, 0.5));
    return c;
  }

  private emptyCard(y: number, text: string): Phaser.GameObjects.Container {
    const c = this.add.container(W / 2, y);
    const g = this.add.graphics();
    drawPanelBody(g, ROW_W, 108, PALETTE.panel, 0x3a4580, 24, true);
    c.add([g, crispText(this, 0, 0, text, { preset: 'small', size: 26, wordWrap: { width: ROW_W - 80 } })]);
    return c;
  }
}
