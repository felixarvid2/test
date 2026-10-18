import { pruneClaimed, type SaveManager } from '../save/SaveManager';
import { REWARD_CONFIG } from './config';
import type { ClaimResult, RewardGate, RewardPlacement, RewardProvider } from './types';

export interface ClaimContext {
  runId: string;
  /** Extra part of the claim key: boss room for extraUpgrade, room number for reroll. */
  key?: string;
}

const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

function makeNonce(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join('');
}

/**
 * Hands out rewards for ads or Fortune Tokens. A claim is granted only after it has been written
 * to the (flushed) save, so a crash or restart can never grant the same claim twice.
 */
export class RewardService {
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly provider: RewardProvider,
    private readonly save: SaveManager,
    private readonly now: () => number = Date.now,
  ) {}

  get tokens(): number {
    return this.save.data.rewards.tokens;
  }

  claimKey(placement: RewardPlacement, ctx: ClaimContext): string {
    switch (placement) {
      case 'extraUpgrade':
      case 'reroll':
        return `${ctx.runId}:${placement}:${ctx.key ?? ''}`;
      default:
        return `${ctx.runId}:${placement}`;
    }
  }

  isClaimed(placement: RewardPlacement, ctx: ClaimContext): boolean {
    return this.claimKey(placement, ctx) in this.save.data.rewards.claimed;
  }

  gate(placement: RewardPlacement, ctx: ClaimContext): RewardGate {
    const key = this.claimKey(placement, ctx);
    if (this.inFlight.has(key) || key in this.save.data.rewards.claimed) return 'none';
    if (this.adPossible(placement)) return 'ad';
    return this.tokens >= REWARD_CONFIG.tokenCost[placement] ? 'token' : 'none';
  }

  async claim(placement: RewardPlacement, ctx: ClaimContext): Promise<ClaimResult> {
    if (typeof ctx.runId !== 'string' || ctx.runId === '') return { ok: false, reason: 'invalid' };
    const key = this.claimKey(placement, ctx);
    // Everything up to inFlight.add is synchronous, so concurrent calls cannot both pass.
    if (this.inFlight.has(key) || key in this.save.data.rewards.claimed) {
      return { ok: false, reason: 'alreadyClaimed' };
    }
    const gate = this.gate(placement, ctx);
    if (gate === 'none') {
      const limited = this.provider.isAvailable(placement) && !this.underDailyLimit();
      return { ok: false, reason: limited ? 'dailyLimit' : 'unavailable' };
    }

    this.inFlight.add(key);
    try {
      if (gate === 'ad') {
        const nonce = makeNonce();
        let result;
        try {
          result = await this.provider.showRewardedAd(placement, nonce);
        } catch {
          return { ok: false, reason: 'failed' };
        }
        if (result.status === 'cancelled') return { ok: false, reason: 'cancelled' };
        if (result.status === 'failed') return { ok: false, reason: 'failed' };
        if (result.status !== 'completed' || result.nonce !== nonce) return { ok: false, reason: 'invalid' };
        this.record(key, 'ad');
      } else {
        this.save.data.rewards.tokens -= REWARD_CONFIG.tokenCost[placement];
        this.record(key, 'token');
      }
      await this.save.flush();
      return { ok: true, placement, via: gate };
    } finally {
      this.inFlight.delete(key);
    }
  }

  /** Fortune Tokens from bosses, achievements and daily challenges. Saved (debounced). */
  addTokens(n: number, _reason: string): void {
    if (!Number.isFinite(n) || n === 0) return;
    const r = this.save.data.rewards;
    r.tokens = Math.max(0, r.tokens + Math.trunc(n));
    void this.save.save();
  }

  // --- internals ---

  private claimsToday(): number {
    const r = this.save.data.rewards;
    return r.day === utcDay(this.now()) ? r.claimsToday : 0;
  }

  private underDailyLimit(): boolean {
    return this.claimsToday() < REWARD_CONFIG.dailyLimit;
  }

  private adPossible(placement: RewardPlacement): boolean {
    return this.provider.isAvailable(placement) && this.underDailyLimit();
  }

  /** Mutates the ledger in memory; the caller flushes. */
  private record(key: string, via: 'ad' | 'token'): void {
    const r = this.save.data.rewards;
    const t = this.now();
    const today = utcDay(t);
    if (r.day !== today) {
      r.day = today;
      r.claimsToday = 0;
    }
    if (via === 'ad') r.claimsToday += 1;
    r.claimed[key] = t;
    r.claimed = pruneClaimed(r.claimed);
  }
}
