import Phaser from 'phaser';
import { UPGRADES } from '../../data/upgrades';
import type { UpgradeDef } from '../../data/types';
import { services } from '../../services';
import { percentLabel, sliderValue, upgradeIconKey, upgradeInventory } from '../overlays/logic';
import { addDim, closeOverlay } from '../overlays/overlayKit';
import {
  DEPTH, PALETTE, RARITY_COLORS, W, createButton, createPanel, crispText, formatNumber, openModal, playSfx, reducedMotion, uiIcon,
  type UIButton,
} from '../ui';
import type { PauseSceneData } from './contracts';
import { SceneKeys } from './keys';

const PANEL_Y = 640;
const PANEL_W = 664;
const PANEL_H = 1100;

const VIEW_TOP = 345;
const VIEW_H = 180;
const CELL = 90;
const COLS = 6;

/**
 * Pause menu on top of the (self-paused) GameScene: run stats, the upgrades taken, inline
 * settings, RESUME and QUIT RUN (with confirmation).
 */
export class PauseScene extends Phaser.Scene {
  private ctx!: PauseSceneData;
  private closing = false;
  private music = 0.7;
  private sfx = 0.8;
  private tooltip!: Phaser.GameObjects.Text;
  private listMinY = 0;
  private dragging: { startY: number; listY: number; moved: boolean } | null = null;

  constructor() {
    super(SceneKeys.Pause);
  }

  init(data: PauseSceneData): void {
    this.ctx = data;
    this.closing = false;
    this.dragging = null;
  }

