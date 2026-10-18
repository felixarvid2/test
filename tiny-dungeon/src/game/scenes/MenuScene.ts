import Phaser from 'phaser';
import { COLORS, EXTRA_KEY, ICONS_KEY } from '../assets';
import { services } from '../../services';
import { bankRun } from '../../core/bank';
import { canBuyMeta } from '../../core/meta';
import { dailyChallenge } from '../../core/daily';
import { todayKey } from '../../core/rng';
import { ACHIEVEMENTS } from '../../data/achievements';
import { HEROES, HERO_IDS } from '../../data/heroes';
import { META_UPGRADES } from '../../data/meta';
import { WEAPONS } from '../../data/weapons';
import { UPGRADE_BY_ID } from '../../data/upgrades';
import { createBackground } from '../ui/background';
import { addSheen, bob, fmt, glow, heroSprite, ensureTextures, reduced, sparks } from '../ui/fx';
import { Button, MIN_TOUCH, W, fadeInScene, goto, label, panel, textStyle, titleStyle, toast } from '../ui/kit';
import { installDebugHook } from '../ui/debug';
import { openModal } from '../ui/modal';
import { CounterPill } from '../ui/widgets';
import { SCENES } from './keys';

/** gameReady() is reported once per session, the first time the menu can be used. */
let gameReadySent = false;
/** A run interrupted by closing the app is recovered the first time the menu opens in a session. */
let recoveryChecked = false;

/** Banks save.pendingRun (a run that never reached Game Over). Returns the gold granted, or 0. */
function recoverPendingRun(): number {
  const save = services.save.data;
  const pending = save.pendingRun;
  if (!pending) return 0;
  const r = bankRun(save, pending, { dailyKey: todayKey() });
  save.pendingRun = null;
  void services.save.flush();
  if (!r.alreadyBanked) {
    try {
      services.platform.sendScore(pending.roomsCleared).catch(() => undefined);
    } catch {
      // leaderboards are optional
    }
  }
  return r.alreadyBanked ? 0 : r.gold;
}

export class MenuScene extends Phaser.Scene {
  constructor() { super(SCENES.menu); }

  create(): void {
    fadeInScene(this);
    ensureTextures(this);
    services.audio.playMusic('music_menu');
    createBackground(this, { walls: true, parade: true, dim: 0.58 });

    // Before the gold counter is built, so it shows the recovered gold.
    let recovered = 0;
    if (!recoveryChecked) {
      recoveryChecked = true;
      recovered = recoverPendingRun();
    }

    this.buildTopBar();
    this.buildLogo();
    this.buildHero();
    this.buildPlay();
    this.buildDaily();
    this.buildGrid();
    if (recovered > 0) toast(this, `Recovered ${fmt(recovered)} gold from your last run`, COLORS.gold, 420);

    installDebugHook(this);
    if (!gameReadySent) {
      gameReadySent = true;
      this.time.delayedCall(260, () => services.platform.gameReady());
    }
  }

  // ---- top bar ------------------------------------------------------------------------------------

  private buildTopBar(): void {
    const save = services.save.data;
    const y = 58;
    const gold = new CounterPill(this, 20, y, save.gold, { icon: 'gold', color: COLORS.gold });
    const best = new CounterPill(this, 20 + gold.boxWidth + 10, y, save.stats.bestRoom, {
      icon: 'crown', color: 0x8c6a2a, format: (n) => (n > 0 ? `Room ${n}` : '--'),
    });
    new CounterPill(this, best.x + best.boxWidth + 10, y, save.rewards.tokens, { icon: 'clover', color: 0x3d9e6c });
    // "?" explains Fortune Tokens.
    const qx = W - 20 - MIN_TOUCH / 2;
    const q = this.add.container(qx, y);
    const qg = this.add.graphics();
    qg.fillStyle(COLORS.outline, 1).fillCircle(0, 0, 30);
    qg.fillStyle(0x3d9e6c, 1).fillCircle(0, 0, 26);
    qg.fillStyle(0xffffff, 0.2).fillCircle(-6, -8, 10);
    q.add([qg, label(this, 0, -2, '?', 40)]);
    q.setSize(MIN_TOUCH, MIN_TOUCH).setInteractive({ useHandCursor: true });
    q.on('pointerup', () => {
      services.audio.play('click');
      this.showTokenInfo();
    });
  }

  private showTokenInfo(): void {
    const modal = openModal(this, {
      title: 'Fortune Tokens',
      icon: 'clover',
      body: 'Earn tokens from bosses, achievements and daily challenges.\n\nWhen no bonus ad is available, spend a token to unlock the same rewards: revive, double gold, extra upgrades and rerolls.',
      border: 0x3d9e6c,
      buttons: [{ text: 'Got it', color: 0x2f8f4e, onClick: () => modal.close() }],
    });
  }

  // ---- logo ---------------------------------------------------------------------------------------

