import { pruneClaimed, type SaveManager } from '../save/SaveManager';
import { REWARD_CONFIG } from './config';
import type {
  AdResult, ClaimContext, ClaimResult, RewardGate, RewardPlacement, RewardProvider, RewardQuote,
} from './types';

export type { ClaimContext } from './types';

export interface RewardHooks {
  /** An ad is about to be requested: pause the game loop and audio. */
  onAdStart?(placement: RewardPlacement): void;
  /** The ad settled (any outcome, incl. timeout): resume. Always called once per onAdStart. */
  onAdEnd?(placement: RewardPlacement): void;
}

const GLOBAL = 'all';

const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

function makeNonce(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join('');
}

/**
 * Hands out rewards for ads or gems. Rules:
 *  - nothing is granted before the provider confirmed completion (echoing our nonce);
 *  - a claim is granted only after it has been written to the flushed save, so a crash or restart
 *    can never grant the same claim twice (once-per-scope keys live in save.rewards.claimed);
 *  - one claim at a time (`busy`), so double taps and parallel placements cannot overlap;
 *  - ad claims are capped per placement and globally per UTC day; past a cap, or without ads, the
 *    player may pay gems instead. Neither is ever required to progress: gate() just says 'none'.
 */
export class RewardService {
  private busy = false;
  private hooks: RewardHooks = {};
  private hostPaused = false;
  /** Suspends/resumes the running ad's timeout while the host is paused. */
  private timerCtl: { pause(): void; resume(): void } | null = null;

  constructor(
    private readonly provider: RewardProvider,
    private readonly save: SaveManager,
    private readonly now: () => number = Date.now,
  ) {}

  setHooks(hooks: RewardHooks): void {
    this.hooks = hooks;
  }

  /**
   * Tell the service the host (YouTube) paused or resumed the game. While paused the ad timeout
   * does not run: the claim then resolves only on the provider's real result.
   */
  setHostPaused(paused: boolean): void {
    if (paused === this.hostPaused) return;
    this.hostPaused = paused;
    if (paused) this.timerCtl?.pause();
    else this.timerCtl?.resume();
  }

  /** True while an ad (or any claim) is in progress. */
  get isBusy(): boolean {
    return this.busy;
  }

  get gems(): number {
    return this.save.data.gems;
  }

  gemCost(placement: RewardPlacement): number | null {
    return REWARD_CONFIG.placements[placement].gemCost;
  }

  /** Null when the context is not usable (empty run id, or a scoped placement without `key`). */
  claimKey(placement: RewardPlacement, ctx: ClaimContext): string | null {
    if (typeof ctx?.runId !== 'string' || ctx.runId === '') return null;
    if (REWARD_CONFIG.placements[placement].scope === 'run') return `${ctx.runId}:${placement}`;
    if (typeof ctx.key !== 'string' || ctx.key === '') return null;
    return `${ctx.runId}:${placement}:${ctx.key}`;
  }

  isClaimed(placement: RewardPlacement, ctx: ClaimContext): boolean {
    const key = this.claimKey(placement, ctx);
    return key !== null && key in this.save.data.rewards.claimed;
  }

  /** Everything a button needs to render. */
  quote(placement: RewardPlacement, ctx: ClaimContext): RewardQuote {
    const key = this.claimKey(placement, ctx);
    const claimed = key !== null && key in this.save.data.rewards.claimed;
    const gemCost = this.gemCost(placement);
    const adAvailable = this.adPossible(placement);
    const canAffordGems = gemCost !== null && this.save.data.gems >= gemCost;
    let gate: RewardGate = 'none';
    if (key !== null && !claimed && !this.busy) {
      if (adAvailable) gate = 'ad';
      else if (canAffordGems) gate = 'gems';
    }
    return { gate, gemCost, claimed, adAvailable, canAffordGems };
  }

  gate(placement: RewardPlacement, ctx: ClaimContext): RewardGate {
    return this.quote(placement, ctx).gate;
  }

