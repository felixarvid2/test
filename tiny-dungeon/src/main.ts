import Phaser from 'phaser';
import { initServices } from './services';
import { COLORS } from './game/assets';
import { H, W } from './game/ui/kit';
import { BootScene } from './game/scenes/BootScene';
import { PreloadScene } from './game/scenes/PreloadScene';
import { GAME_SCENES } from './game/scenes';

async function start(): Promise<void> {
  const services = await initServices();
  const game = new Phaser.Game({
    type: Phaser.AUTO, // WebGL with Canvas fallback
    parent: 'game',
    width: W,
    height: H,
    backgroundColor: COLORS.bg,
    pixelArt: true,
    roundPixels: true,
    disableContextMenu: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 3 },
    fps: { target: 60, smoothStep: true },
    physics: { default: 'arcade', arcade: { debug: false } },
    audio: { disableWebAudio: false },
    scene: [BootScene, PreloadScene, ...GAME_SCENES],
  });

  // Host pause (YouTube onPause, or tab hidden in a browser) freezes the whole game loop and audio.
  services.platform.onPause(() => {
    game.loop.sleep();
    services.audio.pauseAll();
  });
  services.platform.onResume(() => {
    game.loop.wake();
    services.audio.resumeAll();
  });

  if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
}

start().catch((err) => {
  console.error(err);
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = 'Failed to start. Please reload.';
});
