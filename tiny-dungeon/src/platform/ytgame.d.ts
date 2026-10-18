/**
 * Ambient typings for the YouTube Playables SDK (`ytgame`), limited to the APIs this game uses.
 * The SDK is loaded by a script tag in index.html and is undefined in a normal browser.
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
      loadData(): Promise<string>;
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
      logError(): void;
      logWarning(): void;
    };
    engagement: {
      sendScore(score: { value: number }): Promise<void>;
    };
    ads: {
      requestRewardedAd(rewardId: string): Promise<boolean>;
    };
  }

  interface Window {
    ytgame?: Ytgame;
  }
}
