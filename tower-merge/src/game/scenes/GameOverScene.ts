import Phaser from 'phaser';
import { SYNERGIES } from '../../data/synergies';
import { applyDoubleGems, finishRun, type FinishResult } from '../../core/runResult';
import { services } from '../../services';
import type { RunStats } from '../../sim/api';
import {
  buildResultRows, countdownFraction, countdownSeconds, isVictory, reviveOfferAvailable, type ResultRow,
} from '../overlays/logic';
import {
  addDim, addGlow, burst, closeOverlay, coinShower, emitOnGame, ensureOverlayTextures, layoutChips, tweenNumber,
} from '../overlays/overlayKit';
import { createRewardOffer, type UIRewardOffer } from '../overlays/rewardOffer';
import {
  DEPTH, PALETTE, W, createButton, crispText, fadeToScene, fitText, formatNumber, playSfx, reducedMotion, showToast, uiIcon, type UIButton,
} from '../ui';
import { OverlayEvents, type GameOverSceneData } from './contracts';
import { SceneKeys } from './keys';

const REVIVE_SECONDS = 8;
const RING_CX = W / 2;
const RING_CY = 510;
const RING_R = 150;

const ROW_H = 66;
const ROWS_TOP = 250;

/**
 * Run end. First, if a revive is possible, the "castle has fallen" screen with the revive offer
 * and an 8 s countdown. Then (forfeit if needed, finishRun once) the animated results screen.
 */
export class GameOverScene extends Phaser.Scene {
  private ctx!: GameOverSceneData;
  private phase: 'revive' | 'results' = 'revive';
  private layer: Phaser.GameObjects.Container | null = null;
  private left = REVIVE_SECONDS;
  private ring: Phaser.GameObjects.Graphics | null = null;
  private secondsText: Phaser.GameObjects.Text | null = null;
  private offer: UIRewardOffer | null = null;
  private busy = false;
  private leaving = false;
  private defeatPlayed = false;
  private banked: FinishResult | null = null;
  private gemsText: Phaser.GameObjects.Text | null = null;
  private gemsShown = 0;

  constructor() {
    super(SceneKeys.GameOver);
  }

  init(data: GameOverSceneData): void {
    this.ctx = data;
    this.phase = 'revive';
    this.layer = null;
    this.left = REVIVE_SECONDS;
    this.ring = null;
    this.secondsText = null;
    this.offer = null;
    this.busy = false;
    this.leaving = false;
    this.defeatPlayed = false;
    this.banked = null;
    this.gemsText = null;
    this.gemsShown = 0;
  }

  create(): void {
    ensureOverlayTextures(this);
    addDim(this, 0.9);
    const gate = services.rewards.gate('revive', { runId: this.ctx.runId });
    if (reviveOfferAvailable(this.ctx.world, gate)) this.showRevive();
    else this.showResults();
  }

  update(_time: number, delta: number): void {
    if (this.phase !== 'revive' || this.busy || this.leaving || !this.ring) return;
    this.left = Math.max(0, this.left - delta / 1000);
    this.drawRing();
    if (this.left <= 0) this.giveUp();
  }

  // --- revive screen ---------------------------------------------------------------------------

  private showRevive(): void {
    this.phase = 'revive';
    const layer = this.add.container(0, 0).setDepth(DEPTH.panel);
    this.layer = layer;
    this.defeatPlayed = true;
    playSfx('defeat');

    const title = fitText(crispText(this, W / 2, 190, 'Your castle\nhas fallen!', { preset: 'title', size: 60, colorNum: 0xff8a7e }), W - 60);
    layer.add(title);

    const glow = addGlow(this, RING_CX, RING_CY, 460, PALETTE.danger, 0.35);
    if (glow) layer.add(glow);
    layer.add(uiIcon(this, RING_CX, RING_CY, 'icon_castle', 190));
    this.ring = this.add.graphics();
    layer.add(this.ring);
    const badge = this.add.graphics();
    badge.fillStyle(PALETTE.outline, 1).fillCircle(RING_CX, RING_CY + RING_R, 48);
    badge.fillStyle(PALETTE.panelDark, 1).fillCircle(RING_CX, RING_CY + RING_R, 42);
    layer.add(badge);
    this.secondsText = crispText(this, RING_CX, RING_CY + RING_R, String(REVIVE_SECONDS), { preset: 'number', size: 52 });
    layer.add(this.secondsText);
    this.drawRing();

    layer.add(crispText(this, W / 2, 770, 'Revive restores 50% castle HP\nand clears nearby enemies.', {
      preset: 'body', size: 30, lineSpacing: 6,
    }));

    this.offer = createRewardOffer(this, W / 2, 890, {
      placement: 'revive', ctx: { runId: this.ctx.runId }, prefix: 'REVIVE', width: 600, height: 140, fontSize: 44, depth: DEPTH.panel + 2,
      onBusyChange: (b) => { this.busy = b; },
      onGranted: () => this.onRevived(),
    });
    layer.add(this.offer.container);
    layer.add(createButton(this, W / 2, 1030, {
      label: 'Give up', width: 340, height: 96, fontSize: 34, style: 'ghost', depth: DEPTH.panel + 2, onClick: () => { if (!this.busy) this.giveUp(); },
    }).container);

    if (!reducedMotion()) {
      layer.setAlpha(0);
      this.tweens.add({ targets: layer, alpha: 1, duration: 280 });
      title.setScale(0.7);
      this.tweens.add({ targets: title, scale: title.scale / 0.7, duration: 360, ease: 'Back.Out' });
    }
  }

