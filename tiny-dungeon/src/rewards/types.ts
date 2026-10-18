export type RewardPlacement = 'revive' | 'doubleGold' | 'extraUpgrade' | 'reroll' | 'mysteryEgg';

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
}

/** How a reward can be unlocked right now: by watching an ad, by spending a Fortune Token, or not at all. */
export type RewardGate = 'ad' | 'token' | 'none';

export type ClaimResult =
  | { ok: true; placement: RewardPlacement; via: Exclude<RewardGate, 'none'> }
  | { ok: false; reason: 'unavailable' | 'alreadyClaimed' | 'dailyLimit' | 'cancelled' | 'failed' | 'invalid' };

export type MysteryEggReward =
  | { kind: 'companion'; id: string; rooms: number }
  | { kind: 'cosmetic'; id: string }
  | { kind: 'gold'; amount: number }
  | { kind: 'buff'; id: string; rooms: number };
