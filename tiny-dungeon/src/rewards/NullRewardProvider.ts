import type { AdResult, RewardPlacement, RewardProvider } from './types';

/** No ads at all: rewards can only be unlocked with Fortune Tokens. */
export class NullRewardProvider implements RewardProvider {
  readonly id = 'null';

  isAvailable(): boolean {
    return false;
  }

  async showRewardedAd(_placement: RewardPlacement, _nonce: string): Promise<AdResult> {
    return { status: 'failed', reason: 'ads unavailable' };
  }
}