  private buildLogo(): void {
    const logo = this.add.container(W / 2, 0);
    const tiny = this.add.text(0, 150, 'TINY', titleStyle(104)).setOrigin(0.5);
    const dungeon = this.add.text(0, 238, 'DUNGEON', titleStyle(84)).setOrigin(0.5);
    const tint = Phaser.Display.Color.ValueToColor(COLORS.gold).lighten(25).color;
    tiny.setTint(0xffffff, 0xffffff, tint, tint);
    dungeon.setTint(0xffffff, 0xffffff, tint, tint);
    const sub = this.add.container(0, 304);
    const ribbon = this.add.graphics();
    ribbon.fillStyle(COLORS.outline, 1).fillRoundedRect(-170, -26, 340, 52, 12);
    ribbon.fillStyle(0x7a2b3c, 1).fillRoundedRect(-166, -22, 332, 44, 9);
    ribbon.fillStyle(0xffffff, 0.12).fillRoundedRect(-160, -19, 320, 12, 6);
    sub.add([ribbon, label(this, 0, -2, 'One More Room', 34, 0xffe9c0)]);
    logo.add([glow(this, 0, 224, 640, COLORS.gold, 0.18), tiny, dungeon, sub]);
    logo.setScale(0.5).setAlpha(0);
    this.tweens.add({ targets: logo, scale: 1, alpha: 1, duration: reduced() ? 1 : 520, ease: 'Back.Out' });
    if (!reduced()) {
      this.tweens.add({ targets: logo, y: -6, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: 600 });
      // Shimmer: a bright wave runs over the letters.
      const wave = { t: 0 };
      this.tweens.add({
        targets: wave, t: 1, duration: 900, repeat: -1, repeatDelay: 2400, ease: 'Sine.InOut',
        onUpdate: () => {
          const k = Math.sin(wave.t * Math.PI);
          const bright = Phaser.Display.Color.Interpolate.ColorWithColor(
            Phaser.Display.Color.ValueToColor(tint), Phaser.Display.Color.ValueToColor(0xffffff), 100, Math.round(k * 100),
          );
          const c = Phaser.Display.Color.GetColor(bright.r, bright.g, bright.b);
          tiny.setTint(0xffffff, 0xffffff, c, c);
          dungeon.setTint(0xffffff, 0xffffff, c, c);
        },
      });
    }
  }

  // ---- selected hero ------------------------------------------------------------------------------

