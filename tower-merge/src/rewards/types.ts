/** Where a rewarded ad can be offered. */
export type RewardPlacement = 'revive' | 'rareTower' | 'reroll' | 'doubleGems' | 'emergencyPower';

export const REWARD_PLACEMENTS: readonly RewardPlacement[] = ['revive', 'rareTower', 'reroll', 'doubleGems', 'emergencyPower'];

export type AdResult =
  | { status: 'completed'; nonce: string }   // nonce must echo the one passed in
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string };

/**
 * An advertising backend. Implementations: MockRewardProvider (development), YouTubeRewardProvider
 * (ytgame.ads.requestRewardedAd, behind a config flag), NullRewardProvider (no ads at all).
 */
export interface RewardProvider {
  readonly id: string;
  isAvailable(placement: RewardPlacement): boolean;
  showRewardedAd(placement: RewardPlacement, nonce: string): Promise<AdResult>;
  /** Close an ad that is still showing (RewardService calls it on timeout). Optional. */
  abort?(): void;
}

/** How a reward can be unlocked right now: watch an ad, pay gems, or not at all. */
export type RewardGate = 'ad' | 'gems' | 'none';

export interface ClaimContext {
  /** Id of the current run (any unique string per run). */
  runId: string;
  /** Scope part of the key: boss wave for rareTower, upgrade-screen (wave) number for reroll. */
  key?: string;
}

export type ClaimFailure =
  | 'unavailable'      // no ad possible and gems alternative unavailable
  | 'alreadyClaimed'   // once-per-scope limit reached
  | 'dailyLimit'
  | 'insufficientGems'
  | 'busy'             // another claim is in progress
  | 'cancelled'        // player closed the ad / did not earn the reward
  | 'failed'           // provider error or timeout
  | 'invalid';         // bad context or provider result

export type ClaimResult =
  | { ok: true; placement: RewardPlacement; via: 'ad' | 'gems'; gemsSpent: number }
  | { ok: false; reason: ClaimFailure };

/** Everything a button needs to render a reward offer. */
export interface RewardQuote {
  gate: RewardGate;
  /** Gem price of the alternative (null = this placement has none). */
  gemCost: number | null;
  claimed: boolean;
  adAvailable: boolean;
  canAffordGems: boolean;
}
