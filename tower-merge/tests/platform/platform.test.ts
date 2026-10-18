import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserPlatform, SAVE_KEY } from '../../src/platform/BrowserPlatform';
import { createPlatform } from '../../src/platform/createPlatform';
import { YouTubePlatform } from '../../src/platform/YouTubePlatform';
import { REWARD_CONFIG } from '../../src/rewards/config';
import { MockRewardProvider } from '../../src/rewards/MockRewardProvider';
import { NullRewardProvider } from '../../src/rewards/NullRewardProvider';
import { YouTubeRewardProvider } from '../../src/rewards/YouTubeRewardProvider';

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
      loadData: vi.fn(async () => { log.push('load'); await Promise.resolve(); return '{"gems":1}'; }),
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
  vi.restoreAllMocks();
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
    await new YouTubePlatform().saveData('x');
    expect(log).toEqual(['load', 'save']);
  });

  it('loads then saves in order and never touches localStorage', async () => {
    const log: string[] = [];
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    stubWindow({ ytgame: makeYt(log) }, storage);
    const p = new YouTubePlatform();
    expect(await p.loadData()).toBe('{"gems":1}');
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
    await p.sendScore(-4);
    expect(yt.engagement.sendScore).toHaveBeenLastCalledWith({ value: 0 });
    await p.sendScore(1e300);
    expect(yt.engagement.sendScore).toHaveBeenLastCalledWith({ value: Number.MAX_SAFE_INTEGER });
    await p.sendScore(NaN);
    expect(yt.engagement.sendScore).toHaveBeenCalledTimes(3);
    const cb = () => {};
    p.onPause(cb);
    p.onResume(cb);
    p.onAudioEnabledChange(cb);
    expect(yt.system.onPause).toHaveBeenCalledWith(cb);
    expect(yt.system.onResume).toHaveBeenCalledWith(cb);
    expect(yt.system.onAudioEnabledChange).toHaveBeenCalledWith(cb);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    p.logError('x');
    expect(yt.health.logError).toHaveBeenCalledWith();
  });

  it('never uses the Page Visibility API for pause', () => {
    const add = vi.fn();
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: add });
    stubWindow({ ytgame: makeYt([]), addEventListener: add });
    const p = new YouTubePlatform();
    p.onPause(() => {});
    p.onResume(() => {});
    expect(add).not.toHaveBeenCalled();
  });

  it('survives a missing SDK without throwing', async () => {
    stubWindow({});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = new YouTubePlatform();
    expect(() => { p.firstFrameReady(); p.gameReady(); }).not.toThrow();
    expect(await p.loadData()).toBeNull();
    await expect(p.saveData('x')).resolves.toBeUndefined();
    expect(() => p.onPause(() => {})()).not.toThrow();
    expect(p.isAudioEnabled()).toBe(true);
    expect(await p.getLanguage()).toBe('en');
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

  it('ignores ?mockads: no mock ads inside Playables', () => {
    stubWindow({ ytgame: makeYt([]) });
    vi.stubGlobal('location', { search: '?mockads=1' });
    expect(new YouTubePlatform().createRewardProvider()).toBeInstanceOf(NullRewardProvider);
  });
});

