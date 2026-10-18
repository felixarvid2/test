import Phaser from 'phaser';
import { COLORS, ICONS_KEY } from '../assets';
import { services } from '../../services';
import { evaluateAchievements, recordRun } from '../../core/achievements';
import { recordDaily } from '../../core/daily';
import { runGoldReward } from '../../core/meta';
import { todayKey } from '../../core/rng';
import { toSummary } from '../../core/run';
import type { AchievementDef, RunSummary } from '../../core/types';
import { HEROES } from '../../data/heroes';
import { SYNERGY_BY_ID } from '../../data/synergies';
import { UPGRADE_BY_ID } from '../../data/upgrades';
import { coinBurst, confetti, countTo, fmt, glow, heroSprite, reduced, sparks } from '../ui/fx';
import { Button, H, W, drawBox, panel, popIn, textStyle, titleStyle, toast, veil } from '../ui/kit';
import { claimReward, rewardButtonText } from '../ui/rewardPrompt';
import { chip } from '../ui/widgets';
import type { GameOverSceneData } from './contracts';
import { SCENES } from './keys';

const REVIVE_SECONDS = 8;

interface Banked {
  summary: RunSummary;
  gold: number;
  earned: AchievementDef[];
  newBest: boolean;
  best: number;
}

export class GameOverScene extends Phaser.Scene {
  private d!: GameOverSceneData;
  private stage: 'revive' | 'results' = 'results';
  private reviveLayer?: Phaser.GameObjects.Container;
  private ring?: Phaser.GameObjects.Graphics;
  private ringText?: Phaser.GameObjects.Text;
  private timeLeft = REVIVE_SECONDS;
  private claiming = false;
  private leaving = false;
  private doubled = false;
  private banked?: Banked;
  private flushed: Promise<void> = Promise.resolve();
  private goldTxt?: Phaser.GameObjects.Text;
  private goldShown = 0;

  constructor() { super(SCENES.gameOver); }

  init(data: GameOverSceneData): void {
    this.d = data;
    this.stage = 'results';
    this.timeLeft = REVIVE_SECONDS;
    this.claiming = false;
    this.leaving = false;
    this.doubled = false;
    this.banked = undefined;
    this.flushed = Promise.resolve();
    this.goldShown = 0;
  }

  create(): void {
    this.scene.bringToTop();
    const shade = veil(this, 0.9);
    if (!reduced()) {
      shade.setAlpha(0);
      this.tweens.add({ targets: shade, alpha: 0.9, duration: 260 });
    }
    const run = this.d.run;
    const reviveText = this.d.canRevive && !this.d.abandoned ? rewardButtonText('revive', { runId: run.runId }) : null;
    if (reviveText) {
      this.stage = 'revive';
      this.buildRevive(reviveText);
    } else {
      this.startResults();
    }
  }

  update(_time: number, delta: number): void {
    if (this.stage !== 'revive' || !this.ring) return;
    if (!this.claiming) this.timeLeft -= delta / 1000;
    this.drawRing();
    if (this.timeLeft <= 0) this.giveUp();
  }

  // ---- stage 1: revive offer ----------------------------------------------------------------------

