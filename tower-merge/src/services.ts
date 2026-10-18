import { AudioManager } from './audio/AudioManager';
import { createPlatform } from './platform/createPlatform';
import type { Platform } from './platform/Platform';
import { RewardService } from './rewards/RewardService';
import { SaveManager } from './save/SaveManager';

/** The Phaser game registers these so a host pause or an ad can freeze and thaw the game loop. */
export interface GameLoopControls {
  pause(): void;
  resume(): void;
}

export interface Services {
  platform: Platform;
  save: SaveManager;
  rewards: RewardService;
  audio: AudioManager;
  /**
   * Register (or clear with null) the game loop controls. pause() runs when the first reason to
   * pause appears (host pause or a rewarded ad) and resume() when the last one is gone, so a
   * host resume during an ad does not restart the game early.
   */
  setGameLoopControls(controls: GameLoopControls | null): void;
}

export let services: Services;

let starting: Promise<Services> | undefined;

/** Creates and wires everything once; later calls return the same services. */
export function initServices(): Promise<Services> {
  starting ??= createServices(createPlatform()).then((s) => (services = s));
  return starting;
}

type HoldReason = 'host' | 'ad';

/** Wires services around a platform. initServices uses it; tests pass a fake platform. */
export async function createServices(platform: Platform): Promise<Services> {
  await platform.init();

  const save = new SaveManager(platform);
  await save.load();

  const rewards = new RewardService(platform.createRewardProvider(), save);

  const audio = new AudioManager();
  const applyAudioSettings = (): void => {
    const s = save.data.settings;
    audio.setSettings(s.musicVolume, s.sfxVolume);
    audio.setMuted(s.muted);
  };
  applyAudioSettings();
  audio.setHostEnabled(platform.isAudioEnabled());
  save.onChange(applyAudioSettings);
  platform.onAudioEnabledChange((enabled) => audio.setHostEnabled(enabled));

  // Pause plumbing: the game stays frozen while any reason holds it.
  let controls: GameLoopControls | null = null;
  const holds = new Set<HoldReason>();
  const call = (fn: () => void): void => {
    try {
      fn();
    } catch (e) {
      platform.logError(`game loop control threw: ${String(e)}`);
    }
  };
  const hold = (reason: HoldReason): void => {
    const first = holds.size === 0;
    holds.add(reason);
    if (!first) return;
    audio.pauseAll();
    call(() => controls?.pause());
  };
  const release = (reason: HoldReason): void => {
    if (!holds.delete(reason) || holds.size > 0) return;
    audio.resumeAll();
    call(() => controls?.resume());
  };

  platform.onPause(() => {
    rewards.setHostPaused(true);
    hold('host');
    void save.flush();
  });
  platform.onResume(() => {
    rewards.setHostPaused(false);
    release('host');
  });
  rewards.setHooks({ onAdStart: () => hold('ad'), onAdEnd: () => release('ad') });

  return {
    platform, save, rewards, audio,
    setGameLoopControls(c) {
      controls = c;
      if (c && holds.size > 0) call(() => c.pause());
    },
  };
}

/** Scenes subscribe to raw host pause/resume through these; call the returned function to unsubscribe. */
export function onHostPause(cb: () => void): () => void {
  return services.platform.onPause(cb);
}

export function onHostResume(cb: () => void): () => void {
  return services.platform.onResume(cb);
}
