import { beforeEach, describe, expect, it } from 'vitest';
import { REWARD_CONFIG } from '../src/rewards/config';
import { RewardService } from '../src/rewards/RewardService';
import type { AdResult, RewardPlacement, RewardProvider } from '../src/rewards/types';
import { SaveManager } from '../src/save/SaveManager';
import { FakePlatform } from './helpers';

class FakeProvider implements RewardProvider {
  readonly id = 'fake';
  available = true;
  calls = 0;
  nonces: string[] = [];
  /** null = echo the nonce (completed) */
  respond: ((nonce: string) => Promise<AdResult> | AdResult) | null = null;

  isAvailable(_p: RewardPlacement): boolean {
    return this.available;
  }
  async showRewardedAd(_p: RewardPlacement, nonce: string): Promise<AdResult> {
    this.calls += 1;
    this.nonces.push(nonce);
    await Promise.resolve();
    return this.respond ? this.respond(nonce) : { status: 'completed', nonce };
  }
}

const DAY = 24 * 3600 * 1000;
const T0 = Date.UTC(2025, 5, 1, 12, 0, 0);

async function setup(opts: { stored?: string | null; now?: () => number } = {}) {
  const platform = new FakePlatform(opts.stored ?? null);
  const save = new SaveManager(platform);
  await save.load();
  const provider = new FakeProvider();
  let now = T0;
  const clock = opts.now ?? (() => now);
  const rewards = new RewardService(provider, save, clock);
  return { platform, save, provider, rewards, setNow: (t: number) => { now = t; } };
}

const ctx = { runId: 'run1' };

