import { AudioManager } from './audio/AudioManager';
import { createPlatform } from './platform/createPlatform';
import type { Platform } from './platform/Platform';
import { RewardService } from './rewards/RewardService';
import { SaveManager } from './save/SaveManager';

export interface Services {
  platform: Platform;
  save: SaveManager;
  rewards: RewardService;
  audio: AudioManager;
}

export let services: Services;

let starting: Promise<Services> | undefined;

/** Creates and wires everything once; later calls return the same services. */
export function initServices(): Promise<Services> {
  starting ??= create();
  return starting;
}

async function create(): Promise<Services> {
  const platform = createPlatform();
  await platform.init();

  const save = new SaveManager(platform);
  await save.load();

  const rewards = new RewardService(platform.createRewardProvider(), save);

  const audio = new AudioManager();
  const applyAudioSettings = (): void => audio.setSettings(save.data.settings.musicVolume, save.data.settings.sfxVolume);
  applyAudioSettings();
  audio.setHostEnabled(platform.isAudioEnabled());
  save.onChange(applyAudioSettings);

  platform.onAudioEnabledChange((enabled) => audio.setHostEnabled(enabled));
  platform.onPause(() => {
    void save.flush();
  });

  services = { platform, save, rewards, audio };
  return services;
}

/** Scenes subscribe to host pause/resume through these; call the returned function to unsubscribe. */
export function onHostPause(cb: () => void): () => void {
  return services.platform.onPause(cb);
}

export function onHostResume(cb: () => void): () => void {
  return services.platform.onResume(cb);
}
