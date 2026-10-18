import { REWARD_CONFIG } from './config';
import type { AdResult, RewardPlacement, RewardProvider } from './types';

/**
 * overlay   DOM overlay "Mock ad" with a countdown, then Complete (earned) / Skip (cancelled).
 * complete | cancel | fail   resolve by themselves after `delayMs`, no DOM (smoke tests, ?mockads=auto).
 * manual    stays pending until the test calls settle()/complete()/cancel()/fail().
 */
export type MockMode = 'overlay' | 'complete' | 'cancel' | 'fail' | 'manual';

export interface MockOptions {
  mode?: MockMode;
  /** Countdown of the overlay in seconds (default REWARD_CONFIG.mockAdSeconds). */
  seconds?: number;
  /** Delay of the scripted modes in ms. */
  delayMs?: number;
}

/**
 * Development rewarded ad. Everything it creates (DOM nodes, timers, listeners) is removed as
 * soon as the ad settles.
 */
export class MockRewardProvider implements RewardProvider {
  readonly id = 'mock';
  /** Number of ads requested so far (for tests). */
  shown = 0;
  /** The ad currently waiting for a result. */
  pending: { placement: RewardPlacement; nonce: string } | null = null;

  private readonly mode: MockMode;
  private readonly seconds: number;
  private readonly delayMs: number;
  private settleFn: ((r: AdResult) => void) | null = null;
  private cleanup: (() => void) | null = null;

  constructor(opts: MockOptions = {}) {
    this.mode = opts.mode ?? 'overlay';
    this.seconds = opts.seconds ?? REWARD_CONFIG.mockAdSeconds;
    this.delayMs = opts.delayMs ?? 400;
  }

  isAvailable(_placement?: RewardPlacement): boolean {
    return true;
  }

  showRewardedAd(placement: RewardPlacement, nonce: string): Promise<AdResult> {
    this.abort();
    this.shown += 1;
    if (this.mode === 'overlay' && typeof document === 'undefined') {
      return Promise.resolve<AdResult>({ status: 'failed', reason: 'no DOM' });
    }
    return new Promise<AdResult>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const settle = (r: AdResult): void => {
        if (this.settleFn !== settle) return; // already settled or replaced
        this.settleFn = null;
        this.pending = null;
        if (timer !== undefined) clearTimeout(timer);
        this.cleanup?.();
        this.cleanup = null;
        resolve(r);
      };
      this.settleFn = settle;
      this.pending = { placement, nonce };
      switch (this.mode) {
        case 'overlay':
          this.cleanup = this.openOverlay(placement, nonce, settle);
          break;
        case 'manual':
          break;
        case 'complete':
          timer = setTimeout(() => settle({ status: 'completed', nonce }), this.delayMs);
          break;
        case 'cancel':
          timer = setTimeout(() => settle({ status: 'cancelled' }), this.delayMs);
          break;
        case 'fail':
          timer = setTimeout(() => settle({ status: 'failed', reason: 'mock failure' }), this.delayMs);
          break;
      }
    });
  }

  /** Programmatic result for the pending ad. Returns false when none is pending. */
  settle(result: AdResult): boolean {
    if (!this.settleFn) return false;
    this.settleFn(result);
    return true;
  }

  complete(nonce?: string): boolean {
    const n = nonce ?? this.pending?.nonce;
    return n !== undefined && this.settle({ status: 'completed', nonce: n });
  }

  cancel(): boolean {
    return this.settle({ status: 'cancelled' });
  }

  fail(reason = 'mock failure'): boolean {
    return this.settle({ status: 'failed', reason });
  }

  /** Close the ad that is still showing (resolves it as cancelled). */
  abort(): void {
    this.cancel();
  }

  private openOverlay(placement: RewardPlacement, nonce: string, settle: (r: AdResult) => void): () => void {
    const root = document.createElement('div');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Mock ad');
    root.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;'
      + 'align-items:center;justify-content:center;gap:20px;background:rgba(8,10,20,.94);color:#f2f4ff;'
      + 'font:600 24px system-ui,sans-serif;text-align:center;touch-action:manipulation;padding:24px;';

    const title = document.createElement('div');
    title.textContent = 'Mock ad';
    title.style.fontSize = '40px';
    const sub = document.createElement('div');
    sub.textContent = `Placement: ${placement}`;
    sub.style.opacity = '0.6';
    const status = document.createElement('div');

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:16px;flex-wrap:wrap;justify-content:center;';
    const makeButton = (label: string, bg: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = `min-width:160px;min-height:64px;padding:12px 24px;font:inherit;color:#10131f;background:${bg};`
        + 'border:0;border-radius:12px;cursor:pointer;';
      return b;
    };
    const complete = makeButton('Complete', '#ffc94a');
    const skip = makeButton('Skip', '#c4cad6');
    row.append(skip, complete);
    root.append(title, sub, status, row);

    const started = Date.now();
    const total = Math.max(0, this.seconds) * 1000;
    const remaining = (): number => Math.max(0, total - (Date.now() - started));
    const render = (): void => {
      const left = remaining();
      complete.disabled = left > 0;
      complete.style.opacity = left > 0 ? '0.4' : '1';
      status.textContent = left > 0 ? `Reward in ${(left / 1000).toFixed(1)} s` : 'Ad finished';
    };
    render();
    const interval = setInterval(() => {
      render();
      if (remaining() === 0) clearInterval(interval);
    }, 100);

    // Keep taps from reaching the Phaser canvas underneath.
    const swallow = (e: Event): void => e.stopPropagation();
    const swallowed = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup'];
    for (const type of swallowed) root.addEventListener(type, swallow);

    const onComplete = (): void => {
      if (remaining() === 0) settle({ status: 'completed', nonce });
    };
    const onSkip = (): void => settle({ status: 'cancelled' });
    complete.addEventListener('click', onComplete);
    skip.addEventListener('click', onSkip);
    document.body.appendChild(root);

    return () => {
      clearInterval(interval);
      complete.removeEventListener('click', onComplete);
      skip.removeEventListener('click', onSkip);
      for (const type of swallowed) root.removeEventListener(type, swallow);
      root.remove();
    };
  }
}