  private buildRevive(offerText: string): void {
    const run = this.d.run;
    const layer = this.add.container(0, 0);
    this.reviveLayer = layer;
    const box = this.add.container(W / 2, H / 2);
    layer.add(box);
    box.add(panel(this, 0, 0, 620, 940, COLORS.panel, COLORS.danger));
    box.add(this.add.text(0, -392, 'You fell!', titleStyle(68, 0xff5566)).setOrigin(0.5));

    box.add(glow(this, 0, -215, 400, COLORS.danger, 0.3));
    box.add(this.add.ellipse(0, -146, 130, 26, 0x000000, 0.4));
    const hero = heroSprite(this, 0, -148, run.hero, 8);
    hero.setAngle(-14);
    box.add(hero);
    if (!reduced()) this.tweens.add({ targets: hero, angle: -8, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    const reviveTxt = this.add.text(0, -46, 'Revive with 50% HP', textStyle(38, COLORS.text, { align: 'left' })).setOrigin(0, 0.5);
    const total = 48 + 14 + reviveTxt.width;
    box.add(this.add.image(-total / 2 + 24, -46, ICONS_KEY, 'revive').setScale(3));
    reviveTxt.setX(-total / 2 + 62);
    box.add(reviveTxt);

    // Countdown ring with the seconds left in the middle.
    const ringC = this.add.container(0, 82);
    this.ring = this.add.graphics();
    this.ringText = this.add.text(0, -2, `${REVIVE_SECONDS}`, titleStyle(64, COLORS.text)).setOrigin(0.5);
    ringC.add([this.ring, this.ringText]);
    box.add(ringC);

    const claim = new Button(this, 0, 262, offerText, async () => {
      if (this.claiming || this.stage !== 'revive') return;
      this.claiming = true;
      claim.setEnabled(false);
      giveUp.setEnabled(false);
      const ok = await claimReward(this, 'revive', { runId: run.runId });
      this.claiming = false;
      if (ok) {
        if (this.scene.isActive()) {
          this.stage = 'results';
          this.scene.stop();
        }
        this.d.onRevive();
        return;
      }
      if (this.stage !== 'revive' || !this.scene.isActive()) return;
      giveUp.setEnabled(true);
      // The offer may be gone now (daily limit, token spent elsewhere): only keep it when still possible.
      const again = rewardButtonText('revive', { runId: run.runId });
      if (again) {
        claim.setText(again).setEnabled(true);
        this.timeLeft = Math.max(this.timeLeft, 3);
      } else {
        claim.setVisible(false);
      }
    }, { width: 500, height: 110, color: 0x2f9e4e, fontSize: 44, icon: { key: ICONS_KEY, frame: 'revive', scale: 3 } });
    const giveUp = new Button(this, 0, 380, 'Give up', () => { if (!this.claiming) this.giveUp(); }, { width: 340, height: 96, color: 0x5a4a62, fontSize: 36 });
    box.add([claim, giveUp]);
    popIn(this, box);
    this.drawRing();
  }

  private drawRing(): void {
    if (!this.ring || !this.ringText) return;
    const frac = Phaser.Math.Clamp(this.timeLeft / REVIVE_SECONDS, 0, 1);
    const color = frac > 0.5 ? COLORS.heal : frac > 0.25 ? COLORS.gold : COLORS.danger;
    this.ring.clear();
    this.ring.lineStyle(22, COLORS.outline, 1).strokeCircle(0, 0, 70);
    this.ring.lineStyle(14, 0x3a2b45, 1).strokeCircle(0, 0, 70);
    if (frac > 0) {
      this.ring.lineStyle(14, color, 1).beginPath().arc(0, 0, 70, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false).strokePath();
    }
    const secs = Math.max(0, Math.ceil(this.timeLeft));
    if (this.ringText.text !== `${secs}`) {
      this.ringText.setText(`${secs}`).setColor('#' + color.toString(16).padStart(6, '0'));
      if (!reduced()) this.tweens.add({ targets: this.ringText, scale: { from: 1.25, to: 1 }, duration: 220, ease: 'Back.Out' });
    }
  }

  private giveUp(): void {
    if (this.stage !== 'revive') return;
    this.stage = 'results';
    this.ring = undefined;
    const layer = this.reviveLayer;
    this.reviveLayer = undefined;
    if (layer) {
      this.tweens.add({ targets: layer, alpha: 0, duration: reduced() ? 1 : 200, onComplete: () => layer.destroy() });
    }
    this.time.delayedCall(reduced() ? 10 : 230, () => this.startResults());
  }

  // ---- stage 2: results ---------------------------------------------------------------------------

  /** Banks the run exactly once (guarded by save.lastRun.runId) and returns what to display. */
  private bank(): Banked {
    const save = services.save.data;
    const run = this.d.run;
    const summary = toSummary(run);
    const gold = runGoldReward(summary);
    if (save.lastRun?.runId === run.runId) {
      // Already banked (scene restarted): show the numbers, grant nothing again.
      return { summary, gold, earned: [], newBest: false, best: save.stats.bestRoom };
    }
    const prevBest = save.stats.bestRoom;
    recordRun(save, summary);
    if (run.mode === 'daily') recordDaily(save, todayKey(), summary.roomsCleared, summary.kills);
    save.gold += gold;
    const earned = evaluateAchievements(save, summary);
    save.lastRun = summary;
    try {
      services.platform.sendScore(summary.roomsCleared).catch(() => undefined);
    } catch {
      // leaderboards are optional
    }
    this.flushed = services.save.flush();
    const reached = summary.roomsCleared + 1;
    return { summary, gold, earned, newBest: reached > prevBest, best: save.stats.bestRoom };
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => this.time.delayedCall(reduced() ? Math.min(ms, 30) : ms, () => r()));
  }

  private startResults(): void {
    this.banked = this.bank();
    void this.playResults(this.banked);
  }

  private async playResults(b: Banked): Promise<void> {
    const run = this.d.run;
    const s = b.summary;
    const layer = this.add.container(0, 0);
    const abandoned = !!this.d.abandoned;
    const fast = reduced();

    if (!abandoned) services.audio.play('defeat');

    // Title.
    const title = this.add.text(W / 2, 92, abandoned ? 'RUN ENDED' : 'DEFEATED', titleStyle(76, abandoned ? COLORS.text : 0xff5566)).setOrigin(0.5);
    layer.add(title);
    if (!fast) {
      title.setScale(2.2).setAlpha(0);
      this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 380, ease: 'Back.Out' });
    }
    if (run.mode === 'daily') {
      const tag = chip(this, W / 2, 156, 'Daily Challenge', 0x7a4bb0, { icon: 'calendar', height: 46 });
      layer.add(tag);
    }

