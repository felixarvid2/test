import { REWARD_CONFIG } from '../rewards/config';
import { NullRewardProvider } from '../rewards/NullRewardProvider';
import { YouTubeRewardProvider } from '../rewards/YouTubeRewardProvider';
import type { RewardProvider } from '../rewards/types';
import type { Platform } from './Platform';

/**
 * YouTube Playables host. Saves go only through ytgame.game.loadData/saveData (never localStorage),
 * and pause comes only from ytgame.system.onPause (the Page Visibility API is forbidden there).
 */
export class YouTubePlatform implements Platform {
  readonly name = 'youtube' as const;

  /** Resolves once loadData has completed (success or failure); saveData waits for it. */
  private loaded: Promise<void> | null = null;

  private get sdk(): Ytgame {
    const sdk = window.ytgame;
    if (!sdk) throw new Error('ytgame SDK is not available');
    return sdk;
  }

  async init(): Promise<void> {}

  firstFrameReady(): void {
    this.guard('firstFrameReady', () => this.sdk.game.firstFrameReady());
  }

  gameReady(): void {
    this.guard('gameReady', () => this.sdk.game.gameReady());
  }

  async loadData(): Promise<string | null> {
    const p = this.fetchData();
    this.loaded = p.then(() => undefined);
    return p;
  }

  async saveData(data: string): Promise<void> {
    // The SDK rejects a saveData that precedes the completion of loadData.
    this.loaded ??= this.fetchData().then(() => undefined);
    await this.loaded;
    try {
      await this.sdk.game.saveData(data);
    } catch (e) {
      this.logWarning(`saveData failed: ${describe(e)}`);
    }
  }

  onPause(cb: () => void): () => void {
    return this.subscribe('onPause', () => this.sdk.system.onPause(cb));
  }

  onResume(cb: () => void): () => void {
    return this.subscribe('onResume', () => this.sdk.system.onResume(cb));
  }

  isAudioEnabled(): boolean {
    try {
      return this.sdk.system.isAudioEnabled();
    } catch {
      return true;
    }
  }

  onAudioEnabledChange(cb: (enabled: boolean) => void): () => void {
    return this.subscribe('onAudioEnabledChange', () => this.sdk.system.onAudioEnabledChange(cb));
  }

  async getLanguage(): Promise<string> {
    try {
      return (await this.sdk.system.getLanguage()) || 'en';
    } catch (e) {
      this.logWarning(`getLanguage failed: ${describe(e)}`);
      return 'en';
    }
  }

  /** The SDK rejects anything but an integer <= Number.MAX_SAFE_INTEGER. */
  async sendScore(value: number): Promise<void> {
    if (!Number.isFinite(value)) return;
    try {
      await this.sdk.engagement.sendScore({ value: Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value))) });
    } catch (e) {
      this.logWarning(`sendScore failed: ${describe(e)}`);
    }
  }

  // The SDK's log calls take no parameters, so the message goes to the console.
  logError(message: string): void {
    console.error(message);
    this.guard('logError', () => this.sdk.health.logError(), false);
  }

  logWarning(message: string): void {
    console.warn(message);
    this.guard('logWarning', () => this.sdk.health.logWarning(), false);
  }

  createRewardProvider(): RewardProvider {
    return REWARD_CONFIG.youtubeAdsEnabled ? new YouTubeRewardProvider() : new NullRewardProvider();
  }

  private async fetchData(): Promise<string | null> {
    try {
      const raw = await this.sdk.game.loadData();
      return typeof raw === 'string' && raw.length > 0 ? raw : null;
    } catch (e) {
      this.logWarning(`loadData failed: ${describe(e)}`);
      return null;
    }
  }

  private subscribe(what: string, fn: () => () => void): () => void {
    try {
      return fn();
    } catch (e) {
      this.logWarning(`${what} failed: ${describe(e)}`);
      return () => {};
    }
  }

  private guard(what: string, fn: () => void, report = true): void {
    try {
      fn();
    } catch (e) {
      if (report) this.logWarning(`${what} failed: ${describe(e)}`);
    }
  }
}

function describe(e: unknown): string {
  const type = (e as { errorType?: unknown } | null)?.errorType;
  const msg = e instanceof Error ? e.message : String(e);
  return typeof type === 'string' ? `${type}: ${msg}` : msg;
}