  private drawRing(): void {
    if (!this.ring) return;
    const frac = countdownFraction(this.left, REVIVE_SECONDS);
    const color = this.left <= 3 ? PALETTE.danger : PALETTE.gold;
    const g = this.ring;
    g.clear();
    g.lineStyle(26, PALETTE.outline, 1).beginPath().arc(RING_CX, RING_CY, RING_R, 0, Math.PI * 2).strokePath();
    g.lineStyle(16, PALETTE.panelDark, 1).beginPath().arc(RING_CX, RING_CY, RING_R, 0, Math.PI * 2).strokePath();
    if (frac > 0) {
      g.lineStyle(16, color, 1).beginPath().arc(RING_CX, RING_CY, RING_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac).strokePath();
    }
    this.secondsText?.setText(String(countdownSeconds(this.left)));
  }

  private onRevived(): void {
    if (this.ctx.world.revive()) {
      playSfx('upgrade_pick');
      burst(this, RING_CX, RING_CY, PALETTE.success, 26, 260);
      this.leaving = true;
      this.time.delayedCall(reducedMotion() ? 100 : 450, () => closeOverlay(this));
      return;
    }
    showToast(this, 'Could not revive', { kind: 'danger' });
    this.showResults();
  }

  private giveUp(): void {
    if (this.phase !== 'revive' || this.leaving) return;
    this.showResults();
  }

  // --- results ---------------------------------------------------------------------------------

  /** Forfeits a defeated run and banks it exactly once (the result is cached per run id). */
  private bank(): FinishResult {
    if (this.banked) return this.banked;
    const key = `tm-finish:${this.ctx.runId}`;
    const cached = this.registry.get(key) as FinishResult | undefined;
    if (cached) { this.banked = cached; return cached; }
    const world = this.ctx.world;
    if (world.phase === 'defeated') world.forfeit();
    const res = finishRun(services.save, world.stats, { daily: this.ctx.daily?.key, doubled: false, runId: this.ctx.runId });
    this.registry.set(key, res);
    this.banked = res;
    return res;
  }