    // Hero + the big rooms number.
    const heroX = 160;
    const feet = 352;
    layer.add(glow(this, heroX, feet - 80, 330, b.newBest ? COLORS.gold : COLORS.danger, 0.28));
    layer.add(this.add.ellipse(heroX, feet + 2, 120, 24, 0x000000, 0.4));
    const hero = heroSprite(this, heroX, feet, s.hero, 8);
    layer.add(hero);
    layer.add(this.add.text(heroX, feet + 36, HEROES[s.hero].name, textStyle(34, COLORS.textDim)).setOrigin(0.5));
    if (!fast) {
      hero.setAlpha(0).setY(feet - 30);
      this.tweens.add({ targets: hero, alpha: 1, y: feet, duration: 420, delay: 120, ease: 'Bounce.Out' });
    }
    const bx = 482;
    layer.add(this.add.text(bx, 214, 'ROOMS CLEARED', textStyle(32, COLORS.textDim)).setOrigin(0.5));
    const rooms = this.add.text(bx, 288, '0', titleStyle(100, COLORS.gold)).setOrigin(0.5);
    layer.add(rooms);
    const bestLine = this.add.text(bx, 346, `Best: Room ${b.best}`, textStyle(36, COLORS.text)).setOrigin(0.5);
    layer.add(bestLine);

    await this.wait(380);
    countTo(this, 0, s.roomsCleared, 800, (v) => rooms.setText(`${v}`), { onTick: () => services.audio.play('xp'), tickEvery: 90 });

    // Stat rows.
    const panelY = 424;
    const rowsPanel = panel(this, W / 2, panelY + 102, 656, 204, COLORS.panel, COLORS.panelLight);
    layer.add(rowsPanel);
    const rowDefs: { icon: string; text: string; value: string; color: number; y: number }[] = [
      { icon: 'skull', text: 'Enemies defeated', value: fmt(s.kills), color: COLORS.text, y: panelY + 42 },
      { icon: 'xp', text: 'Level reached', value: `${s.level}`, color: COLORS.text, y: panelY + 102 },
      { icon: 'gold', text: 'Gold earned', value: '+0', color: COLORS.gold, y: panelY + 162 },
    ];
    const valueTexts: Phaser.GameObjects.Text[] = [];
    rowDefs.forEach((r, i) => {
      const icon = this.add.image(78, r.y, ICONS_KEY, r.icon).setScale(3);
      const lab = this.add.text(128, r.y, r.text, textStyle(34, COLORS.text, { align: 'left' })).setOrigin(0, 0.5);
      const val = this.add.text(W - 66, r.y, i === 2 ? '+0' : r.value, textStyle(44, r.color, { align: 'right' })).setOrigin(1, 0.5);
      layer.add([icon, lab, val]);
      valueTexts.push(val);
      if (!fast) {
        for (const o of [icon, lab, val]) o.setAlpha(0).setX(o.x + 60);
        this.tweens.add({ targets: [icon, lab, val], alpha: 1, x: '-=60', duration: 260, delay: i * 120, ease: 'Cubic.Out' });
      }
    });
    this.goldTxt = valueTexts[2];
    await this.wait(520);

