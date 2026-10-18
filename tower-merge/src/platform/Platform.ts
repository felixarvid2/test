import type { RewardProvider } from '../rewards/types';

/**
 * Everything the game needs from its host. The game only talks to this interface, so it runs the
 * same in a plain browser (BrowserPlatform) and inside YouTube Playables (YouTubePlatform).
 */
export interface Platform {
  readonly name: 'browser' | 'youtube';
  init(): Promise<void>;
  /** Call once the first frame (loading screen) is on screen. */
  firstFrameReady(): void;
  /** Call once the game is interactable (main menu shown), never while a loading screen is up. */
  gameReady(): void;
  /** Returns the saved string, or null when nothing has been saved yet. */
  loadData(): Promise<string | null>;
  saveData(data: string): Promise<void>;
  /** Host asked the game to pause (tab hidden, app backgrounded, Playables pause). Returns unsubscribe. */
  onPause(cb: () => void): () => void;
  onResume(cb: () => void): () => void;
  /** Host-level mute (YouTube mute button). Game volume sliders apply on top of this. */
  isAudioEnabled(): boolean;
  onAudioEnabledChange(cb: (enabled: boolean) => void): () => void;
  getLanguage(): Promise<string>;
  sendScore(value: number): Promise<void>;
  logError(message: string): void;
  logWarning(message: string): void;
  createRewardProvider(): RewardProvider;
}
