import Phaser from 'phaser';
import { SCENES } from './keys';

/** Waits for the bundled pixel fonts so the first text drawn is already in the right font. */
export class BootScene extends Phaser.Scene {
  constructor() { super(SCENES.boot); }

  create(): void {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    const ready = fonts
      ? Promise.all([fonts.load('32px Monogram'), fonts.load('32px KenneyFuture')]).catch(() => undefined)
      : Promise.resolve();
    // Never block start-up on fonts for more than a moment.
    Promise.race([ready, new Promise((r) => setTimeout(r, 1500))]).then(() => {
      document.getElementById('boot')?.remove();
      this.scene.start(SCENES.preload);
    });
  }
}
