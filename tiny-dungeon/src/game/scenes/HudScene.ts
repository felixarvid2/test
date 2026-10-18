import Phaser from 'phaser';
import { xpToNext } from '../../core/run';
import type { RoomType, RunState } from '../../core/types';
import { BUFF_BY_ID } from '../../data/buffs';
import { SYNERGY_BY_ID } from '../../data/synergies';
import { UPGRADE_BY_ID } from '../../data/upgrades';
import { services } from '../../services';
import { COLORS, ICONS_KEY } from '../assets';
import { H, W, drawBox, hex, label, textStyle } from '../ui/kit';
import type { GameScene } from './GameScene';
import { SCENES } from './keys';

const TYPE_LABEL: Record<RoomType, string> = { combat: '', elite: ' - ELITE', treasure: ' - TREASURE', shrine: ' - SHRINE', boss: ' - BOSS' };
const TYPE_COLOR: Record<RoomType, number> = { combat: COLORS.text, elite: COLORS.legendary, treasure: COLORS.gold, shrine: 0x9fffd0, boss: COLORS.danger };

export interface BossHud {
  name: string;
  title: string;
  hp: number;
  maxHp: number;
}

const HP = { x: 20, y: 14, w: 392, h: 42 };
const XP = { x: 112, y: 68, w: 300, h: 22 };

