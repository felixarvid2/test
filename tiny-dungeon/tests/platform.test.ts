import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserPlatform, SAVE_KEY } from '../src/platform/BrowserPlatform';
import { createPlatform } from '../src/platform/createPlatform';
import { YouTubePlatform } from '../src/platform/YouTubePlatform';
import { REWARD_CONFIG } from '../src/rewards/config';
import { MockRewardProvider } from '../src/rewards/MockRewardProvider';
import { NullRewardProvider } from '../src/rewards/NullRewardProvider';
import { YouTubeRewardProvider } from '../src/rewards/YouTubeRewardProvider';

function stubWindow(extra: Record<string, unknown> = {}, storage?: unknown): void {
  vi.stubGlobal('window', { localStorage: storage, ...extra });
}

function makeYt(log: string[], over: Record<string, unknown> = {}) {
  return {
    IN_PLAYABLES_ENV: true,
    SDK_VERSION: 'test',
    game: {
      firstFrameReady: vi.fn(),
      gameReady: vi.fn(),
      loadData: vi.fn(async () => { log.push('load'); await Promise.resolve(); return '{"gold":1}'; }),
      saveData: vi.fn(async () => { log.push('save'); }),
    },
    system: {
      onPause: vi.fn(() => () => {}),
      onResume: vi.fn(() => () => {}),
      isAudioEnabled: vi.fn(() => false),
      onAudioEnabledChange: vi.fn(() => () => {}),
      getLanguage: vi.fn(async () => 'sv'),
    },
    health: { logError: vi.fn(), logWarning: vi.fn() },
    engagement: { sendScore: vi.fn(async () => {}) },
    ads: { requestRewardedAd: vi.fn(async () => true) },
    ...over,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  REWARD_CONFIG.youtubeAdsEnabled = false;
});

describe('createPlatform', () => {
  it('picks Browser without ytgame', () => {
    stubWindow();
    expect(createPlatform().name).toBe('browser');
  });

  it('picks Browser when ytgame says it is not in Playables', () => {
    stubWindow({ ytgame: { IN_PLAYABLES_ENV: false } });
    expect(createPlatform().name).toBe('browser');
  });

  it('picks YouTube with IN_PLAYABLES_ENV true', () => {
    stubWindow({ ytgame: makeYt([]) });
    expect(createPlatform()).toBeInstanceOf(YouTubePlatform);
  });

  it('works with no window at all', () => {
    vi.stubGlobal('window', undefined);
    expect(createPlatform().name).toBe('browser');
  });
});