describe('YouTubeRewardProvider', () => {
  it('maps true/false/throw to completed/cancelled/failed with the config reward id', async () => {
    const yt = makeYt([]);
    stubWindow({ ytgame: yt });
    REWARD_CONFIG.youtubeAdsEnabled = true;
    const rp = new YouTubeRewardProvider();
    expect(await rp.showRewardedAd('revive', 'n1')).toEqual({ status: 'completed', nonce: 'n1' });
    expect(yt.ads.requestRewardedAd).toHaveBeenCalledWith(REWARD_CONFIG.placements.revive.rewardId);
    yt.ads.requestRewardedAd.mockResolvedValueOnce(false);
    expect(await rp.showRewardedAd('reroll', 'n2')).toEqual({ status: 'cancelled' });
    yt.ads.requestRewardedAd.mockRejectedValueOnce(new Error('x'));
    expect((await rp.showRewardedAd('reroll', 'n3')).status).toBe('failed');
    yt.ads.requestRewardedAd.mockRejectedValueOnce(undefined); // "error may be undefined"
    expect((await rp.showRewardedAd('reroll', 'n4')).status).toBe('failed');
  });

  it('uses a unique, user-data-free reward id per placement', () => {
    const ids = Object.values(REWARD_CONFIG.placements).map((p) => p.rewardId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+$/);
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
    expect(SAVE_KEY).toBe('towermerge.save');
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

  it('survives having no window at all', async () => {
    vi.stubGlobal('window', undefined);
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

  it('pauses on hidden and resumes on visible, once per transition, and detaches listeners', () => {
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
    doc.visibilityState = 'hidden';
    fire('visibilitychange');
    fire('visibilitychange');
    expect(onPause).toHaveBeenCalledTimes(1);
    doc.visibilityState = 'visible';
    fire('visibilitychange');
    expect(onResume).toHaveBeenCalledTimes(1);
    fire('pagehide');
    expect(onPause).toHaveBeenCalledTimes(2);
    doc.visibilityState = 'visible';
    fire('visibilitychange');
    expect(onResume).toHaveBeenCalledTimes(2);
    offP();
    offR();
    for (const s of listeners.values()) expect(s.size).toBe(0);
  });

  it('a throwing pause handler does not stop the others', () => {
    const listeners = new Map<string, Set<() => void>>();
    const add = (t: string, f: () => void) => { (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(f); };
    const doc = { visibilityState: 'hidden', addEventListener: add, removeEventListener: () => {} };
    vi.stubGlobal('document', doc);
    stubWindow({ addEventListener: add, removeEventListener: () => {} });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = new BrowserPlatform();
    const ok = vi.fn();
    p.onPause(() => { throw new Error('bad'); });
    p.onPause(ok);
    listeners.get('visibilitychange')?.forEach((f) => f());
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('chooses the reward provider from ?mockads', () => {
    const p = new BrowserPlatform();
    const prov = (search: string) => {
      vi.stubGlobal('location', { search });
      return p.createRewardProvider();
    };
    expect(prov('?mockads=1')).toBeInstanceOf(MockRewardProvider);
    expect(prov('?mockads=fail')).toBeInstanceOf(MockRewardProvider);
    expect(prov('?mockads=auto')).toBeInstanceOf(MockRewardProvider);
    expect(prov('?mockads=0')).toBeInstanceOf(NullRewardProvider);
    // vitest runs with import.meta.env.DEV true, so a plain URL gives the mock; production gives none
    expect(prov('')).toBeInstanceOf(import.meta.env.DEV ? MockRewardProvider : NullRewardProvider);
  });
});

describe('MockRewardProvider', () => {
  it('scripted modes resolve without any DOM', async () => {
    vi.useFakeTimers();
    try {
      const fail = new MockRewardProvider({ mode: 'fail', delayMs: 10 }).showRewardedAd('revive', 'n');
      await vi.advanceTimersByTimeAsync(20);
      expect((await fail).status).toBe('failed');
      const cancel = new MockRewardProvider({ mode: 'cancel', delayMs: 10 }).showRewardedAd('revive', 'n');
      await vi.advanceTimersByTimeAsync(20);
      expect((await cancel).status).toBe('cancelled');
      const ok = new MockRewardProvider({ mode: 'complete', delayMs: 10 }).showRewardedAd('revive', 'nn');
      await vi.advanceTimersByTimeAsync(20);
      expect(await ok).toEqual({ status: 'completed', nonce: 'nn' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('manual mode waits for a programmatic result, once', async () => {
    const m = new MockRewardProvider({ mode: 'manual' });
    expect(m.isAvailable('revive')).toBe(true);
    const p = m.showRewardedAd('reroll', 'abc');
    expect(m.pending).toEqual({ placement: 'reroll', nonce: 'abc' });
    expect(m.complete()).toBe(true);
    expect(await p).toEqual({ status: 'completed', nonce: 'abc' });
    expect(m.pending).toBeNull();
    expect(m.complete()).toBe(false);
  });

  it('a new ad cancels the one still showing; abort cancels', async () => {
    const m = new MockRewardProvider({ mode: 'manual' });
    const first = m.showRewardedAd('revive', '1');
    const second = m.showRewardedAd('revive', '2');
    expect(await first).toEqual({ status: 'cancelled' });
    m.abort();
    expect(await second).toEqual({ status: 'cancelled' });
  });

  it('overlay mode fails gracefully with no DOM', async () => {
    const m = new MockRewardProvider();
    expect((await m.showRewardedAd('revive', 'n')).status).toBe('failed');
  });
});

/** A tiny DOM: just enough for the overlay (createElement, append, click listeners, remove). */
class El {
  children: El[] = [];
  style: Record<string, string> = {};
  attrs: Record<string, string> = {};
  listeners = new Map<string, Set<(e: unknown) => void>>();
  textContent = '';
  disabled = false;
  type = '';
  parent: El | null = null;
  constructor(readonly tag: string) {}
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  append(...c: El[]) { for (const x of c) { x.parent = this; this.children.push(x); } }
  appendChild(c: El) { this.append(c); return c; }
  addEventListener(t: string, f: (e: unknown) => void) { (this.listeners.get(t) ?? this.listeners.set(t, new Set()).get(t)!).add(f); }
  removeEventListener(t: string, f: (e: unknown) => void) { this.listeners.get(t)?.delete(f); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  click() { if (!this.disabled) this.listeners.get('click')?.forEach((f) => f({})); }
  find(text: string): El | undefined {
    if (this.tag === 'button' && this.textContent === text) return this;
    for (const c of this.children) { const r = c.find(text); if (r) return r; }
    return undefined;
  }
}

describe('MockRewardProvider overlay', () => {
  function setup() {
    const body = new El('body');
    vi.stubGlobal('document', { body, createElement: (t: string) => new El(t) });
    vi.useFakeTimers();
    return body;
  }
  afterEach(() => vi.useRealTimers());

  it('counts down 2.5 s, enables Complete only afterwards and cleans up', async () => {
    const body = setup();
    const m = new MockRewardProvider();
    const p = m.showRewardedAd('doubleGems', 'nonce1');
    const overlay = body.children[0];
    expect(overlay.attrs['aria-label']).toBe('Mock ad');
    const complete = overlay.find('Complete')!;
    expect(complete.disabled).toBe(true);
    complete.click(); // too early: ignored
    await vi.advanceTimersByTimeAsync(1000);
    expect(complete.disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(1600);
    expect(complete.disabled).toBe(false);
    complete.click();
    expect(await p).toEqual({ status: 'completed', nonce: 'nonce1' });
    expect(body.children).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Skip cancels immediately', async () => {
    const body = setup();
    const p = new MockRewardProvider().showRewardedAd('revive', 'n');
    body.children[0].find('Skip')!.click();
    expect(await p).toEqual({ status: 'cancelled' });
    expect(body.children).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
