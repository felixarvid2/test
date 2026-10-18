import Phaser from 'phaser';
import { COLORS, EXTRA_KEY, ICONS_KEY, MUSIC, SFX, TILES_KEY } from '../assets';
import { services } from '../../services';
import { H, W, label, titleStyle } from '../ui/kit';
import { SCENES } from './keys';

export class PreloadScene extends Phaser.Scene {
  constructor() { super(SCENES.preload); }

  preload(): void {
    this.add.text(W / 2, H * 0.4, 'TINY DUNGEON', titleStyle(64)).setOrigin(0.5);
    label(this, W / 2, H * 0.4 + 70, 'One More Room', 40, COLORS.textDim);
    const barW = 420;
    this.add.rectangle(W / 2, H * 0.58, barW + 12, 36, COLORS.outline);
    const bar = this.add.rectangle(W / 2 - barW / 2, H * 0.58, 1, 24, COLORS.gold).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => bar.setSize(Math.max(1, barW * p), 24));
    services.platform.firstFrameReady();

    this.load.setPath('assets/');
    this.load.spritesheet(TILES_KEY, 'sprites/tiles.png', { frameWidth: 16, frameHeight: 16 });
    this.load.atlas(EXTRA_KEY, 'sprites/extra.png', 'sprites/extra.json');
    this.load.atlas(ICONS_KEY, 'sprites/icons.png', 'sprites/icons.json');
    // Audio is optional: a missing or undecodable file only means silence for that key.
    for (const key of SFX) this.load.audio(key, `audio/${key}.mp3`);
    for (const key of MUSIC) this.load.audio(key, `audio/${key}.mp3`);
    this.load.on('loaderror', (file: Phaser.Loader.File) => services.platform.logWarning(`asset failed: ${file.key}`));
  }

  create(): void {
    services.audio.attach(this.game);
    this.scene.start(SCENES.menu);
  }
}