  private buildHero(): void {
    const save = services.save.data;
    const hero = HEROES[save.selectedHero];
    const stage = this.add.container(W / 2, 0);
    const baseY = 478;
    const aura = glow(this, 0, baseY - 60, 360, 0xffc36b, 0.3);
    const dais = this.add.graphics();
    dais.fillStyle(0x000000, 0.35).fillEllipse(0, baseY + 6, 220, 54);
    dais.fillStyle(0x45304f, 1).fillEllipse(0, baseY + 2, 200, 44);
    dais.fillStyle(0x5d4468, 1).fillEllipse(0, baseY - 2, 184, 36);
    dais.lineStyle(4, COLORS.outline, 1).strokeEllipse(0, baseY + 2, 200, 44);
    const shadow = this.add.image(0, baseY - 4, EXTRA_KEY, 'shadow').setScale(5, 3).setAlpha(0.6);
    const sprite = heroSprite(this, 0, baseY - 6, save.selectedHero, 6);
    const name = this.add.text(0, baseY + 60, hero.name.toUpperCase(), titleStyle(44, COLORS.text)).setOrigin(0.5);
    stage.add([aura, dais, shadow, sprite, name]);
    if (!reduced()) {
      this.tweens.add({ targets: aura, alpha: 0.18, scale: aura.scale * 0.92, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      this.tweens.add({ targets: sprite, scaleY: 6.25, scaleX: 5.85, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      this.tweens.add({ targets: shadow, scaleX: 4.6, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
    // Weapon glint floating beside the hero.
    const weapon = this.add.image(104, baseY - 96, ICONS_KEY, WEAPONS[hero.weapon].icon).setScale(3.5);
    stage.add(weapon);
    bob(this, weapon, 8, 1200, 200);

    // Tap the hero to change it.
    const hit = this.add.rectangle(0, baseY - 70, 260, 260, 0xffffff, 0).setInteractive({ useHandCursor: true });
    stage.add(hit);
    hit.on('pointerup', () => {
      services.audio.play('click');
      if (!reduced()) this.tweens.add({ targets: sprite, y: sprite.y - 28, duration: 110, yoyo: true, ease: 'Quad.Out' });
      sparks(this, stage.x, baseY - 60, COLORS.gold, 10, 50, 220);
      this.time.delayedCall(140, () => goto(this, SCENES.heroSelect));
    });

    // Last run / best room.
    const lr = save.lastRun;
    const best = save.stats.bestRoom;
    const text = lr
      ? `Best: Room ${best}    Last run: Room ${lr.roomsCleared + 1}`
      : 'Clear rooms. Pick upgrades. Go deeper!';
    this.add.text(W / 2, 592, text, textStyle(30, lr ? COLORS.gold : COLORS.textDim)).setOrigin(0.5);
  }

  // ---- play ---------------------------------------------------------------------------------------

  private buildPlay(): void {
    const save = services.save.data;
    const wrap = this.add.container(W / 2, 702);
    const btn = new Button(this, 0, 0, 'PLAY', () => {
      services.audio.play('door');
      goto(this, SCENES.game, { hero: save.selectedHero, mode: 'normal' });
    }, { width: 500, height: 140, color: 0x2f9e4e, fontSize: 68, title: true, sound: false });
    wrap.add(btn);
    addSheen(this, btn, -250, -70, 500, 140, { period: 3200, alpha: 0.45 });
    if (!reduced()) {
      this.tweens.add({ targets: wrap, scale: 1.04, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
  }

  // ---- daily challenge ----------------------------------------------------------------------------

  private buildDaily(): void {
    const save = services.save.data;
    const ch = dailyChallenge();
    const key = todayKey();
    const done = save.daily[key];
    const cx = W / 2;
    const cy = 884;
    const card = panel(this, cx, cy, 656, 200, COLORS.panel, COLORS.epic);
    card.setDepth(0);
    this.add.image(cx - 328 + 56, cy - 62, ICONS_KEY, 'calendar').setScale(3);
    const heroImg = heroSprite(this, cx - 328 + 56, cy + 56, ch.hero, 4, null);
    this.add.ellipse(heroImg.x, heroImg.y - 4, 60, 14, 0x000000, 0.3).setDepth(-1);
    heroImg.setDepth(1);
    const tx = cx - 328 + 118;
    this.add.text(tx, cy - 82, 'Daily Challenge', textStyle(36, COLORS.gold)).setOrigin(0, 0);
    this.add.text(tx, cy - 40, ch.modifierName, textStyle(28, COLORS.text, { align: 'left', wordWrap: { width: 350 } })).setOrigin(0, 0);
    const start = UPGRADE_BY_ID[ch.startUpgrade]?.name ?? ch.startUpgrade;
    this.add.text(tx, cy + 24, `${HEROES[ch.hero].name} starts with ${start}`, textStyle(28, COLORS.textDim, { align: 'left', wordWrap: { width: 350 } })).setOrigin(0, 0);
    this.add.text(tx, cy + 62, done ? `Best today: Room ${done.bestRoom}` : 'Not played today', textStyle(28, done ? COLORS.heal : COLORS.textDim, { align: 'left' })).setOrigin(0, 0);
    const go = new Button(this, cx + 328 - 98, cy + 4, 'GO', () => {
      services.audio.play('door');
      goto(this, SCENES.game, { hero: ch.hero, mode: 'daily' });
    }, { width: 150, height: 150, color: 0x7a4bb0, fontSize: 48, title: true, sound: false });
    if (!done && !reduced()) this.tweens.add({ targets: go, scale: 1.05, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  // ---- secondary buttons --------------------------------------------------------------------------

  private buildGrid(): void {
    const save = services.save.data;
    const unlocked = ACHIEVEMENTS.filter((a) => save.achievements[a.id] !== undefined).length;
    const affordable = META_UPGRADES.some((m) => canBuyMeta(save, m.id));
    const x1 = W / 2 - 166;
    const x2 = W / 2 + 166;
    const y1 = 1056;
    const y2 = 1164;
    const mk = (x: number, y: number, text: string, sub: string | undefined, iconKey: string, color: number, scene: string): Button => new Button(
      this, x, y, text, () => goto(this, scene), {
        width: 320, height: 96, color, fontSize: 36, subText: sub, icon: { key: ICONS_KEY, frame: iconKey, scale: 3 },
      },
    );
    mk(x1, y1, 'Heroes', `${save.heroes.length}/${HERO_IDS.length} unlocked`, 'hero', 0x3d6e70, SCENES.heroSelect);
    const shop = mk(x2, y1, 'Upgrades', affordable ? 'New upgrade ready!' : 'Spend your gold', 'chest', 0x8a5a2a, SCENES.shop);
    mk(x1, y2, 'Trophies', `${unlocked}/${ACHIEVEMENTS.length} unlocked`, 'trophy', 0x7a4bb0, SCENES.achievements);
    mk(x2, y2, 'Settings', undefined, 'knockback', 0x5a4a62, SCENES.settings);
    if (affordable) this.attachDot(shop, 134, -32);
  }

  /** Pulsing green "!" dot in the corner of a button. */
  private attachDot(btn: Button, x: number, y: number): void {
    const t = this.add.text(0, -2, '!', textStyle(30, COLORS.text, { strokeThickness: 4 })).setOrigin(0.5);
    const g = this.add.graphics();
    g.fillStyle(COLORS.outline, 1).fillCircle(0, 0, 25);
    g.fillStyle(COLORS.heal, 1).fillCircle(0, 0, 21);
    const c = this.add.container(x, y, [g, t]);
    btn.add(c);
    if (!reduced()) this.tweens.add({ targets: c, scale: 1.2, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }
}