  async claim(placement: RewardPlacement, ctx: ClaimContext): Promise<ClaimResult> {
    const key = this.claimKey(placement, ctx);
    if (key === null) return { ok: false, reason: 'invalid' };
    if (key in this.save.data.rewards.claimed) return { ok: false, reason: 'alreadyClaimed' };
    // Everything up to `busy = true` is synchronous, so concurrent calls cannot both pass.
    if (this.busy) return { ok: false, reason: 'busy' };

    const q = this.quote(placement, ctx);
    if (q.gate === 'none') {
      // Ads exist but are capped for today (and gems, if any, are unaffordable) / no ads at all.
      if (this.provider.isAvailable(placement)) return { ok: false, reason: 'dailyLimit' };
      return { ok: false, reason: q.gemCost !== null ? 'insufficientGems' : 'unavailable' };
    }

    this.busy = true;
    try {
      if (q.gate === 'ad') return await this.claimWithAd(placement, key);
      return await this.claimWithGems(placement, key, q.gemCost ?? 0);
    } finally {
      this.busy = false;
    }
  }

  // --- internals ---

  private async claimWithAd(placement: RewardPlacement, key: string): Promise<ClaimResult> {
    const nonce = makeNonce();
    this.safeHook('onAdStart', placement);
    let result: AdResult;
    try {
      result = await this.awaitAd(this.provider.showRewardedAd(placement, nonce));
    } catch {
      result = { status: 'failed', reason: 'provider error' };
    } finally {
      this.safeHook('onAdEnd', placement);
    }
    if (result.status === 'cancelled') return { ok: false, reason: 'cancelled' };
    if (result.status === 'failed') return { ok: false, reason: 'failed' };
    if (result.status !== 'completed' || result.nonce !== nonce) return { ok: false, reason: 'invalid' };

    this.record(placement, key, 'ad', 0);
    await this.save.flush();
    return { ok: true, placement, via: 'ad', gemsSpent: 0 };
  }

  private async claimWithGems(placement: RewardPlacement, key: string, cost: number): Promise<ClaimResult> {
    if (this.save.data.gems < cost) return { ok: false, reason: 'insufficientGems' };
    this.record(placement, key, 'gems', cost);
    await this.save.flush();
    return { ok: true, placement, via: 'gems', gemsSpent: cost };
  }

  /** Resolves with the provider's result, or `failed` once the (host-pause-aware) timeout expires. */
  private awaitAd(ad: Promise<AdResult>): Promise<AdResult> {
    return new Promise<AdResult>((resolve) => {
      let done = false;
      let remaining = REWARD_CONFIG.adTimeoutMs;
      let startedAt = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const finish = (r: AdResult): void => {
        if (done) return;
        done = true;
        if (timer !== undefined) clearTimeout(timer);
        this.timerCtl = null;
        resolve(r);
      };
      const arm = (): void => {
        if (done || timer !== undefined || this.hostPaused) return;
        startedAt = Date.now();
        timer = setTimeout(() => {
          timer = undefined;
          try {
            this.provider.abort?.();
          } catch {
            // nothing to close
          }
          finish({ status: 'failed', reason: 'timeout' });
        }, Math.max(0, remaining));
      };
      const disarm = (): void => {
        if (timer === undefined) return;
        clearTimeout(timer);
        timer = undefined;
        remaining -= Date.now() - startedAt;
      };

      this.timerCtl = { pause: disarm, resume: arm };
      arm();
      ad.then(finish, () => finish({ status: 'failed', reason: 'provider error' }));
    });
  }

  private adPossible(placement: RewardPlacement): boolean {
    if (!this.provider.isAvailable(placement)) return false;
    return this.countToday(placement) < REWARD_CONFIG.placements[placement].dailyCap
      && this.countToday(GLOBAL) < REWARD_CONFIG.globalDailyCap;
  }

  private countToday(name: string): number {
    const c = this.save.data.rewards.counts[name];
    return c && c.day === utcDay(this.now()) ? c.n : 0;
  }

  /** Writes the claim into the ledger (and spends gems / counts the ad); the caller flushes. */
  private record(placement: RewardPlacement, key: string, via: 'ad' | 'gems', gemsSpent: number): void {
    const t = this.now();
    const today = utcDay(t);
    void this.save.update((d) => {
      if (via === 'gems') d.gems = Math.max(0, d.gems - gemsSpent);
      if (via === 'ad') {
        for (const name of [placement, GLOBAL]) {
          const c = d.rewards.counts[name];
          d.rewards.counts[name] = { day: today, n: (c && c.day === today ? c.n : 0) + 1 };
        }
      }
      d.rewards.claimed[key] = t;
      d.rewards.claimed = pruneClaimed(d.rewards.claimed);
    });
  }

  private safeHook(name: keyof RewardHooks, placement: RewardPlacement): void {
    try {
      this.hooks[name]?.(placement);
    } catch {
      // a broken hook must not break claims
    }
  }
}