/** Heads-up display: a separate scene drawn above Game. Reads run state every frame. */
export class HudScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private lvText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private roomText!: Phaser.GameObjects.Text;
  private bossName!: Phaser.GameObjects.Text;
  private coin!: Phaser.GameObjects.Image;
  private heart!: Phaser.GameObjects.Image;
  private danger!: Phaser.GameObjects.Graphics;
  private icons: Phaser.GameObjects.GameObject[] = [];
  private iconSig = '';

  private hpShown = 0;
  private hpTrail = 0;
  private xpShown = 0;
  private lastHp = 0;
  private lastLevel = 1;
  private lastGold = 0;
  private flashRed = 0;
  private flashGreen = 0;
  private goldPop = 0;
  private lvPop = 0;
  private shake = 0;
  private t = 0;
  private lastSig = -1;
  private roomColor = -1;

  constructor() { super(SCENES.hud); }

  create(): void {
    const run = this.registry.get('run') as RunState | undefined;
    this.g = this.add.graphics().setDepth(1);
    this.danger = this.add.graphics().setDepth(0);
    this.heart = this.add.image(HP.x + 26, HP.y + HP.h / 2, ICONS_KEY, 'heart').setScale(2.6).setDepth(3);
    this.hpText = label(this, HP.x + HP.w / 2 + 14, HP.y + HP.h / 2 + 1, '', 30).setDepth(3);
    this.lvText = label(this, 20, XP.y + XP.h / 2, 'LV 1', 30, COLORS.xp).setOrigin(0, 0.5).setDepth(3);
    this.coin = this.add.image(452, 36, 'extra', 'coin_0').setScale(3.4).setDepth(3);
    this.goldText = label(this, 476, 36, '0', 36, COLORS.gold).setOrigin(0, 0.5).setDepth(3);
    this.roomText = label(this, 440, 80, 'ROOM 1', 30).setOrigin(0, 0.5).setDepth(3);
    this.bossName = label(this, W / 2, 112, '', 32, COLORS.danger).setDepth(3).setVisible(false);
    this.makePauseButton();

    if (run) {
      this.hpShown = this.hpTrail = this.lastHp = run.hp;
      this.lastLevel = run.level;
      this.lastGold = run.gold;
    }
  }

  private makePauseButton(): Phaser.GameObjects.Container {
    const c = this.add.container(W - 56, 52).setDepth(5);
    const g = this.add.graphics();
    drawBox(g, -36, -36, 72, 72, COLORS.panel, COLORS.panelLight);
    g.fillStyle(COLORS.text, 1).fillRect(-13, -16, 10, 32).fillRect(5, -16, 10, 32);
    c.add(g);
    // 88 x 88 touch target (the drawn button is a bit smaller)
    const zone = this.add.zone(0, 0, 92, 92).setInteractive({ useHandCursor: true });
    c.add(zone);
    let pressed = false;
    zone.on('pointerdown', () => { pressed = true; c.setScale(0.92); });
    zone.on('pointerout', () => { pressed = false; c.setScale(1); });
    zone.on('pointerup', () => {
      c.setScale(1);
      if (!pressed) return;
      pressed = false;
      services.audio.play('click');
      (this.scene.get(SCENES.game) as GameScene).pauseGame();
    });
    return c;
  }

  private bossHud(): BossHud | null {
    return (this.registry.get('boss') as BossHud | null | undefined) ?? null;
  }

  update(_time: number, deltaMs: number): void {
    // If the gameplay scene was left for a menu, take the HUD down with it.
    if (this.scene.isActive(SCENES.menu) || this.scene.isActive(SCENES.heroSelect) || this.scene.isActive(SCENES.shop) || this.scene.isActive(SCENES.achievements)) {
      this.scene.stop(SCENES.game);
      this.scene.stop();
      return;
    }
    const run = this.registry.get('run') as RunState | undefined;
    if (!run) return;
    const dt = Math.min(0.05, deltaMs / 1000);
    this.t += dt;
    const reduced = services.save.data.settings.reducedMotion;
    const max = Math.max(1, run.stats.maxHp);

    // hit / heal detection
    const delta = run.hp - this.lastHp;
    if (delta < -0.5) { this.flashRed = 0.3; if (!reduced) this.shake = 0.25; }
    else if (delta > max * 0.02) this.flashGreen = 0.35;
    this.lastHp = run.hp;
    this.flashRed = Math.max(0, this.flashRed - dt);
    this.flashGreen = Math.max(0, this.flashGreen - dt);
    this.shake = Math.max(0, this.shake - dt);
    this.hpShown += (run.hp - this.hpShown) * Math.min(1, dt * 14);
    if (Math.abs(run.hp - this.hpShown) < 0.05) this.hpShown = run.hp;
    if (this.hpTrail > this.hpShown) this.hpTrail = Math.max(this.hpShown, this.hpTrail - max * 0.35 * dt);
    else this.hpTrail = this.hpShown;
    const xpFrac = Math.min(1, run.xp / xpToNext(run.level));
    if (run.level !== this.lastLevel) { this.lastLevel = run.level; this.lvPop = 0.5; this.xpShown = 0; }
    this.xpShown += (xpFrac - this.xpShown) * Math.min(1, dt * 10);
    if (Math.abs(xpFrac - this.xpShown) < 0.002) this.xpShown = xpFrac;
    if (Math.floor(run.gold) > Math.floor(this.lastGold)) this.goldPop = 0.3;
    this.lastGold = run.gold;
    this.goldPop = Math.max(0, this.goldPop - dt);
    this.lvPop = Math.max(0, this.lvPop - dt);

    const boss = this.bossHud();
    const sig = this.hpShown * 3 + this.hpTrail * 7 + this.xpShown * 1013 + this.flashRed * 17 + this.flashGreen * 19 + this.shake * 23 + max * 29
      + (boss ? boss.hp * 31 + boss.maxHp : -1) + (this.hpShown / max < 0.3 ? ((this.t * 6) | 0) * 101 : 0);
    if (sig !== this.lastSig) {
      this.lastSig = sig;
      this.drawBars(max, reduced);
    }
    this.hpText.setText(`${Math.max(0, Math.ceil(run.hp))}/${Math.round(max)}`);
    this.lvText.setText(`LV ${run.level}`).setScale(1 + this.lvPop * 0.8);
    this.goldText.setText(`${Math.floor(run.gold)}`).setScale(1 + this.goldPop * 1.2);
    this.coin.setFrame(`coin_${((this.t * 10) | 0) & 3}`).setScale(3.4 + this.goldPop * 2);
    const type = (this.registry.get('roomType') as RoomType | undefined) ?? 'combat';
    this.roomText.setText(`ROOM ${run.room}${TYPE_LABEL[type]}`);
    if (this.roomColor !== TYPE_COLOR[type]) {
      this.roomColor = TYPE_COLOR[type];
      this.roomText.setColor(hex(TYPE_COLOR[type]));
    }
    this.heart.setScale(2.6 + (this.flashGreen > 0 ? 0.4 : 0) + (run.hp / max < 0.3 ? Math.sin(this.t * 10) * 0.25 : 0));

    this.syncIcons(run);
    this.drawDanger(run, max, reduced);
  }

  private drawBars(max: number, reduced: boolean): void {
    const g = this.g;
    g.clear();
    const sx = this.shake > 0 ? (Math.random() - 0.5) * 8 * (this.shake / 0.25) : 0;
    const x = HP.x + sx;
    // HP
    g.fillStyle(COLORS.outline, 1).fillRoundedRect(x - 4, HP.y - 4, HP.w + 8, HP.h + 8, 10);
    g.fillStyle(COLORS.hpBack, 1).fillRoundedRect(x, HP.y, HP.w, HP.h, 7);
    const trail = Math.min(1, this.hpTrail / max);
    const frac = Math.min(1, Math.max(0, this.hpShown / max));
    if (trail > frac) g.fillStyle(0xffe0e0, 0.85).fillRoundedRect(x, HP.y, HP.w * trail, HP.h, 7);
    let color: number = COLORS.hp;
    if (this.flashRed > 0 && !reduced) color = 0xff9aa0;
    else if (this.flashGreen > 0) color = 0x9bff7a;
    else if (frac < 0.3) color = ((this.t * 6) | 0) % 2 === 0 ? COLORS.hp : 0xff5a62;
    if (frac > 0) {
      g.fillStyle(color, 1).fillRoundedRect(x, HP.y, Math.max(10, HP.w * frac), HP.h, 7);
      g.fillStyle(0xffffff, 0.2).fillRoundedRect(x + 4, HP.y + 4, Math.max(6, HP.w * frac - 8), 9, 4);
    }
    // XP
    g.fillStyle(COLORS.outline, 1).fillRoundedRect(XP.x - 4, XP.y - 4, XP.w + 8, XP.h + 8, 8);
    g.fillStyle(0x1b2c3c, 1).fillRoundedRect(XP.x, XP.y, XP.w, XP.h, 5);
    if (this.xpShown > 0.01) {
      g.fillStyle(COLORS.xp, 1).fillRoundedRect(XP.x, XP.y, Math.max(8, XP.w * this.xpShown), XP.h, 5);
      g.fillStyle(0xffffff, 0.25).fillRoundedRect(XP.x + 3, XP.y + 3, Math.max(4, XP.w * this.xpShown - 6), 6, 3);
    }
    // boss
    const boss = this.bossHud();
    if (boss) {
      const bw = 560;
      const bx = (W - bw) / 2;
      const by = 134;
      const bf = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
      g.fillStyle(COLORS.outline, 1).fillRoundedRect(bx - 4, by - 4, bw + 8, 30, 10);
      g.fillStyle(0x3a0f18, 1).fillRoundedRect(bx, by, bw, 22, 6);
      if (bf > 0) {
        g.fillStyle(COLORS.danger, 1).fillRoundedRect(bx, by, Math.max(8, bw * bf), 22, 6);
        g.fillStyle(0xffffff, 0.25).fillRoundedRect(bx + 3, by + 3, Math.max(4, bw * bf - 6), 6, 3);
      }
      this.bossName.setVisible(true).setText(boss.name.toUpperCase());
    } else if (this.bossName.visible) {
      this.bossName.setVisible(false);
    }
  }

  /** Synergy icons (first required upgrade's icon) and buff icons with rooms left. */
  private syncIcons(run: RunState): void {
    let sig = run.synergies.join(',') + '|';
    for (const b of run.buffs) sig += `${b.id}:${b.roomsLeft},`;
    if (sig === this.iconSig) return;
    this.iconSig = sig;
    for (const o of this.icons) o.destroy();
    this.icons = [];
    let x = 24;
    const y = 112;
    for (const id of run.synergies.slice(0, 8)) {
      const syn = SYNERGY_BY_ID[id];
      const icon = syn ? UPGRADE_BY_ID[syn.requires[0]]?.icon : undefined;
      if (!icon) continue;
      const plate = this.add.graphics().setDepth(2);
      plate.fillStyle(COLORS.bg, 0.75).fillCircle(x + 18, y + 4, 21);
      plate.lineStyle(3, COLORS.legendary, 1).strokeCircle(x + 18, y + 4, 21);
      const img = this.add.image(x + 18, y + 4, ICONS_KEY, icon).setScale(2).setDepth(3);
      this.icons.push(plate, img);
      x += 46;
    }
    for (const b of run.buffs) {
      const def = BUFF_BY_ID[b.id];
      if (!def) continue;
      const plate = this.add.graphics().setDepth(2);
      plate.fillStyle(COLORS.bg, 0.75).fillRoundedRect(x, y - 18, 72, 44, 10);
      plate.lineStyle(3, COLORS.xp, 1).strokeRoundedRect(x, y - 18, 72, 44, 10);
      const img = this.add.image(x + 20, y + 4, ICONS_KEY, def.icon).setScale(2).setDepth(3);
      const txt = this.add.text(x + 40, y + 4, `${b.roomsLeft}`, textStyle(28, COLORS.xp)).setOrigin(0, 0.5).setDepth(3);
      this.icons.push(plate, img, txt);
      x += 80;
    }
  }

  private drawDanger(run: RunState, max: number, reduced: boolean): void {
    const g = this.danger;
    g.clear();
    const frac = run.hp / max;
    if (frac >= 0.3 || run.hp <= 0) return;
    const pulse = reduced ? 0.6 : 0.55 + 0.45 * Math.sin(this.t * 6);
    const a = (0.3 - frac) / 0.3 * 0.22 * pulse + 0.04;
    for (let i = 0; i < 4; i++) {
      g.fillStyle(0xff1030, a * (1 - i * 0.22));
      const s = 10 + i * 12;
      g.fillRect(0, 0, W, s).fillRect(0, H - s, W, s).fillRect(0, 0, s, H).fillRect(W - s, 0, s, H);
    }
  }
}
