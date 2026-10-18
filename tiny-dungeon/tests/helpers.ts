import type { Platform } from '../src/platform/Platform';
import { NullRewardProvider } from '../src/rewards/NullRewardProvider';
import type { RewardProvider } from '../src/rewards/types';

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
  onPause(): () => void { return () => {}; }
  onResume(): () => void { return () => {}; }
  isAudioEnabled(): boolean { return true; }
  onAudioEnabledChange(): () => void { return () => {}; }
  async getLanguage(): Promise<string> { return 'en'; }
  async sendScore(): Promise<void> {}
  logError(m: string): void { this.errors.push(m); }
  logWarning(m: string): void { this.warnings.push(m); }
  createRewardProvider(): RewardProvider { return new NullRewardProvider(); }
}
