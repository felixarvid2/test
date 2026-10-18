import { REWARD_CONFIG } from './config';
import type { AdResult, RewardPlacement, RewardProvider } from './types';

export type MockOutcome = 'fail' | 'cancel';

/** How long a forced outcome takes to resolve (no overlay is shown). */
const FORCED_DELAY_MS = 400;

/**
 * Development rewarded ad: a DOM overlay with a countdown, then "Claim" (completed) and "Close"
 * (cancelled). `forced` skips the overlay and resolves with that outcome. Everything it creates
 * (DOM nodes, timers, listeners) is removed as soon as the ad settles.
 */
export class MockRewardProvider implements RewardProvider {
  readonly id = 'mock';
  private cleanup: (() => void) | null = null;

  constructor(private readonly forced?: MockOutcome, private readonly seconds = REWARD_CONFIG.mockAdSeconds) {}

  isAvailable(): boolean {
    return true;
  }

  showRewardedAd(placement: RewardPlacement, nonce: string): Promise<AdResult> {
    this.dismiss();
    if (this.forced) {
      const forced = this.forced;
      return new Promise<AdResult>((resolve) => {
        const t = setTimeout(() => {
          this.cleanup = null;
          resolve(forced === 'fail' ? { status: 'failed', reason: 'mock failure' } : { status: 'cancelled' });
        }, FORCED_DELAY_MS);
        this.cleanup = () => {
          clearTimeout(t);
          resolve({ status: 'cancelled' });
        };
      });
    }
    if (typeof document === 'undefined') {
      return Promise.resolve<AdResult>({ status: 'failed', reason: 'no DOM' });
    }
    return new Promise<AdResult>((resolve) => this.open(placement, nonce, resolve));
  }

  /** Close any ad that is still showing (resolves it as cancelled). */
  dismiss(): void {
    this.cleanup?.();
  }

  private open(placement: RewardPlacement, nonce: string, resolve: (r: AdResult) => void): void {
    const root = document.createElement('div');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Mock rewarded ad');
    root.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;'
      + 'align-items:center;justify-content:center;gap:20px;background:rgba(10,6,16,.92);color:#f4ecd8;'
      + 'font:28px Monogram,monospace;text-align:center;touch-action:manipulation;padding:24px;';

    const title = document.createElement('div');
    title.textContent = 'Mock rewarded ad';
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
      b.style.cssText = `min-width:160px;min-height:72px;padding:12px 24px;font:inherit;color:#140c1c;background:${bg};`
        + 'border:3px solid #0b0710;border-radius:8px;cursor:pointer;';
      return b;
    };
    const claim = makeButton('Claim', '#f4b41b');
    const close = makeButton('Close', '#c0c7d0');
    row.append(claim, close);
    root.append(title, sub, status, row);

    let remaining = Math.max(0, Math.ceil(this.seconds));
    const render = (): void => {
      claim.disabled = remaining > 0;
      claim.style.opacity = remaining > 0 ? '0.4' : '1';
      status.textContent = remaining > 0 ? `Reward in ${remaining}...` : 'Ad finished';
    };
    render();

    const interval = setInterval(() => {
      remaining = Math.max(0, remaining - 1);
      render();
      if (remaining === 0) clearInterval(interval);
    }, 1000);

    // Keep taps from reaching the Phaser canvas underneath.
    const swallow = (e: Event): void => e.stopPropagation();
    const swallowed = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup'];
    for (const type of swallowed) root.addEventListener(type, swallow);

    let settled = false;
    const finish = (result: AdResult): void => {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      claim.removeEventListener('click', onClaim);
      close.removeEventListener('click', onClose);
      for (const type of swallowed) root.removeEventListener(type, swallow);
      root.remove();
      if (this.cleanup === cleanup) this.cleanup = null;
      resolve(result);
    };
    const onClaim = (): void => {
      if (remaining === 0) finish({ status: 'completed', nonce });
    };
    const onClose = (): void => finish({ status: 'cancelled' });
    const cleanup = (): void => finish({ status: 'cancelled' });
    claim.addEventListener('click', onClaim);
    close.addEventListener('click', onClose);
    this.cleanup = cleanup;

    document.body.appendChild(root);
  }
}