  private showResults(): void {
    this.phase = 'results';
    this.offer?.destroy();
    this.offer = null;
    this.layer?.destroy();
    this.ring = null;
    const res = this.bank();
    const stats = this.ctx.world.stats;
    const victory = isVictory(stats.wave);
    const layer = this.add.container(0, 0).setDepth(DEPTH.panel);
    this.layer = layer;

    // title
    const titleColor = victory ? PALETTE.goldLight : 0xff8a7e;
    if (victory) {
      const glow = addGlow(this, W / 2, 105, 520, PALETTE.gold, 0.5);
      if (glow) layer.add(glow);
    }
    const title = crispText(this, W / 2, 105, victory ? 'VICTORY!' : 'DEFEAT', { preset: 'title', size: 92, colorNum: titleColor });
    layer.add(title);
    if (!reducedMotion()) {
      title.setScale(0.3).setAlpha(0);
      this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 420, ease: 'Back.Out' });
    }
    if (victory) burst(this, W / 2, 105, PALETTE.gold, 22, 280);
    if (!this.defeatPlayed || victory) playSfx(victory ? 'victory' : 'defeat');
    if (this.ctx.daily) {
      layer.add(crispText(this, W / 2, 168, `Daily challenge  ${this.ctx.daily.key}`, { preset: 'small', size: 22, colorNum: PALETTE.info }));
    }
    if (res.newBestWave) this.addRibbon(layer, 205);

    this.buildRows(layer, res, stats);

    // best run
    const best = services.save.data.bestRun;
    let y = ROWS_TOP + 6 * ROW_H + 24 + 18;
    if (best) {
      layer.add(crispText(this, W / 2, y + 14, `Best run: wave ${best.wave}  -  ${formatNumber(best.kills)} kills`, { preset: 'small', size: 24 }));
    }
    y += 52;

    // achievements
    if (res.newAchievements.length) {
      layer.add(crispText(this, W / 2, y + 10, 'ACHIEVEMENTS UNLOCKED', { preset: 'small', size: 20, colorNum: PALETTE.goldLight }));
      y += 30;
      const shown = res.newAchievements.slice(0, 2);
      shown.forEach((a, i) => {
        const row = this.add.container(W / 2, y + 26 + i * 54);
        const bg = this.add.graphics();
        bg.fillStyle(PALETTE.outline, 1).fillRoundedRect(-300, -24, 600, 48, 24);
        bg.fillStyle(PALETTE.panelDark, 1).fillRoundedRect(-297, -21, 594, 42, 21);
        row.add(bg);
        row.add(uiIcon(this, -270, 0, `icon_${a.icon}`, 38));
        row.add(crispText(this, -240, 0, a.name, { preset: 'body', size: 26 }).setOrigin(0, 0.5));
        row.add(uiIcon(this, 232, 0, 'icon_gem', 32));
        row.add(crispText(this, 262, 0, `+${a.reward}`, { preset: 'small', size: 24, colorNum: PALETTE.success }).setOrigin(0, 0.5));
        layer.add(row);
        if (!reducedMotion()) {
          row.setAlpha(0).setScale(0.8);
          this.tweens.add({ targets: row, alpha: 1, scale: 1, duration: 280, delay: 1100 + i * 140, ease: 'Back.Out' });
        }
      });
      y += shown.length * 54 + 6;
      const more = res.newAchievements.length - shown.length;
      if (more > 0) {
        layer.add(crispText(this, W / 2, y + 8, `+${more} more`, { preset: 'small', size: 22 }));
        y += 26;
      }
      this.time.delayedCall(reducedMotion() ? 0 : 1100, () => playSfx('achievement'));
    }

    // synergies discovered this run
    const synergies = [...new Set(stats.synergiesActivated)].map((id) => SYNERGIES.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
    if (synergies.length) {
      layer.add(crispText(this, W / 2, y + 10, 'SYNERGIES DISCOVERED', { preset: 'small', size: 20, colorNum: PALETTE.info }));
      const chips = layoutChips(this, synergies.map((s) => ({ icon: `icon_${s.icon}`, text: s.name, color: PALETTE.info })), W / 2, y + 26, W - 50, 1, 46);
      layer.add(chips.container);
      y += 26 + chips.height + 6;
    }

    // double gems
    if (res.gemsBanked > 0) {
      this.offer = createRewardOffer(this, W / 2, 1038, {
        placement: 'doubleGems', ctx: { runId: this.ctx.runId }, prefix: 'x2 gems', width: 580, height: 104, fontSize: 36, depth: DEPTH.panel + 2,
        onBusyChange: (b) => { this.busy = b; },
        onGranted: () => this.doubleGems(res),
      });
      layer.add(this.offer.container);
      if (!reducedMotion() && this.offer.visible) {
        this.offer.container.setAlpha(0);
        this.tweens.add({ targets: this.offer.container, alpha: 1, duration: 300, delay: 1300 });
      }
    }

    // navigation
    const again = createButton(this, 225, 1176, {
      label: 'PLAY AGAIN', width: 400, height: 108, fontSize: 42, style: 'primary', depth: DEPTH.panel + 2, onClick: () => this.playAgain(),
    });
    const menu = createButton(this, 570, 1176, {
      label: 'MENU', width: 250, height: 108, fontSize: 38, style: 'secondary', depth: DEPTH.panel + 2, onClick: () => this.toMenu(),
    });
    layer.add([again.container, menu.container]);
    this.pulse(again);
  }

  private buildRows(layer: Phaser.GameObjects.Container, res: FinishResult, stats: RunStats): void {
    const rows: ResultRow[] = buildResultRows(stats, res.gemsBanked + res.achievementGems, res.achievementGems);
    const panelH = rows.length * ROW_H + 24;
    const cy = ROWS_TOP + panelH / 2;
    const g = this.add.graphics();
    g.fillStyle(PALETTE.outline, 1).fillRoundedRect(W / 2 - 328, cy - panelH / 2 - 4, 656, panelH + 8, 28);
    g.fillStyle(PALETTE.gold, 1).fillRoundedRect(W / 2 - 324, cy - panelH / 2, 648, panelH, 25);
    g.fillStyle(PALETTE.panel, 1).fillRoundedRect(W / 2 - 319, cy - panelH / 2 + 5, 638, panelH - 10, 21);
    layer.add(g);
    rows.forEach((row, i) => {
      const y = ROWS_TOP + 12 + i * ROW_H + ROW_H / 2;
      const c = this.add.container(0, y);
      if (i % 2 === 0) {
        const stripe = this.add.graphics();
        stripe.fillStyle(0xffffff, 0.05).fillRoundedRect(W / 2 - 304, -ROW_H / 2 + 3, 608, ROW_H - 6, 14);
        c.add(stripe);
      }
      c.add(uiIcon(this, 88, 0, `icon_${row.icon}`, 46));
      c.add(crispText(this, 130, 0, row.label, { preset: 'body', size: 28 }).setOrigin(0, 0.5));
      const value = crispText(this, W - 80, 0, '0', { preset: 'number', size: 40 }).setOrigin(1, 0.5);
      c.add(value);
      layer.add(c);
      if (row.key === 'gems') { this.gemsText = value; this.gemsShown = row.value; value.setColor('#5ed06a'); }
      const delay = reducedMotion() ? 0 : 450 + i * 140;
      if (!reducedMotion()) {
        c.setAlpha(0).setX(-60);
        this.tweens.add({ targets: c, alpha: 1, x: 0, duration: 260, delay, ease: 'Cubic.Out' });
      }
      tweenNumber(this, 0, row.value, 800, delay, (v) => value.setText(formatNumber(v)));
      if (row.key === 'coins' || row.key === 'gems') this.time.delayedCall(delay, () => playSfx('coin'));
    });
  }

  private addRibbon(layer: Phaser.GameObjects.Container, y: number): void {
    const c = this.add.container(W / 2, y);
    const g = this.add.graphics();
    const w = 330, h = 54;
    g.fillStyle(PALETTE.outline, 1).fillTriangle(-w / 2 - 34, -h / 2 + 8, -w / 2 + 16, -h / 2 + 8, -w / 2 + 16, h / 2 + 8).fillTriangle(w / 2 + 34, -h / 2 + 8, w / 2 - 16, -h / 2 + 8, w / 2 - 16, h / 2 + 8);
    g.fillStyle(PALETTE.goldDark, 1).fillTriangle(-w / 2 - 28, -h / 2 + 12, -w / 2 + 16, -h / 2 + 12, -w / 2 + 16, h / 2 + 4).fillTriangle(w / 2 + 28, -h / 2 + 12, w / 2 - 16, -h / 2 + 12, w / 2 - 16, h / 2 + 4);
    g.fillStyle(PALETTE.outline, 1).fillRoundedRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 12);
    g.fillStyle(PALETTE.goldDark, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 9);
    g.fillStyle(PALETTE.gold, 1).fillRoundedRect(-w / 2, -h / 2, w, h - 8, 9);
    g.fillStyle(0xffffff, 0.3).fillRoundedRect(-w / 2 + 8, -h / 2 + 5, w - 16, 10, 5);
    c.add(g);
    c.add(uiIcon(this, -w / 2 + 34, 0, 'icon_star', 36));
    c.add(uiIcon(this, w / 2 - 34, 0, 'icon_star', 36));
    c.add(crispText(this, 0, -2, 'NEW BEST!', { preset: 'heading', size: 36 }));
    c.setAngle(-3);
    layer.add(c);
    if (!reducedMotion()) {
      c.setScale(2.4).setAlpha(0);
      this.tweens.add({
        targets: c, scale: 1, alpha: 1, duration: 360, delay: 300, ease: 'Back.Out',
        onStart: () => playSfx('achievement'),
        onComplete: () => this.tweens.add({ targets: c, angle: 2, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' }),
      });
    } else {
      playSfx('achievement');
    }
  }

  private pulse(b: UIButton): void {
    if (reducedMotion()) return;
    this.tweens.add({ targets: b.container, scale: 1.04, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: 1500 });
  }

  private doubleGems(res: FinishResult): void {
    const add = applyDoubleGems(services.save, res.gemsBanked, this.ctx.runId);
    if (add <= 0) {
      if (this.scene.isActive()) showToast(this, 'Gems already doubled', { kind: 'info' });
      return;
    }
    if (!this.scene.isActive()) return;
    coinShower(this);
    showToast(this, `+${add} gems!`, { kind: 'gold', icon: 'icon_gem' });
    const from = this.gemsShown;
    this.gemsShown = from + add;
    if (this.gemsText) tweenNumber(this, from, from + add, 900, 150, (v) => this.gemsText?.setText(formatNumber(v)));
  }

  // --- navigation ------------------------------------------------------------------------------

  private playAgain(): void {
    if (this.leaving || this.busy) return;
    this.leaving = true;
    emitOnGame(this, OverlayEvents.Restart);
    this.scene.stop();
  }

  private toMenu(): void {
    if (this.leaving || this.busy) return;
    this.leaving = true;
    this.scene.stop(SceneKeys.Game);
    this.scene.stop(SceneKeys.Hud);
    fadeToScene(this, SceneKeys.Menu);
  }
}
