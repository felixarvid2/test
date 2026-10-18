import Phaser from 'phaser';
import { services } from '../../services';
import { createButton } from '../ui/button';
import { fadeIn, fadeToScene } from '../ui/fx';
import { showToast } from '../ui/toast';
import { crispText, fitText } from '../ui/text';
import { H, W } from '../ui/theme';
import { SceneKeys } from './keys';

let announcedReady = false;

/** Temporary main menu (a later agent replaces it). Play starts SceneKeys.Game when registered. */
export class MenuScene extends Phaser.Scene {
  constructor() { super(SceneKeys.Menu); }

  create(): void {
    fadeIn(this);
    if (this.textures.exists('bg_menu')) this.add.image(W / 2, H / 2, 'bg_menu').setDisplaySize(W, H);
    else this.cameras.main.setBackgroundColor(0x0f1430);

    fitText(crispText(this, W / 2, H * 0.24, 'TOWER MERGE', { preset: 'title', size: 76 }), W - 60);
    crispText(this, W / 2, H * 0.24 + 100, 'Last Stand', { preset: 'heading', size: 56 });

    createButton(this, W / 2, H * 0.62, {
      label: 'PLAY', width: 420, height: 128, fontSize: 56, style: 'primary',
      onClick: () => {
        if (this.scene.manager.keys[SceneKeys.Game]) fadeToScene(this, SceneKeys.Game);
        else showToast(this, 'Game scene not available yet', { kind: 'danger' });
      },
    });

    try {
      services.audio.playMusic('music_menu');
      if (!announcedReady) {
        announcedReady = true;
        services.platform.gameReady();
      }
    } catch { /* services are optional for the menu shell */ }
  }
}
