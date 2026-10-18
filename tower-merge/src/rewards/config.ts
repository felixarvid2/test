import type { RewardPlacement } from './types';

/** What "once" means for a placement: per run, or per boss wave / upgrade screen (ClaimContext.key). */
export type RewardScope = 'run' | 'boss' | 'upgrade';

export interface PlacementConfig {
  scope: RewardScope;
  /** Max ad-gated claims of this placement per UTC day. */
  dailyCap: number;
  /** Gems the compliant alternative costs; null = no alternative (the offer simply disappears without ads). */
  gemCost: number | null;
  /** Stable, unique per reward type, no user data (YouTube requirement). */
  rewardId: string;
}

export const REWARD_CONFIG: {
  /**
   * Flip to true once rewarded ads are enabled for the game in the YouTube Playables Developer
   * Portal (monetization settings). Off: the YouTube build offers the gem alternative only.
   */
  youtubeAdsEnabled: boolean;
  /** Max ad-gated claims per UTC day over all placements. */
  globalDailyCap: number;
  /** An ad that has not reported back after this long (host-paused time excluded) counts as failed. */
  adTimeoutMs: number;
  /** Countdown shown by the development mock ad. */
  mockAdSeconds: number;
  /** Newest claims kept in the save for idempotency. */
  maxClaims: number;
  placements: Record<RewardPlacement, PlacementConfig>;
} = {
  youtubeAdsEnabled: false,
  globalDailyCap: 20,
  adTimeoutMs: 120_000,
  mockAdSeconds: 2.5,
  maxClaims: 200,
  placements: {
    revive: { scope: 'run', dailyCap: 6, gemCost: 60, rewardId: 'tm_revive' },
    rareTower: { scope: 'boss', dailyCap: 8, gemCost: 40, rewardId: 'tm_rare_tower' },
    reroll: { scope: 'upgrade', dailyCap: 10, gemCost: 15, rewardId: 'tm_reroll' },
    doubleGems: { scope: 'run', dailyCap: 6, gemCost: null, rewardId: 'tm_double_gems' },
    emergencyPower: { scope: 'run', dailyCap: 6, gemCost: 30, rewardId: 'tm_emergency_power' },
  },
};
