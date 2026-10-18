import Phaser from 'phaser';
import { services } from '../../services';
import { LOADOUT_SIZE, canBuyMeta, canUnlockTower, getLoadout } from '../../core/meta';
import { dailyKey } from '../../core/daily';
import { META_UPGRADES } from '../../data/meta';
import { TOWER_IDS, type TowerId } from '../../data/types';
import { iconKey, towerKey } from '../assetKeys';
import { countUnlocked, dailyButtonStatus, dailyStatus, loadoutSlots } from '../menus/logic';
import { burst } from '../menus/widgets';
import {
  DEPTH, H, PALETTE, TOWER_COLORS, W, createButton, createIconButton, createPill, crispText, fadeIn, fadeToScene, fitText,
  floatText, playSfx, reducedMotion, showToast, uiIcon,
} from '../ui';
import { SceneKeys } from './keys';

/** Guards services.platform.gameReady(): it must be called once per page load, not per menu visit. */
let announcedReady = false;

const ICON_ROW_Y = 1166;
const ICON_SPACING = 136;

interface MenuEntry {
  label: string;
  icon: string;
  scene: string;
  /** Small badge: text (e.g. "3/33") or '!' for something to spend gems on. */
  badge?: string;
}

/** Main menu: animated title, a looping merge animation, PLAY, DAILY and the icon row. */
export class MenuScene extends Phaser.Scene {
  constructor() { super(SceneKeys.Menu); }

  create(): void {
    fadeIn(this);
    const save = services.save.data;
    const firstTime = !save.tutorial.firstRunDone;

    if (this.textures.exists('bg_menu')) this.add.image(W / 2, H / 2, 'bg_menu').setDisplaySize(W, H).setDepth(DEPTH.background);
    else this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.add.rectangle(W / 2, H / 2, W, H, PALETTE.bg, 0.22).setDepth(DEPTH.background + 1);

    this.createEmbers();
    this.createTitle();
    this.createCounters();
    this.createAttract(W / 2, 622);
    if (!firstTime) this.createLoadoutChips(750);
    this.createPlay(firstTime);
    this.createDaily(firstTime);
    this.createIconRow(firstTime);

    try {
      services.audio.playMusic('music_menu');
      if (!announcedReady) {
        announcedReady = true;
        services.platform.gameReady();
      }
    } catch { /* services are optional for the menu shell */ }
  }

  // ---------- decoration ----------

