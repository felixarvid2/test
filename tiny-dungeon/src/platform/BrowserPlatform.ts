import { MockRewardProvider, type MockOutcome } from '../rewards/MockRewardProvider';
import { NullRewardProvider } from '../rewards/NullRewardProvider';
import type { RewardProvider } from '../rewards/types';
import type { Platform } from './Platform';

export const SAVE_KEY = 'tinydungeon.save';

/** Plain-browser host: localStorage saves (in-memory when storage is unavailable), DOM pause events. */
export class BrowserPlatform implements Platform {
  readonly name = 'browser' as const;

  private memory: string | null = null;
  private pauseCbs = new Set<() => void>();
  private resumeCbs = new Set<() => void>();
  private paused = false;
  private listening = false;

  async init(): Promise<void> {}
  firstFrameReady(): void {}
  gameReady(): void {}

  async loadData(): Promise<string | null> {
    try {
      const v = window.localStorage.getItem(SAVE_KEY);
      if (v !== null) return v;
    } catch {
      // storage blocked or unavailable: fall through to the in-memory copy
    }
    return this.memory;
  }

  async saveData(data: string): Promise<void> {
    this.memory = data;
    try {
      window.localStorage.setItem(SAVE_KEY, data);
    } catch (e) {
      this.logWarning(`localStorage write failed, keeping save in memory: ${String(e)}`);
    }
  }

  onPause(cb: () => void): () => void {
    this.pauseCbs.add(cb);
    this.syncListeners();
    return () => {
      this.pauseCbs.delete(cb);
      this.syncListeners();
    };
  }

  onResume(cb: () => void): () => void {
    this.resumeCbs.add(cb);
    this.syncListeners();
    return () => {
      this.resumeCbs.delete(cb);
      this.syncListeners();
    };
  }

  isAudioEnabled(): boolean {
    return true;
  }

  onAudioEnabledChange(_cb: (enabled: boolean) => void): () => void {
    return () => {};
  }

  async getLanguage(): Promise<string> {
    return (typeof navigator !== 'undefined' && navigator.language) || 'en';
  }

  async sendScore(_value: number): Promise<void> {}

  logError(message: string): void {
    console.error(message);
  }

  logWarning(message: string): void {
    console.warn(message);
  }

  /** `?mockads=1` (or any value) forces the mock; `?mockads=fail|cancel` also forces that outcome. */
  createRewardProvider(): RewardProvider {
    const param = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('mockads') : null;
    if (param !== null && param !== '0') {
      const forced: MockOutcome | undefined = param === 'fail' || param === 'cancel' ? param : undefined;
      return new MockRewardProvider(forced);
    }
    return import.meta.env.DEV ? new MockRewardProvider() : new NullRewardProvider();
  }

  // --- pause plumbing: one set of DOM listeners, attached only while someone subscribes ---

  private readonly onVisibility = (): void => this.setPaused(document.visibilityState === 'hidden');
  private readonly onBlur = (): void => this.setPaused(true);
  private readonly onFocus = (): void => this.setPaused(document.visibilityState === 'hidden');

  private syncListeners(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const want = this.pauseCbs.size + this.resumeCbs.size > 0;
    if (want === this.listening) return;
    this.listening = want;
    const op = want ? 'addEventListener' : 'removeEventListener';
    document[op]('visibilitychange', this.onVisibility);
    window[op]('blur', this.onBlur);
    window[op]('focus', this.onFocus);
  }

  private setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    for (const cb of [...(paused ? this.pauseCbs : this.resumeCbs)]) {
      try {
        cb();
      } catch (e) {
        this.logError(`pause/resume handler threw: ${String(e)}`);
      }
    }
  }
}
