import type { RewardPlacement } from './types';

export const REWARD_CONFIG: {
  /** Max ad-gated claims per UTC day. */
  dailyLimit: number;
  /** Flip to true after rewarded ads are enabled for the game in the YouTube Developer Portal. */
  youtubeAdsEnabled: boolean;
  /** Stable, unique per reward type, no user data (YouTube requirement). */
  rewardIds: Record<RewardPlacement, string>;
  /** Fortune Tokens needed to unlock a placement without an ad. */
  tokenCost: Record<RewardPlacement, number>;
  /** Countdown shown by the development mock ad. */
  mockAdSeconds: number;
} = {
  dailyLimit: 12,
  youtubeAdsEnabled: false,
  rewardIds: {
    revive: 'td_revive',
    doubleGold: 'td_double_gold',
    extraUpgrade: 'td_extra_upgrade',
    reroll: 'td_reroll',
    mysteryEgg: 'td_mystery_egg',
  },
  tokenCost: { revive: 1, doubleGold: 1, extraUpgrade: 1, reroll: 1, mysteryEgg: 1 },
  mockAdSeconds: 2,
};
