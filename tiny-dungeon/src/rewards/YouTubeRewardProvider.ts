import { REWARD_CONFIG } from './config';
import type { AdResult, RewardPlacement, RewardProvider } from './types';

/** ytgame.ads.requestRewardedAd, behind REWARD_CONFIG.youtubeAdsEnabled. No third-party ad SDKs. */
export class YouTubeRewardProvider implements RewardProvider {
  readonly id = 'youtube';

  isAvailable(): boolean {
    return REWARD_CONFIG.youtubeAdsEnabled && typeof window !== 'undefined'
      && typeof window.ytgame?.ads?.requestRewardedAd === 'function';
  }

  async showRewardedAd(placement: RewardPlacement, nonce: string): Promise<AdResult> {
    const ads = typeof window !== 'undefined' ? window.ytgame?.ads : undefined;
    if (!ads || !REWARD_CONFIG.youtubeAdsEnabled) return { status: 'failed', reason: 'ads unavailable' };
    try {
      const earned = await ads.requestRewardedAd(REWARD_CONFIG.rewardIds[placement]);
      return earned ? { status: 'completed', nonce } : { status: 'cancelled' };
    } catch (e) {
      return { status: 'failed', reason: e instanceof Error ? e.message : String(e) };
    }
  }
}
