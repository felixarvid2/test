import { REWARD_CONFIG } from './config';
import type { AdResult, RewardPlacement, RewardProvider } from './types';

/**
 * ytgame.ads.requestRewardedAd, behind REWARD_CONFIG.youtubeAdsEnabled. No third-party ad SDKs.
 * The SDK resolves true when the player met the reward conditions and false when not; it makes no
 * promise that an ad was shown, so only `true` counts as completed. Call it only after an explicit
 * player tap (RewardService does).
 */
export class YouTubeRewardProvider implements RewardProvider {
  readonly id = 'youtube';

  isAvailable(_placement?: RewardPlacement): boolean {
    return REWARD_CONFIG.youtubeAdsEnabled && typeof window !== 'undefined'
      && typeof window.ytgame?.ads?.requestRewardedAd === 'function';
  }

  async showRewardedAd(placement: RewardPlacement, nonce: string): Promise<AdResult> {
    const ads = typeof window !== 'undefined' ? window.ytgame?.ads : undefined;
    if (!ads || !REWARD_CONFIG.youtubeAdsEnabled) return { status: 'failed', reason: 'ads unavailable' };
    try {
      const earned = await ads.requestRewardedAd(REWARD_CONFIG.placements[placement].rewardId);
      return earned === true ? { status: 'completed', nonce } : { status: 'cancelled' };
    } catch (e) {
      return { status: 'failed', reason: e instanceof Error ? e.message : String(e ?? 'unknown') };
    }
  }
}