  /** Slow rising sparks across the whole screen. */
  private createEmbers(): void {
    if (reducedMotion() || !this.textures.exists('fx_spark')) return;
    for (let i = 0; i < 16; i++) {
      const x = Phaser.Math.Between(20, W - 20);
      const s = this.add.image(x, H + 40, 'fx_spark').setDepth(DEPTH.background + 2).setBlendMode(Phaser.BlendModes.ADD)
        .setTint(i % 3 === 0 ? 0xffe58a : 0xfff4c9).setAlpha(0).setScale(0.3 + Math.random() * 0.5);
      this.tweens.add({
        targets: s, y: -40, x: x + Phaser.Math.Between(-60, 60), duration: Phaser.Math.Between(9000, 15000),
        delay: Phaser.Math.Between(0, 9000), repeat: -1, ease: 'Sine.InOut',
        onRepeat: () => s.setX(Phaser.Math.Between(20, W - 20)),
      });
      this.tweens.add({ targets: s, alpha: 0.75, duration: Phaser.Math.Between(900, 1800), yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 1500) });
    }
  }

  private createTitle(): void {
    const box = this.add.container(W / 2, 250).setDepth(DEPTH.hud);
    if (this.textures.exists('fx_glow')) {
      const glow = this.add.image(0, 20, 'fx_glow').setTint(0xffc94d).setAlpha(0.5).setDisplaySize(760, 380).setBlendMode(Phaser.BlendModes.ADD);
      box.add(glow);
      if (!reducedMotion()) this.tweens.add({ targets: glow, alpha: 0.28, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
    const main = fitText(crispText(this, 0, -34, 'TOWER MERGE', { preset: 'title', size: 88, strokeThickness: 16 }), W - 50);
    const mainScale = main.scaleX;
    // ribbon under the title
    const rib = this.add.graphics();
    rib.fillStyle(PALETTE.outline, 1).fillRoundedRect(-236, 54, 472, 84, 20);
    rib.fillStyle(0xb02a2a, 1).fillRoundedRect(-230, 60, 460, 72, 16);
    rib.fillStyle(0xff5a4f, 1).fillRoundedRect(-230, 60, 460, 42, 16);
    rib.fillStyle(0xffffff, 0.2).fillRoundedRect(-216, 65, 432, 10, 5);
    const sub = crispText(this, 0, 98, 'LAST STAND', { preset: 'heading', size: 50, letterSpacing: 4 } as never);
    box.add([rib, main, sub]);

    if (reducedMotion()) return;
    main.setScale(0);
    rib.setScale(0, 1).setAlpha(0);
    sub.setScale(0);
    this.tweens.add({ targets: main, scale: mainScale, duration: 650, delay: 150, ease: 'Back.Out' });
    this.tweens.add({ targets: rib, scaleX: 1, alpha: 1, duration: 380, delay: 520, ease: 'Back.Out' });
    this.tweens.add({ targets: sub, scale: 1, duration: 480, delay: 640, ease: 'Back.Out' });
    // gentle float once everything has landed
    this.time.delayedCall(1200, () => {
      this.tweens.add({ targets: box, y: box.y - 9, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      this.tweens.add({ targets: main, angle: { from: -1.2, to: 1.2 }, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    });
  }

  private createCounters(): void {
    const save = services.save.data;
    const gems = createPill(this, W - 24, 70, { icon: iconKey('gem'), value: save.gems, align: 'right', height: 68, color: PALETTE.info, minWidth: 170 });
    const pills = [gems.container];
    if (save.stats.bestWave > 0) {
      const best = createPill(this, 24, 70, { icon: iconKey('trophy'), text: `Wave ${save.stats.bestWave}`, align: 'left', height: 68 });
      pills.push(best.container);
    }
    if (!reducedMotion()) {
      pills.forEach((p, i) => {
        const y = p.y;
        p.setY(y - 120);
        this.tweens.add({ targets: p, y, duration: 420, delay: 300 + i * 90, ease: 'Back.Out' });
      });
    }
  }

  /** Looping merge animation: two towers hop together and become one a level higher. */
  private createAttract(cx: number, baseY: number): void {
    const pad = (x: number): void => {
      if (this.textures.exists('slot_empty')) this.add.image(x, baseY - 8, 'slot_empty').setDisplaySize(196, 196).setAlpha(0.95).setDepth(DEPTH.world);
      else this.add.ellipse(x, baseY - 4, 160, 56, 0x000000, 0.3).setDepth(DEPTH.world);
    };
    pad(cx - 150); pad(cx + 150);
    const shadow = this.add.ellipse(cx, baseY - 2, 190, 52, 0x000000, 0.28).setDepth(DEPTH.world).setAlpha(0);

    const unlocked = (services.save.data.unlockedTowers.length ? services.save.data.unlockedTowers : TOWER_IDS.slice(0, 3)) as TowerId[];
    let cycle = 0;
    const SIZE = 210;
    const make = (type: string, level: number, x: number): Phaser.GameObjects.Image | Phaser.GameObjects.Arc => {
      const img = uiIcon(this, x, baseY, towerKey(type, level), SIZE).setDepth(DEPTH.world + 2);
      if (img instanceof Phaser.GameObjects.Image) img.setOrigin(0.5, 0.875);
      return img;
    };
    const idle = (o: Phaser.GameObjects.Image | Phaser.GameObjects.Arc, delay: number): void => {
      if (reducedMotion()) return;
      this.tweens.add({ targets: o, scaleY: o.scaleY * 1.045, scaleX: o.scaleX * 0.975, duration: 900, delay, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    };

    const run = (): void => {
      const type = unlocked[cycle % unlocked.length];
      const level = 1 + (Math.floor(cycle / unlocked.length) % 3);
      cycle += 1;
      if (reducedMotion()) {
        const solo = make(type, level + 1, cx);
        this.time.delayedCall(2400, () => { solo.destroy(); run(); });
        return;
      }
      const a = make(type, level, cx - 150).setScale(0);
      const b = make(type, level, cx + 150).setScale(0);
      shadow.setAlpha(0);
      this.tweens.add({ targets: a, scale: 1, duration: 420, delay: 100, ease: 'Back.Out', onComplete: () => idle(a, 0) });
      this.tweens.add({ targets: b, scale: 1, duration: 420, delay: 240, ease: 'Back.Out', onComplete: () => idle(b, 300) });
      this.time.delayedCall(1700, () => {
        // hop together
        [a, b].forEach((o, i) => {
          this.tweens.killTweensOf(o);
          o.setScale(1);
          this.tweens.add({ targets: o, x: cx + (i === 0 ? -14 : 14), duration: 340, ease: 'Sine.In' });
          this.tweens.add({ targets: o, y: baseY - 90, duration: 170, yoyo: true, ease: 'Sine.Out' });
        });
        this.time.delayedCall(360, () => {
          a.destroy(); b.destroy();
          const m = make(type, level + 1, cx).setScale(0.4);
          shadow.setAlpha(1);
          burst(this, cx, baseY - 100, TOWER_COLORS[type] ?? PALETTE.gold, 16, DEPTH.world + 5);
          floatText(this, cx, baseY - 205, level >= 3 ? 'MAX!' : 'MERGE!', { color: PALETTE.goldLight, size: 46, depth: DEPTH.world + 6 });
          this.tweens.add({ targets: m, scale: 1, duration: 520, ease: 'Back.Out', onComplete: () => idle(m, 0) });
          this.time.delayedCall(2300, () => {
            this.tweens.killTweensOf(m);
            this.tweens.add({ targets: [m, shadow], alpha: 0, scale: m.scale * 0.6, duration: 260, ease: 'Sine.In', onComplete: () => { m.destroy(); run(); } });
          });
        });
      });
    };
    this.time.delayedCall(700, run);
  }

  // ---------- buttons ----------

  /** The run's tower loadout as small chips above PLAY; tapping them opens the collection. */
  private createLoadoutChips(y: number): void {
    const loadout = getLoadout(services.save.data);
    const size = 74, gap = 12;
    const row = this.add.container(W / 2, y).setDepth(DEPTH.hud);
    const label = crispText(this, 0, -size / 2 - 22, 'BATTLE LOADOUT', { preset: 'small', size: 20, colorNum: PALETTE.goldLight });
    const g = this.add.graphics();
    const slots = loadoutSlots(loadout, LOADOUT_SIZE);
    const total = slots.length * size + (slots.length - 1) * gap;
    row.add([g, label]);
    slots.forEach((id, i) => {
      const x = -total / 2 + size / 2 + i * (size + gap);
      if (id) {
        const color = TOWER_COLORS[id] ?? PALETTE.gold;
        g.fillStyle(PALETTE.shadow, 0.3).fillRoundedRect(x - size / 2, -size / 2 + 5, size, size, 18);
        g.fillStyle(PALETTE.outline, 1).fillRoundedRect(x - size / 2 - 3, -size / 2 - 3, size + 6, size + 6, 20);
        g.fillStyle(color, 1).fillRoundedRect(x - size / 2, -size / 2, size, size, 17);
        g.fillStyle(PALETTE.panelDark, 1).fillRoundedRect(x - size / 2 + 4, -size / 2 + 4, size - 8, size - 8, 14);
        g.fillStyle(color, 0.25).fillRoundedRect(x - size / 2 + 4, -size / 2 + 4, size - 8, size - 8, 14);
        row.add(uiIcon(this, x, -2, towerKey(id, 1), size - 10));
      } else {
        g.lineStyle(4, 0x6b76ad, 0.9).strokeRoundedRect(x - size / 2, -size / 2, size, size, 17);
        g.lineStyle(7, 0x6b76ad, 0.9).beginPath().moveTo(x - 13, 0).lineTo(x + 13, 0).moveTo(x, -13).lineTo(x, 13).strokePath();
      }
    });
    // one big hit area over the whole row (the chips are < 88 px wide each)
    const zone = this.add.zone(0, 0, total + 24, 104).setInteractive({ useHandCursor: true });
    row.add(zone);
    zone.on('pointerup', () => { playSfx('click'); fadeToScene(this, SceneKeys.Collection); });
    if (!reducedMotion()) {
      row.setAlpha(0);
      this.tweens.add({ targets: row, alpha: 1, duration: 400, delay: 700 });
    }
  }

  private createPlay(firstTime: boolean): void {
    // The kit button owns its own scale (press squash), so the pulse runs on a holder around it.
    const holder = this.add.container(W / 2, 874).setDepth(DEPTH.hud);
    const play = createButton(this, 0, 0, {
      label: 'PLAY', width: 500, height: 140, fontSize: 72, style: 'primary',
      onClick: () => {
        if (this.scene.manager.keys[SceneKeys.Game]) fadeToScene(this, SceneKeys.Game, {});
        else showToast(this, 'Game scene not available yet', { kind: 'danger' });
      },
    });
    if (this.textures.exists('fx_glow')) {
      const glow = this.add.image(0, 0, 'fx_glow').setTint(0xffc94d).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(720, 330).setAlpha(firstTime ? 0.55 : 0.3);
      holder.add(glow);
      if (!reducedMotion()) this.tweens.add({ targets: glow, alpha: firstTime ? 0.9 : 0.5, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
    holder.add(play.container);
    if (!reducedMotion()) {
      holder.setScale(0);
      this.tweens.add({
        targets: holder, scale: 1, duration: 520, delay: 450, ease: 'Back.Out',
        onComplete: () => this.tweens.add({ targets: holder, scale: firstTime ? 1.08 : 1.035, duration: firstTime ? 520 : 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' }),
      });
    }
    if (firstTime) {
      const hint = this.add.container(W / 2, 962).setDepth(DEPTH.hud);
      const arrow = this.add.graphics();
      arrow.fillStyle(PALETTE.outline, 1).fillTriangle(-30, 18, 30, 18, 0, -22);
      arrow.fillStyle(PALETTE.goldLight, 1).fillTriangle(-22, 12, 22, 12, 0, -14);
      const txt = crispText(this, 0, 52, 'Tap PLAY to start!', { preset: 'heading', size: 36, colorNum: PALETTE.goldLight });
      hint.add([arrow, txt]);
      fitText(txt, 560);
      if (!reducedMotion()) {
        hint.setAlpha(0);
        this.tweens.add({ targets: hint, alpha: 1, duration: 300, delay: 900 });
        this.tweens.add({ targets: hint, y: hint.y - 14, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: 900 });
      }
    }
  }

  private createDaily(firstTime: boolean): void {
    const status = dailyStatus(services.save.data.daily, dailyKey(new Date()));
    const holder = this.add.container(W / 2, firstTime ? 1082 : 1028).setDepth(DEPTH.hud);
    const btn = createButton(this, 0, 0, {
      label: 'DAILY CHALLENGE', icon: iconKey('clock'), width: 500, height: 104, fontSize: 34, style: 'secondary',
      onClick: () => fadeToScene(this, SceneKeys.Daily),
    });
    holder.add(btn.container);
    if (firstTime) { holder.setScale(0.7).setAlpha(0.75); return; }
    // status chip on the corner: green "New!" until today's challenge was played, then today's best wave
    const chip = this.add.container(0, 0);
    const g = this.add.graphics();
    const label = crispText(this, 0, 0, dailyButtonStatus(status), { preset: 'body', size: 24, colorNum: 0xffffff });
    const cw = Math.max(86, label.width + 34);
    const col = status.played ? PALETTE.info : PALETTE.success;
    g.fillStyle(PALETTE.outline, 1).fillRoundedRect(-cw / 2 - 3, -22, cw + 6, 44, 22);
    g.fillStyle(col, 1).fillRoundedRect(-cw / 2, -19, cw, 38, 19);
    g.fillStyle(0xffffff, 0.25).fillRoundedRect(-cw / 2 + 8, -16, cw - 16, 9, 4);
    chip.add([g, label]);
    chip.setPosition(250 - cw / 2 + 6, -58);
    holder.add(chip);
    if (!reducedMotion()) {
      holder.setScale(0);
      this.tweens.add({ targets: holder, scale: 1, duration: 480, delay: 560, ease: 'Back.Out' });
      if (!status.played) this.tweens.add({ targets: chip, scale: 1.12, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: 1100 });
    }
  }

  private createIconRow(firstTime: boolean): void {
    const save = services.save.data;
    const ach = countUnlocked(save.stats, save.achievements);
    const canBuyAny = META_UPGRADES.some((m) => canBuyMeta(save, m.id));
    const canUnlockAny = TOWER_IDS.some((id) => canUnlockTower(save, id));
    const entries: MenuEntry[] = [
      { label: 'Upgrades', icon: iconKey('castle'), scene: SceneKeys.Shop, badge: canBuyAny ? '!' : undefined },
      { label: 'Towers', icon: iconKey('arrow'), scene: SceneKeys.Collection, badge: canUnlockAny ? '!' : undefined },
      { label: 'Achievements', icon: iconKey('trophy'), scene: SceneKeys.Achievements, badge: `${ach.unlocked}/${ach.total}` },
      { label: 'Stats', icon: iconKey('target'), scene: SceneKeys.Stats },
      { label: 'Settings', icon: iconKey('repair'), scene: SceneKeys.Settings },
    ];
    entries.forEach((e, i) => {
      const x = W / 2 + (i - 2) * ICON_SPACING;
      const item = this.add.container(x, ICON_ROW_Y).setDepth(DEPTH.hud);
      const btn = createIconButton(this, 0, 0, { icon: e.icon, size: 108, style: 'secondary', onClick: () => fadeToScene(this, e.scene) });
      const label = crispText(this, 0, 82, e.label, { preset: 'small', size: 23, colorNum: 0xffffff });
      fitText(label, ICON_SPACING - 8);
      item.add([btn.container, label]);
      if (e.badge) item.add(this.badge(46, -48, e.badge));
      if (firstTime) item.setScale(0.86).setAlpha(0.72);
      if (!reducedMotion()) {
        const to = item.scale;
        item.setScale(0);
        this.tweens.add({ targets: item, scale: to, duration: 420, delay: 800 + i * 70, ease: 'Back.Out' });
      }
    });
  }

  /** Small corner badge: a red "!" dot or a gold "x/y" counter. */
  private badge(x: number, y: number, text: string): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    const alert = text === '!';
    const t = crispText(this, 0, 1, text, { preset: 'number', size: alert ? 30 : 20, colorNum: alert ? 0xffffff : PALETTE.textDark, strokeThickness: alert ? 5 : 0 });
    const w = alert ? 40 : Math.max(48, t.width + 18);
    const fill = alert ? PALETTE.danger : PALETTE.gold;
    g.fillStyle(PALETTE.outline, 1).fillRoundedRect(-w / 2 - 3, -20 - 3, w + 6, 46, 23);
    g.fillStyle(fill, 1).fillRoundedRect(-w / 2, -20, w, 40, 20);
    g.fillStyle(0xffffff, 0.3).fillRoundedRect(-w / 2 + 6, -16, w - 12, 9, 4);
    c.add([g, t]);
    if (alert && !reducedMotion()) this.tweens.add({ targets: c, scale: 1.18, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    return c;
  }
}

