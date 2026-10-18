import { MockRewardProvider, type MockMode } from '../rewards/MockRewardProvider';
import { NullRewardProvider } from '../rewards/NullRewardProvider';
import type { RewardProvider } from '../rewards/types';
import type { Platform } from './Platform';

export const SAVE_KEY = 'towermerge.save';

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

  /**
   * `?mockads=1` forces the mock overlay; `?mockads=auto|cancel|fail` forces a scripted outcome
   * (no overlay, for smoke tests); `?mockads=0` forces no ads. Without the parameter: the mock in
   * dev builds, no ads in production builds.
   */
  createRewardProvider(): RewardProvider {
    const param = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('mockads') : null;
    if (param === '0') return new NullRewardProvider();
    if (param !== null) {
      const scripted: Record<string, MockMode> = { auto: 'complete', complete: 'complete', cancel: 'cancel', fail: 'fail' };
      return new MockRewardProvider({ mode: scripted[param] ?? 'overlay', delayMs: 300 });
    }
    return import.meta.env.DEV ? new MockRewardProvider() : new NullRewardProvider();
  }

  // --- pause plumbing: one set of DOM listeners, attached only while someone subscribes ---

  private readonly onVisibility = (): void => this.setPaused(document.visibilityState === 'hidden');
  private readonly onPageHide = (): void => this.setPaused(true);

  private syncListeners(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const want = this.pauseCbs.size + this.resumeCbs.size > 0;
    if (want === this.listening) return;
    this.listening = want;
    const op = want ? 'addEventListener' : 'removeEventListener';
    document[op]('visibilitychange', this.onVisibility);
    window[op]('pagehide', this.onPageHide);
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
