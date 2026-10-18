/**
 * Ambient typings for the YouTube Playables SDK (`ytgame`), limited to the documented APIs this
 * game uses (https://developers.google.com/youtube/gaming/playables/reference/sdk, checked
 * 2026-10-18). The SDK is loaded by a script tag in index.html (must precede all game code) and
 * is a no-op / absent outside Playables.
 */
export {};

declare global {
  interface YtgameSdkError extends Error {
    errorType: 'API_UNAVAILABLE' | 'INVALID_PARAMS' | 'SIZE_LIMIT_EXCEEDED' | 'UNKNOWN';
  }

  interface Ytgame {
    readonly IN_PLAYABLES_ENV: boolean;
    readonly SDK_VERSION: string;
    SdkError?: new (...args: never[]) => YtgameSdkError;
    game: {
      firstFrameReady(): void;
      gameReady(): void;
      /** Must complete before the first saveData (saveData before it is rejected). */
      loadData(): Promise<string>;
      /** Valid UTF-16 string, at most 3 MiB. */
      saveData(data: string): Promise<void>;
    };
    system: {
      onPause(cb: () => void): () => void;
      onResume(cb: () => void): () => void;
      isAudioEnabled(): boolean;
      onAudioEnabledChange(cb: (enabled: boolean) => void): () => void;
      getLanguage(): Promise<string>;
    };
    health: {
      /** Take no parameters; best effort and rate limited. */
      logError(): void;
      logWarning(): void;
    };
    engagement: {
      /** `value` must be an integer no greater than Number.MAX_SAFE_INTEGER. */
      sendScore(score: { value: number }): Promise<void>;
    };
    ads: {
      /** Natural breaks only. Never use it to reward the player. */
      requestInterstitialAd(): Promise<void>;
      /**
       * Call only on an explicit player request. Resolves true when the player met the reward
       * conditions, false when not; rejects on failure. No guarantee an ad was shown.
       */
      requestRewardedAd(rewardId: string): Promise<boolean>;
    };
  }

  interface Window {
    ytgame?: Ytgame;
  }
}