    // Gold counts up with coin ticks.
    await new Promise<void>((resolve) => {
      countTo(this, 0, b.gold, 1100, (v) => { this.goldShown = v; this.goldTxt?.setText(`+${fmt(v)}`); }, {
        onTick: () => services.audio.play('coin'),
        tickEvery: 55,
        onDone: resolve,
      });
    });
    if (!fast && b.gold > 0) {
      this.tweens.add({ targets: this.goldTxt, scale: { from: 1.3, to: 1 }, duration: 260, ease: 'Back.Out' });
    }

    // Buttons (live only now, so a frantic last tap in the run cannot skip the screen).
    this.buildButtons(layer);

    // New best.
    if (b.newBest) {
      await this.wait(150);
      this.newBestBurst(layer, bx, 346, bestLine);
    }

    // Extras flow downwards from here.
    let y = panelY + 204 + 26;
    const dgText = this.d.run && b.gold > 0 && !this.doubled
      ? rewardButtonText('doubleGold', { runId: run.runId })
      : null;
    if (dgText) {
      const dg: Button = new Button(this, W / 2, y + 52, `Double gold (+${fmt(b.gold)})`, () => void this.onDouble(dg, b.gold), {
        width: 600, height: 104, color: 0x2f9e4e, fontSize: 40, subText: dgText, icon: { key: ICONS_KEY, frame: 'gold', scale: 3 },
      });
      layer.add(dg);
      popIn(this, dg);
      if (!fast) this.time.delayedCall(400, () => dg.active && this.tweens.add({ targets: dg, scale: 1.03, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' }));
      y += 104 + 22;
    }

    // Synergies achieved this run.
    if (s.synergies.length > 0) {
      const lab = this.add.text(52, y + 30, 'Synergies', textStyle(32, COLORS.textDim, { align: 'left' })).setOrigin(0, 0.5);
      layer.add(lab);
      const sx0 = 52 + lab.width + 44;
      const shown = s.synergies.slice(0, 7);
      shown.forEach((id, i) => {
        const syn = SYNERGY_BY_ID[id];
        const iconKey = UPGRADE_BY_ID[syn?.requires[0] ?? '']?.icon ?? 'star';
        const px = sx0 + i * 60;
        const plate = this.add.graphics();
        plate.fillStyle(COLORS.outline, 1).fillRoundedRect(px - 28, y + 30 - 28, 56, 56, 10);
        plate.fillStyle(0x4a2f6a, 1).fillRoundedRect(px - 25, y + 30 - 25, 50, 50, 8);
        const im = this.add.image(px, y + 30, ICONS_KEY, iconKey).setScale(2.4);
        layer.add([plate, im]);
        popIn(this, im, 80 * i);
      });
      if (s.synergies.length > shown.length) {
        layer.add(this.add.text(sx0 + shown.length * 60 - 18, y + 30, `+${s.synergies.length - shown.length}`, textStyle(32, COLORS.gold)).setOrigin(0, 0.5));
      }
      y += 70;
    }

    // Achievements unlocked by this run: each pops in with a trophy.
    const rowsMax = 2;
    for (let i = 0; i < Math.min(b.earned.length, rowsMax); i++) {
      const a = b.earned[i];
      await this.popAchievement(layer, a, y + 34 + i * 72);
    }
    if (b.earned.length > rowsMax) {
      layer.add(this.add.text(W / 2, y + 34 + rowsMax * 72 - 12, `+${b.earned.length - rowsMax} more trophies`, textStyle(30, COLORS.gold)).setOrigin(0.5));
    }
  }

  private buildButtons(layer: Phaser.GameObjects.Container): void {
    const again = new Button(this, W / 2, 1110, 'One More Run', () => void this.leave('run'), {
      width: 580, height: 124, color: 0x2f9e4e, fontSize: 56, title: false,
    });
    const menu = new Button(this, W / 2, 1222, 'Menu', () => void this.leave('menu'), { width: 340, height: 92, color: 0x5a4a62, fontSize: 38 });
    layer.add([again, menu]);
    if (!reduced()) {
      for (const [i, b] of [again, menu].entries()) {
        b.setAlpha(0).setY(b.y + 30);
        this.tweens.add({ targets: b, alpha: 1, y: b.y - 30, duration: 260, delay: i * 80, ease: 'Back.Out' });
      }
      this.tweens.add({ targets: again, scale: 1.03, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: 500 });
    }
  }

  private newBestBurst(layer: Phaser.GameObjects.Container, x: number, y: number, bestLine: Phaser.GameObjects.Text): void {
    bestLine.setColor('#f4b41b');
    const t = this.add.text(x, y + 46, 'NEW BEST!', titleStyle(40, COLORS.gold)).setOrigin(0.5).setAngle(-4);
    layer.add(t);
    services.audio.play('victory');
    sparks(this, x, y + 20, COLORS.gold, 30, 9000, 520);
    confetti(this, W / 2, 80, 600, [COLORS.gold, 0xffffff, COLORS.legendary, COLORS.epic], 50, 9000);
    if (!reduced()) {
      t.setScale(3).setAlpha(0);
      this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 420, ease: 'Back.Out' });
      this.tweens.add({ targets: t, angle: 4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: 450 });
      this.tweens.add({ targets: bestLine, scale: { from: 1.4, to: 1 }, duration: 380, ease: 'Back.Out' });
    }
  }

