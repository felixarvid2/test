import type { Platform } from '../../src/platform/Platform';
import { NullRewardProvider } from '../../src/rewards/NullRewardProvider';
import type { RewardProvider } from '../../src/rewards/types';

/** In-memory Platform for tests; `stored` is the saved string, `writes` records every saveData call. */
export class FakePlatform implements Platform {
  readonly name = 'browser' as const;
  stored: string | null;
  writes: string[] = [];
  warnings: string[] = [];
  errors: string[] = [];
  inFlight = 0;
  maxInFlight = 0;
  saveDelayMs = 0;
  provider: RewardProvider = new NullRewardProvider();
  audioEnabled = true;
  private pauseCbs = new Set<() => void>();
  private resumeCbs = new Set<() => void>();
  private audioCbs = new Set<(e: boolean) => void>();

  constructor(stored: string | null = null) {
    this.stored = stored;
  }

  async init(): Promise<void> {}
  firstFrameReady(): void {}
  gameReady(): void {}
  async loadData(): Promise<string | null> {
    return this.stored;
  }
  async saveData(data: string): Promise<void> {
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    if (this.saveDelayMs > 0) await new Promise((r) => setTimeout(r, this.saveDelayMs));
    else await Promise.resolve();
    this.stored = data;
    this.writes.push(data);
    this.inFlight -= 1;
  }
  onPause(cb: () => void): () => void {
    this.pauseCbs.add(cb);
    return () => void this.pauseCbs.delete(cb);
  }
  onResume(cb: () => void): () => void {
    this.resumeCbs.add(cb);
    return () => void this.resumeCbs.delete(cb);
  }
  isAudioEnabled(): boolean { return this.audioEnabled; }
  onAudioEnabledChange(cb: (e: boolean) => void): () => void {
    this.audioCbs.add(cb);
    return () => void this.audioCbs.delete(cb);
  }
  async getLanguage(): Promise<string> { return 'en'; }
  async sendScore(): Promise<void> {}
  logError(m: string): void { this.errors.push(m); }
  logWarning(m: string): void { this.warnings.push(m); }
  createRewardProvider(): RewardProvider { return this.provider; }

  // --- test drivers ---
  pause(): void { for (const cb of [...this.pauseCbs]) cb(); }
  resume(): void { for (const cb of [...this.resumeCbs]) cb(); }
  setAudio(enabled: boolean): void {
    this.audioEnabled = enabled;
    for (const cb of [...this.audioCbs]) cb(enabled);
  }
}