describe('RewardService claims via ads', () => {
  it('grants on completed with the echoed nonce', async () => {
    const { rewards, provider } = await setup();
    expect(rewards.gate('revive', ctx)).toBe('ad');
    const r = await rewards.claim('revive', ctx);
    expect(r).toEqual({ ok: true, placement: 'revive', via: 'ad' });
    expect(provider.calls).toBe(1);
    expect(rewards.isClaimed('revive', ctx)).toBe(true);
    expect(rewards.gate('revive', ctx)).toBe('none');
  });

  it('does not grant on cancelled, failed, thrown or wrong nonce', async () => {
    const { rewards, provider, save } = await setup();
    provider.respond = () => ({ status: 'cancelled' });
    expect(await rewards.claim('revive', ctx)).toEqual({ ok: false, reason: 'cancelled' });
    provider.respond = () => ({ status: 'failed', reason: 'x' });
    expect(await rewards.claim('revive', ctx)).toEqual({ ok: false, reason: 'failed' });
    provider.respond = () => { throw new Error('boom'); };
    expect(await rewards.claim('revive', ctx)).toEqual({ ok: false, reason: 'failed' });
    provider.respond = () => ({ status: 'completed', nonce: 'forged' });
    expect(await rewards.claim('revive', ctx)).toEqual({ ok: false, reason: 'invalid' });
    expect(rewards.isClaimed('revive', ctx)).toBe(false);
    expect(save.data.rewards.claimsToday).toBe(0);
    // and a later honest attempt still works
    provider.respond = null;
    expect((await rewards.claim('revive', ctx)).ok).toBe(true);
  });

  it('uses a fresh random nonce per request', async () => {
    const { rewards, provider } = await setup();
    await rewards.claim('revive', ctx);
    await rewards.claim('mysteryEgg', ctx);
    expect(new Set(provider.nonces).size).toBe(2);
    expect(provider.nonces[0].length).toBeGreaterThan(8);
  });

  it('records the claim in the flushed save before resolving', async () => {
    const { rewards, platform, provider } = await setup();
    let storedAtAd = platform.writes.length;
    provider.respond = (nonce) => { storedAtAd = platform.writes.length; return { status: 'completed', nonce }; };
    const r = await rewards.claim('revive', ctx);
    expect(r.ok).toBe(true);
    expect(platform.writes.length).toBe(storedAtAd + 1);
    const saved = JSON.parse(platform.stored!);
    expect(saved.rewards.claimed['run1:revive']).toBe(T0);
    expect(saved.rewards.claimsToday).toBe(1);
    expect(saved.rewards.day).toBe('2025-06-01');
  });

  it('rejects a duplicate claim, also after a restart on the same saved data', async () => {
    const a = await setup();
    expect((await a.rewards.claim('revive', ctx)).ok).toBe(true);
    expect(await a.rewards.claim('revive', ctx)).toEqual({ ok: false, reason: 'alreadyClaimed' });

    const b = await setup({ stored: a.platform.stored });
    expect(b.rewards.isClaimed('revive', ctx)).toBe(true);
    expect(b.rewards.gate('revive', ctx)).toBe('none');
    expect(await b.rewards.claim('revive', ctx)).toEqual({ ok: false, reason: 'alreadyClaimed' });
    expect(b.provider.calls).toBe(0);
  });

  it('concurrent claims for one key give exactly one success', async () => {
    const { rewards, provider } = await setup();
    const results = await Promise.all([rewards.claim('revive', ctx), rewards.claim('revive', ctx), rewards.claim('revive', ctx)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === 'alreadyClaimed')).toHaveLength(2);
    expect(provider.calls).toBe(1);
  });

  it('a cancelled in-flight claim releases the lock', async () => {
    const { rewards, provider } = await setup();
    provider.respond = () => ({ status: 'cancelled' });
    const [x, y] = await Promise.all([rewards.claim('revive', ctx), rewards.claim('revive', ctx)]);
    expect([x, y].map((r) => (r.ok ? 'ok' : r.reason)).sort()).toEqual(['alreadyClaimed', 'cancelled']);
    provider.respond = null;
    expect((await rewards.claim('revive', ctx)).ok).toBe(true);
  });

  it('builds the documented claim keys', async () => {
    const { rewards } = await setup();
    expect(rewards.claimKey('revive', ctx)).toBe('run1:revive');
    expect(rewards.claimKey('doubleGold', ctx)).toBe('run1:doubleGold');
    expect(rewards.claimKey('extraUpgrade', { runId: 'run1', key: '10' })).toBe('run1:extraUpgrade:10');
    expect(rewards.claimKey('reroll', { runId: 'run1', key: '4' })).toBe('run1:reroll:4');
    expect(rewards.claimKey('mysteryEgg', ctx)).toBe('run1:mysteryEgg');
  });

  it('keys with different context are independent', async () => {
    const { rewards } = await setup();
    expect((await rewards.claim('reroll', { runId: 'run1', key: '1' })).ok).toBe(true);
    expect((await rewards.claim('reroll', { runId: 'run1', key: '2' })).ok).toBe(true);
    expect((await rewards.claim('reroll', { runId: 'run1', key: '1' })).ok).toBe(false);
    expect((await rewards.claim('revive', { runId: 'run2' })).ok).toBe(true);
  });

  it('rejects an empty runId', async () => {
    const { rewards } = await setup();
    expect(await rewards.claim('revive', { runId: '' })).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('RewardService daily limit', () => {
  let limit: number;
  beforeEach(() => { limit = REWARD_CONFIG.dailyLimit; });

  it('blocks ad claims past the limit and resets on the next UTC day', async () => {
    const t = await setup();
    const keep = REWARD_CONFIG.dailyLimit;
    REWARD_CONFIG.dailyLimit = 3;
    try {
      for (let i = 0; i < 3; i++) expect((await t.rewards.claim('reroll', { runId: 'r', key: String(i) })).ok).toBe(true);
      expect(t.rewards.gate('reroll', { runId: 'r', key: '9' })).toBe('none');
      expect(await t.rewards.claim('reroll', { runId: 'r', key: '9' })).toEqual({ ok: false, reason: 'dailyLimit' });

      t.setNow(T0 + DAY);
      expect(t.rewards.gate('reroll', { runId: 'r', key: '9' })).toBe('ad');
      expect((await t.rewards.claim('reroll', { runId: 'r', key: '9' })).ok).toBe(true);
      expect(t.save.data.rewards.claimsToday).toBe(1);
      expect(t.save.data.rewards.day).toBe('2025-06-02');
    } finally {
      REWARD_CONFIG.dailyLimit = keep;
    }
    expect(REWARD_CONFIG.dailyLimit).toBe(limit);
  });

  it('falls back to a token once the limit is hit', async () => {
    const t = await setup();
    const keep = REWARD_CONFIG.dailyLimit;
    REWARD_CONFIG.dailyLimit = 1;
    try {
      await t.rewards.claim('revive', ctx);
      t.rewards.addTokens(1, 'test');
      expect(t.rewards.gate('mysteryEgg', ctx)).toBe('token');
    } finally {
      REWARD_CONFIG.dailyLimit = keep;
    }
  });
});

describe('RewardService tokens', () => {
  it('uses a token when the provider is unavailable and deducts exactly once', async () => {
    const { rewards, provider, save } = await setup();
    provider.available = false;
    expect(rewards.gate('revive', ctx)).toBe('none');
    rewards.addTokens(2, 'boss');
    expect(rewards.tokens).toBe(2);
    expect(rewards.gate('revive', ctx)).toBe('token');

    const r = await rewards.claim('revive', ctx);
    expect(r).toEqual({ ok: true, placement: 'revive', via: 'token' });
    expect(rewards.tokens).toBe(1);
    expect(provider.calls).toBe(0);
    expect(save.data.rewards.claimsToday).toBe(0);

    expect((await rewards.claim('revive', ctx)).ok).toBe(false);
    expect(rewards.tokens).toBe(1);
  });

  it('concurrent token claims deduct once', async () => {
    const { rewards, provider } = await setup();
    provider.available = false;
    rewards.addTokens(5, 't');
    const rs = await Promise.all([rewards.claim('revive', ctx), rewards.claim('revive', ctx)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rewards.tokens).toBe(4);
  });

  it('gate is none and claim unavailable when nothing is possible', async () => {
    const { rewards, provider } = await setup();
    provider.available = false;
    expect(rewards.gate('revive', ctx)).toBe('none');
    expect(await rewards.claim('revive', ctx)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('prefers the ad over a token', async () => {
    const { rewards } = await setup();
    rewards.addTokens(3, 't');
    expect(rewards.gate('revive', ctx)).toBe('ad');
    await rewards.claim('revive', ctx);
    expect(rewards.tokens).toBe(3);
  });

  it('never goes below zero tokens', async () => {
    const { rewards } = await setup();
    rewards.addTokens(-5, 't');
    expect(rewards.tokens).toBe(0);
  });
});