  create(): void {
    addDim(this, 0.86);
    try {
      this.music = services.save.data.settings.musicVolume;
      this.sfx = services.save.data.settings.sfxVolume;
    } catch { /* keep defaults */ }

    const panel = createPanel(this, W / 2, PANEL_Y, PANEL_W, PANEL_H, { depth: DEPTH.panel });
    if (!reducedMotion()) {
      panel.setScale(0.92).setAlpha(0);
      this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 220, ease: 'Back.Out' });
    }
    const top = PANEL_Y - PANEL_H / 2;
    crispText(this, W / 2, top + 66, 'PAUSED', { preset: 'title', size: 60 }).setDepth(DEPTH.panel + 2);

    this.buildStats();
    this.buildUpgrades();
    this.buildSettings();

    createButton(this, W / 2, 1010, {
      label: 'RESUME', width: 520, height: 120, fontSize: 48, style: 'success', depth: DEPTH.panel + 3, onClick: () => this.resume(),
    });
    createButton(this, W / 2, 1128, {
      label: 'Quit run', width: 360, height: 92, fontSize: 30, style: 'danger', depth: DEPTH.panel + 3, onClick: () => this.askQuit(),
    });

    this.input.keyboard?.on('keydown-ESC', () => this.resume());
  }

  private resume(): void {
    if (this.closing) return;
    this.closing = true;
    closeOverlay(this);
  }

  // --- stats -----------------------------------------------------------------------------------

  private buildStats(): void {
    const s = this.ctx.world.stats;
    const tiles: Array<{ icon: string; value: number; label: string }> = [
      { icon: 'icon_castle', value: s.wave, label: 'Wave' },
      { icon: 'icon_skull', value: s.enemiesKilled, label: 'Kills' },
      { icon: 'icon_merge', value: s.towersMerged, label: 'Merges' },
    ];
    const w = 196, h = 96, gap = 12;
    tiles.forEach((t, i) => {
      const x = W / 2 + (i - 1) * (w + gap);
      const g = this.add.graphics().setDepth(DEPTH.panel + 1);
      g.fillStyle(PALETTE.outline, 1).fillRoundedRect(x - w / 2 - 3, 235 - h / 2 - 3, w + 6, h + 6, 22);
      g.fillStyle(PALETTE.panelDark, 1).fillRoundedRect(x - w / 2, 235 - h / 2, w, h, 19);
      g.fillStyle(0xffffff, 0.06).fillRoundedRect(x - w / 2 + 6, 235 - h / 2 + 6, w - 12, 26, 12);
      uiIcon(this, x - w / 2 + 38, 235 - 6, t.icon, 52).setDepth(DEPTH.panel + 2);
      crispText(this, x + 28, 235 - 14, formatNumber(t.value), { preset: 'number', size: 40 }).setDepth(DEPTH.panel + 2);
      crispText(this, x + 28, 235 + 26, t.label, { preset: 'small', size: 22 }).setDepth(DEPTH.panel + 2);
    });
  }

  // --- upgrades (scrollable grid) --------------------------------------------------------------

  private buildUpgrades(): void {
    const taken = this.ctx.world.stats.upgradesTaken;
    const inv = upgradeInventory(taken, (id) => UPGRADES.find((u) => u.id === id));
    crispText(this, W / 2, 322, `ACTIVE UPGRADES (${taken.length})`, { preset: 'small', size: 22 }).setDepth(DEPTH.panel + 2);

    this.tooltip = crispText(this, W / 2, 566, inv.length ? 'Tap an upgrade for details' : 'No upgrades yet - pick one after each wave.', {
      preset: 'small', size: 22, wordWrap: { width: PANEL_W - 70 },
    }).setDepth(DEPTH.panel + 2);
    if (!inv.length) return;

    const viewW = COLS * CELL;
    const left = W / 2 - viewW / 2;
    const bg = this.add.graphics().setDepth(DEPTH.panel + 1);
    bg.fillStyle(PALETTE.panelDark, 0.8).fillRoundedRect(left - 8, VIEW_TOP - 4, viewW + 16, VIEW_H + 8, 16);

    const list = this.add.container(0, 0).setDepth(DEPTH.panel + 2);
    inv.forEach(({ def, count }, i) => {
      const cx = left + (i % COLS) * CELL + CELL / 2;
      const cy = VIEW_TOP + Math.floor(i / COLS) * CELL + CELL / 2;
      this.addUpgradeCell(list, def, count, cx, cy);
    });
    const rows = Math.ceil(inv.length / COLS);
    const overflow = Math.max(0, rows * CELL - VIEW_H);
    this.listMinY = -overflow;

    const maskG = this.make.graphics({ x: 0, y: 0 }, false);
    maskG.fillStyle(0xffffff, 1).fillRect(left - 8, VIEW_TOP, viewW + 16, VIEW_H);
    list.setMask(maskG.createGeometryMask());

    if (overflow > 0) {
      const track = this.add.graphics().setDepth(DEPTH.panel + 3);
      const drawBar = (): void => {
        track.clear();
        const frac = VIEW_H / (rows * CELL);
        const barH = Math.max(30, VIEW_H * frac);
        const t = overflow > 0 ? -list.y / overflow : 0;
        track.fillStyle(0xffffff, 0.35).fillRoundedRect(left + viewW + 2, VIEW_TOP + t * (VIEW_H - barH), 6, barH, 3);
      };
      drawBar();
      this.events.on(Phaser.Scenes.Events.UPDATE, drawBar);
    }

    // Drag to scroll; a tap (no drag) on a cell shows its details.
    const hit = this.add.zone(W / 2, VIEW_TOP + VIEW_H / 2, viewW + 16, VIEW_H).setInteractive().setDepth(DEPTH.panel + 4);
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => { this.dragging = { startY: p.worldY, listY: list.y, moved: false }; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const d = this.dragging;
      if (!d || !p.isDown) return;
      const dy = p.worldY - d.startY;
      if (Math.abs(dy) > 10) d.moved = true;
      if (d.moved) list.y = Phaser.Math.Clamp(d.listY + dy, this.listMinY, 0);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const d = this.dragging;
      this.dragging = null;
      if (!d || d.moved) return;
      const col = Math.floor((p.worldX - left) / CELL);
      const row = Math.floor((p.worldY - list.y - VIEW_TOP) / CELL);
      const entry = inv[row * COLS + col];
      if (col >= 0 && col < COLS && p.worldY >= VIEW_TOP && p.worldY <= VIEW_TOP + VIEW_H && entry) this.showDetails(entry.def, entry.count);
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      list.y = Phaser.Math.Clamp(list.y - dy * 0.5, this.listMinY, 0);
    });
  }

  private addUpgradeCell(list: Phaser.GameObjects.Container, def: UpgradeDef, count: number, cx: number, cy: number): void {
    const color = RARITY_COLORS[def.rarity];
    const g = this.add.graphics();
    g.fillStyle(PALETTE.outline, 1).fillRoundedRect(cx - 38, cy - 38, 76, 76, 16);
    g.fillStyle(color, 1).fillRoundedRect(cx - 35, cy - 35, 70, 70, 14);
    g.fillStyle(PALETTE.panel, 1).fillRoundedRect(cx - 31, cy - 31, 62, 62, 11);
    list.add(g);
    list.add(uiIcon(this, cx, cy, upgradeIconKey(def), 50));
    if (count > 1) {
      const b = this.add.graphics();
      b.fillStyle(PALETTE.outline, 1).fillRoundedRect(cx + 4, cy + 10, 40, 30, 12);
      b.fillStyle(PALETTE.gold, 1).fillRoundedRect(cx + 6, cy + 12, 36, 26, 10);
      list.add(b);
      list.add(crispText(this, cx + 24, cy + 26, `x${count}`, { preset: 'small', size: 20, colorNum: PALETTE.textDark, strokeThickness: 0 }));
    }
  }

  private showDetails(def: UpgradeDef, count: number): void {
    playSfx('click');
    const stack = def.maxStacks > 1 ? ` (x${count}/${def.maxStacks})` : '';
    this.tooltip.setText(`${def.name}${stack}: ${def.description}`).setColor('#ffffff');
    if (this.tooltip.height > 70) this.tooltip.setScale(70 / this.tooltip.height); else this.tooltip.setScale(1);
  }

  // --- settings --------------------------------------------------------------------------------

  private buildSettings(): void {
    crispText(this, W / 2, 625, 'SETTINGS', { preset: 'small', size: 22 }).setDepth(DEPTH.panel + 2);
    this.addSlider('Music', 700, this.music, (v) => { this.music = v; this.applyAudio(); }, () => this.commitAudio(false));
    this.addSlider('Sound', 792, this.sfx, (v) => { this.sfx = v; this.applyAudio(); }, () => this.commitAudio(true));

    let shake = true, numbers = true;
    try {
      shake = services.save.data.settings.screenShake;
      numbers = services.save.data.settings.damageNumbers;
    } catch { /* defaults */ }
    this.addToggle(W / 2 - 160, 892, 'Shake', shake, (v) => { void services.save.update((d) => { d.settings.screenShake = v; }); });
    this.addToggle(W / 2 + 160, 892, 'Dmg numbers', numbers, (v) => { void services.save.update((d) => { d.settings.damageNumbers = v; }); });
  }

  private applyAudio(): void {
    try { services.audio.setSettings(this.music, this.sfx); } catch { /* audio optional */ }
  }

  private commitAudio(blip: boolean): void {
    void services.save.update((d) => { d.settings.musicVolume = this.music; d.settings.sfxVolume = this.sfx; });
    this.applyAudio();
    if (blip) playSfx('coin');
  }

  private addSlider(label: string, y: number, initial: number, onChange: (v: number) => void, onCommit: () => void): void {
    const trackX = 250, trackW = 320, depth = DEPTH.panel + 3;
    crispText(this, 70, y, label, { preset: 'body', size: 30 }).setOrigin(0, 0.5).setDepth(depth);
    const g = this.add.graphics().setDepth(depth);
    const pct = crispText(this, 640, y, percentLabel(initial), { preset: 'small', size: 24, colorNum: 0xffffff }).setOrigin(1, 0.5).setDepth(depth);
    let value = initial;
    const draw = (): void => {
      g.clear();
      g.fillStyle(PALETTE.outline, 1).fillRoundedRect(trackX - 4, y - 16, trackW + 8, 32, 16);
      g.fillStyle(PALETTE.panelDark, 1).fillRoundedRect(trackX, y - 12, trackW, 24, 12);
      if (value > 0) g.fillStyle(PALETTE.gold, 1).fillRoundedRect(trackX, y - 12, Math.max(24, trackW * value), 24, 12);
      const kx = trackX + trackW * value;
      g.fillStyle(PALETTE.outline, 1).fillCircle(kx, y, 30);
      g.fillStyle(PALETTE.goldLight, 1).fillCircle(kx, y, 25);
      g.fillStyle(PALETTE.goldDark, 1).fillCircle(kx, y + 3, 14);
      g.fillStyle(PALETTE.gold, 1).fillCircle(kx, y, 13);
      pct.setText(percentLabel(value));
    };
    draw();
    const zone = this.add.zone(trackX + trackW / 2, y, trackW + 80, 88).setInteractive({ useHandCursor: true }).setDepth(depth);
    let drag = false;
    const set = (p: Phaser.Input.Pointer): void => {
      const v = sliderValue(p.worldX, trackX, trackW);
      if (v !== value) { value = v; draw(); onChange(v); }
    };
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => { drag = true; set(p); });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (drag && p.isDown) set(p); });
    this.input.on('pointerup', () => { if (drag) { drag = false; onCommit(); } });
  }

  private addToggle(x: number, y: number, label: string, initial: boolean, onChange: (v: boolean) => void): UIButton {
    let on = initial;
    const text = (): string => `${label}: ${on ? 'ON' : 'OFF'}`;
    const b = createButton(this, x, y, {
      label: text(), width: 308, height: 92, fontSize: 28, style: on ? 'success' : 'ghost', depth: DEPTH.panel + 3,
      onClick: () => {
        on = !on;
        b.setLabel(text()).setStyle(on ? 'success' : 'ghost');
        onChange(on);
      },
    });
    return b;
  }

  // --- quit ------------------------------------------------------------------------------------

  private askQuit(): void {
    if (this.closing) return;
    openModal(this, {
      title: 'Quit this run?',
      body: 'The run ends here and you go to the results screen.',
      buttons: [
        { label: 'Keep playing', style: 'success' },
        { label: 'Quit', style: 'danger', onClick: () => this.quit() },
      ],
    });
  }

  private quit(): void {
    if (this.closing) return;
    this.closing = true;
    this.ctx.world.forfeit();
    this.scene.launch(SceneKeys.GameOver, this.ctx);
    this.scene.stop();
  }
}
