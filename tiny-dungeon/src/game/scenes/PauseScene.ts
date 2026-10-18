import Phaser from 'phaser';
import type { RunState } from '../../core/types';
import { services } from '../../services';
import { COLORS } from '../assets';
import { Button, H, W, label, panel, popIn, titleStyle, veil } from '../ui/kit';
import type { GameOverSceneData } from './contracts';
import { SCENES } from './keys';

/** Pause overlay on top of the frozen Game scene: Resume, Settings, Abandon (with confirmation). */
export class PauseScene extends Phaser.Scene {
  private main!: Phaser.GameObjects.Container;
  private confirm: Phaser.GameObjects.Container | null = null;

  constructor() { super(SCENES.pause); }

  create(): void {
    const run = this.registry.get('run') as RunState | undefined;
    veil(this, 0.72);
    this.main = this.add.container(0, 0);
    this.main.add(panel(this, W / 2, H / 2, 580, 700, COLORS.panel, COLORS.panelLight));
    const title = this.add.text(W / 2, H / 2 - 270, 'PAUSED', titleStyle(60)).setOrigin(0.5);
    this.main.add(title);
    if (run) {
      this.main.add(label(this, W / 2, H / 2 - 190, `Room ${run.room}   -   Level ${run.level}`, 36, COLORS.text));
      this.main.add(label(this, W / 2, H / 2 - 145, `${run.kills} kills   -   ${Math.floor(run.gold)} gold`, 32, COLORS.textDim));
    }
    this.main.add(new Button(this, W / 2, H / 2 - 50, 'Resume', () => this.resume(), { width: 440, color: 0x2f8f4e }));
    if (this.scene.get(SCENES.settings)) {
      this.main.add(new Button(this, W / 2, H / 2 + 70, 'Settings', () => this.openSettings(), { width: 440, color: 0x3d6e70 }));
    }
    this.main.add(new Button(this, W / 2, H / 2 + 190, 'Abandon run', () => this.askAbandon(), { width: 440, color: 0x8a3a46 }));
    popIn(this, title);

    // Esc / P resume. Never preventDefault on Esc.
    const kb = this.input.keyboard;
    if (kb) {
      kb.on('keydown-ESC', () => { if (!this.confirm) this.resume(); else this.closeConfirm(); });
      kb.on('keydown-P', () => { if (!this.confirm) this.resume(); });
    }
    this.events.on(Phaser.Scenes.Events.WAKE, () => services.audio.play('click', { volume: 0.4 }));
  }

  private resume(): void {
    this.scene.stop();
    this.scene.resume(SCENES.game);
  }

  private openSettings(): void {
    this.scene.launch(SCENES.settings, { overlay: true, returnTo: SCENES.pause });
    this.scene.sleep();
  }

  private askAbandon(): void {
    if (this.confirm) return;
    const c = this.add.container(0, 0).setDepth(50);
    const shade = this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg, 0.6).setInteractive();
    c.add(shade);
    c.add(panel(this, W / 2, H / 2, 560, 420, COLORS.panel, COLORS.danger));
    c.add(label(this, W / 2, H / 2 - 130, 'Abandon this run?', 46, COLORS.gold));
    c.add(label(this, W / 2, H / 2 - 60, 'Your progress this run will end.', 32, COLORS.textDim, { wordWrap: { width: 480 } }));
    c.add(new Button(this, W / 2, H / 2 + 30, 'Keep playing', () => this.closeConfirm(), { width: 440, color: 0x2f8f4e }));
    c.add(new Button(this, W / 2, H / 2 + 140, 'Yes, abandon', () => this.abandon(), { width: 440, color: 0x8a3a46 }));
    this.confirm = c;
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 120 });
  }

  private closeConfirm(): void {
    this.confirm?.destroy();
    this.confirm = null;
  }

  private abandon(): void {
    const run = this.registry.get('run') as RunState | undefined;
    if (!run) { this.resume(); return; }
    const data: GameOverSceneData = { run, canRevive: false, onRevive: () => undefined, abandoned: true };
    this.scene.stop();
    this.scene.launch(SCENES.gameOver, data);
  }
}