  private async popAchievement(layer: Phaser.GameObjects.Container, a: AchievementDef, y: number): Promise<void> {
    const row = this.add.container(W / 2, y);
    const g = this.add.graphics();
    drawBox(g, -328, -32, 656, 64, 0x2a2438, COLORS.gold);
    row.add(g);
    row.add(this.add.image(-290, 0, ICONS_KEY, 'trophy').setScale(2.4));
    row.add(this.add.text(-250, -2, a.name, textStyle(34, COLORS.gold, { align: 'left' })).setOrigin(0, 0.5));
    const parts: string[] = [];
    if (a.reward?.gold) parts.push(`+${fmt(a.reward.gold)}`);
    if (a.reward?.tokens) parts.push(`+${a.reward.tokens} token${a.reward.tokens > 1 ? 's' : ''}`);
    if (parts.length) row.add(this.add.text(306, -2, parts.join(' '), textStyle(30, COLORS.text, { align: 'right' })).setOrigin(1, 0.5));
    layer.add(row);
    services.audio.play('levelUp');
    toast(this, 'Achievement unlocked!', COLORS.gold, y - 50);
    sparks(this, W / 2 - 290, y, COLORS.gold, 12, 9000, 260);
    popIn(this, row);
    await this.wait(700);
  }

  // ---- double gold --------------------------------------------------------------------------------

  private async onDouble(btn: Button, gold: number): Promise<void> {
    if (this.doubled || this.claiming) return;
    this.claiming = true;
    btn.setEnabled(false);
    const ok = await claimReward(this, 'doubleGold', { runId: this.d.run.runId });
    this.claiming = false;
    if (!ok) {
      if (btn.active) {
        const again = rewardButtonText('doubleGold', { runId: this.d.run.runId });
        if (again) { btn.setEnabled(true); btn.setSubText(again); } else btn.destroy();
      }
      return;
    }
    // The claim is recorded: grant exactly once, even if the scene was left meanwhile.
    if (this.doubled) return;
    this.doubled = true;
    const save = services.save.data;
    save.gold += gold;
    this.flushed = services.save.flush();
    if (!this.scene.isActive()) return;
    if (btn.active) {
      const bx = btn.x;
      const by = btn.y;
      btn.destroy();
      coinBurst(this, bx, by, 20);
    }
    const from = this.goldShown;
    countTo(this, from, from + gold, 900, (v) => { this.goldShown = v; this.goldTxt?.setText(`+${fmt(v)}`); }, {
      onTick: () => services.audio.play('coin'),
      tickEvery: 55,
    });
    if (this.goldTxt) {
      this.goldTxt.setColor('#63c74d');
      this.time.delayedCall(1000, () => this.goldTxt?.setColor('#f4b41b'));
    }
  }

  // ---- leaving ------------------------------------------------------------------------------------

  private async leave(to: 'run' | 'menu'): Promise<void> {
    if (this.leaving || this.claiming) return;
    this.leaving = true;
    await this.flushed;
    const run = this.d.run;
    const go = (): void => {
      const sm = this.scene;
      for (const key of [SCENES.hud, SCENES.game, SCENES.pause, SCENES.upgrade]) {
        if (sm.isActive(key) || sm.isSleeping(key) || sm.isPaused(key)) sm.stop(key);
      }
      if (to === 'run') sm.start(SCENES.game, { hero: run.hero, mode: run.mode });
      else sm.start(SCENES.menu);
    };
    if (reduced()) {
      go();
      return;
    }
    const cam = this.cameras.main;
    cam.fadeOut(180, 20, 12, 28);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, go);
  }
}