describe('YouTubePlatform', () => {
  it('calls loadData before saveData even if the game saves first', async () => {
    const log: string[] = [];
    stubWindow({ ytgame: makeYt(log) });
    const p = new YouTubePlatform();
    await p.saveData('x');
    expect(log).toEqual(['load', 'save']);
  });

  it('loads then saves in order and never touches localStorage', async () => {
    const log: string[] = [];
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    stubWindow({ ytgame: makeYt(log) }, storage);
    const p = new YouTubePlatform();
    expect(await p.loadData()).toBe('{"gold":1}');
    await p.saveData('y');
    expect(log).toEqual(['load', 'save']);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('treats an empty save as none and survives SDK errors', async () => {
    const yt = makeYt([]);
    yt.game.loadData = vi.fn(async () => '');
    stubWindow({ ytgame: yt });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = new YouTubePlatform();
    expect(await p.loadData()).toBeNull();

    yt.game.loadData = vi.fn(async () => { throw Object.assign(new Error('nope'), { errorType: 'API_UNAVAILABLE' }); });
    expect(await new YouTubePlatform().loadData()).toBeNull();
    yt.game.saveData = vi.fn(async () => { throw Object.assign(new Error('big'), { errorType: 'SIZE_LIMIT_EXCEEDED' }); });
    await expect(p.saveData('z')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(yt.health.logWarning).toHaveBeenCalled();
  });

  it('wraps the other SDK calls', async () => {
    const yt = makeYt([]);
    stubWindow({ ytgame: yt });
    const p = new YouTubePlatform();
    p.firstFrameReady();
    p.gameReady();
    expect(yt.game.firstFrameReady).toHaveBeenCalled();
    expect(yt.game.gameReady).toHaveBeenCalled();
    expect(p.isAudioEnabled()).toBe(false);
    expect(await p.getLanguage()).toBe('sv');
    await p.sendScore(12.9);
    expect(yt.engagement.sendScore).toHaveBeenCalledWith({ value: 12 });
    await p.sendScore(NaN);
    expect(yt.engagement.sendScore).toHaveBeenCalledTimes(1);
    const cb = () => {};
    p.onPause(cb);
    p.onResume(cb);
    p.onAudioEnabledChange(cb);
    expect(yt.system.onPause).toHaveBeenCalledWith(cb);
    expect(yt.system.onResume).toHaveBeenCalledWith(cb);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    p.logError('x');
    expect(yt.health.logError).toHaveBeenCalledWith();
  });

  it('only offers the YouTube ad provider when enabled in config', () => {
    stubWindow({ ytgame: makeYt([]) });
    const p = new YouTubePlatform();
    expect(p.createRewardProvider()).toBeInstanceOf(NullRewardProvider);
    REWARD_CONFIG.youtubeAdsEnabled = true;
    const rp = p.createRewardProvider();
    expect(rp).toBeInstanceOf(YouTubeRewardProvider);
    expect(rp.isAvailable('revive')).toBe(true);
  });
});

describe('YouTubeRewardProvider', () => {
  it('maps true/false/throw to completed/cancelled/failed with the config reward id', async () => {
    const yt = makeYt([]);
    stubWindow({ ytgame: yt });
    REWARD_CONFIG.youtubeAdsEnabled = true;
    const rp = new YouTubeRewardProvider();
    expect(await rp.showRewardedAd('revive', 'n1')).toEqual({ status: 'completed', nonce: 'n1' });
    expect(yt.ads.requestRewardedAd).toHaveBeenCalledWith('td_revive');
    yt.ads.requestRewardedAd.mockResolvedValueOnce(false);
    expect(await rp.showRewardedAd('reroll', 'n2')).toEqual({ status: 'cancelled' });
    yt.ads.requestRewardedAd.mockRejectedValueOnce(new Error('x'));
    expect((await rp.showRewardedAd('reroll', 'n3')).status).toBe('failed');
  });

  it('is unavailable when disabled or when the SDK has no ads', () => {
    stubWindow({ ytgame: makeYt([]) });
    expect(new YouTubeRewardProvider().isAvailable()).toBe(false);
    REWARD_CONFIG.youtubeAdsEnabled = true;
    stubWindow({ ytgame: makeYt([], { ads: undefined }) });
    expect(new YouTubeRewardProvider().isAvailable()).toBe(false);
  });
});

describe('BrowserPlatform', () => {
  it('saves to localStorage under the documented key', async () => {
    const store = new Map<string, string>();
    stubWindow({}, { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    const p = new BrowserPlatform();
    expect(await p.loadData()).toBeNull();
    await p.saveData('abc');
    expect(store.get(SAVE_KEY)).toBe('abc');
    expect(SAVE_KEY).toBe('tinydungeon.save');
    expect(await p.loadData()).toBe('abc');
  });

  it('survives a throwing localStorage and falls back to memory', async () => {
    const boom = () => { throw new Error('denied'); };
    stubWindow({}, { getItem: boom, setItem: boom });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = new BrowserPlatform();
    expect(await p.loadData()).toBeNull();
    await expect(p.saveData('mem')).resolves.toBeUndefined();
    expect(await p.loadData()).toBe('mem');
  });

  it('survives localStorage being absent', async () => {
    stubWindow({}, undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = new BrowserPlatform();
    await p.saveData('m');
    expect(await p.loadData()).toBe('m');
  });

  it('has trivial audio/score/language behaviour', async () => {
    vi.stubGlobal('navigator', { language: 'de' });
    const p = new BrowserPlatform();
    expect(p.isAudioEnabled()).toBe(true);
    expect(await p.getLanguage()).toBe('de');
    await expect(p.sendScore(5)).resolves.toBeUndefined();
  });

  it('pauses on hidden/blur and resumes on focus, once per transition, and detaches listeners', () => {
    const listeners = new Map<string, Set<() => void>>();
    const add = (t: string, f: () => void) => { (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(f); };
    const remove = (t: string, f: () => void) => { listeners.get(t)?.delete(f); };
    const doc = { visibilityState: 'visible', addEventListener: add, removeEventListener: remove };
    vi.stubGlobal('document', doc);
    stubWindow({ addEventListener: add, removeEventListener: remove });
    const fire = (t: string) => listeners.get(t)?.forEach((f) => f());

    const p = new BrowserPlatform();
    const onPause = vi.fn();
    const onResume = vi.fn();
    const offP = p.onPause(onPause);
    const offR = p.onResume(onResume);
    fire('blur');
    fire('blur');
    expect(onPause).toHaveBeenCalledTimes(1);
    fire('focus');
    expect(onResume).toHaveBeenCalledTimes(1);
    doc.visibilityState = 'hidden';
    fire('visibilitychange');
    expect(onPause).toHaveBeenCalledTimes(2);
    fire('focus'); // still hidden: stays paused
    expect(onResume).toHaveBeenCalledTimes(1);
    doc.visibilityState = 'visible';
    fire('visibilitychange');
    expect(onResume).toHaveBeenCalledTimes(2);
    offP();
    offR();
    for (const s of listeners.values()) expect(s.size).toBe(0);
  });

  it('chooses the reward provider from ?mockads, else Null outside dev', () => {
    const p = new BrowserPlatform();
    const prov = (search: string) => {
      vi.stubGlobal('location', { search });
      return p.createRewardProvider();
    };
    expect(prov('?mockads=1')).toBeInstanceOf(MockRewardProvider);
    expect(prov('?mockads=fail')).toBeInstanceOf(MockRewardProvider);
    // vitest runs with import.meta.env.DEV true, so plain URL gives the mock too
    expect(prov('')).toBeInstanceOf(MockRewardProvider);
    expect(prov('?mockads=0')).toBeInstanceOf(typeof import.meta.env.DEV === 'boolean' && import.meta.env.DEV ? MockRewardProvider : NullRewardProvider);
  });
});

describe('MockRewardProvider forced outcomes', () => {
  it('resolves fail / cancel without any DOM', async () => {
    vi.useFakeTimers();
    try {
      const fail = new MockRewardProvider('fail').showRewardedAd('revive', 'n');
      await vi.advanceTimersByTimeAsync(500);
      expect((await fail).status).toBe('failed');
      const cancel = new MockRewardProvider('cancel').showRewardedAd('revive', 'n');
      await vi.advanceTimersByTimeAsync(500);
      expect((await cancel).status).toBe('cancelled');
    } finally {
      vi.useRealTimers();
    }
  });

  it('is always available and fails gracefully with no DOM', async () => {
    const m = new MockRewardProvider();
    expect(m.isAvailable()).toBe(true);
    expect((await m.showRewardedAd('revive', 'n')).status).toBe('failed');
  });
});
