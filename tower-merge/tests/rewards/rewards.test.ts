import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REWARD_CONFIG } from '../../src/rewards/config';
import { RewardService } from '../../src/rewards/RewardService';
import { NullRewardProvider } from '../../src/rewards/NullRewardProvider';
import type { AdResult, RewardPlacement, RewardProvider } from '../../src/rewards/types';
import { SaveManager } from '../../src/save/SaveManager';
import { FakePlatform } from '../platform/fakePlatform';

class FakeProvider implements RewardProvider {
  readonly id = 'fake';
  available = true;
  calls = 0;
  aborted = 0;
  nonces: string[] = [];
  placements: RewardPlacement[] = [];
  /** null = echo the nonce (completed) */
  respond: ((nonce: string) => Promise<AdResult> | AdResult) | null = null;

  isAvailable(_p: RewardPlacement): boolean {
    return this.available;
  }
  async showRewardedAd(p: RewardPlacement, nonce: string): Promise<AdResult> {
    this.calls += 1;
    this.nonces.push(nonce);
    this.placements.push(p);
    await Promise.resolve();
    return this.respond ? this.respond(nonce) : { status: 'completed', nonce };
  }
  abort(): void {
    this.aborted += 1;
  }
}

const DAY = 24 * 3600 * 1000;
const T0 = Date.UTC(2026, 5, 1, 12, 0, 0);

async function setup(opts: { stored?: string | null } = {}) {
  const platform = new FakePlatform(opts.stored ?? null);
  const save = new SaveManager(platform);
  await save.load();
  const provider = new FakeProvider();
  let now = T0;
  const rewards = new RewardService(provider, save, () => now);
  const events: string[] = [];
  rewards.setHooks({ onAdStart: (p) => events.push(`start:${p}`), onAdEnd: (p) => events.push(`end:${p}`) });
  return { platform, save, provider, rewards, events, setNow: (t: number) => { now = t; } };
}

const ctx = { runId: 'run1' };

/** Restores REWARD_CONFIG values a test changed. */
const saved = JSON.parse(JSON.stringify({ ...REWARD_CONFIG })) as typeof REWARD_CONFIG;
afterEach(() => {
  REWARD_CONFIG.globalDailyCap = saved.globalDailyCap;
  REWARD_CONFIG.adTimeoutMs = saved.adTimeoutMs;
  REWARD_CONFIG.maxClaims = saved.maxClaims;
  REWARD_CONFIG.placements = JSON.parse(JSON.stringify(saved.placements));
  vi.useRealTimers();
});

describe('claims via ads', () => {
  it('grants on completed with the echoed nonce', async () => {
    const { rewards, provider } = await setup();
    expect(rewards.gate('revive', ctx)).toBe('ad');
    const r = await rewards.claim('revive', ctx);
    expect(r).toEqual({ ok: true, placement: 'revive', via: 'ad', gemsSpent: 0 });
    expect(provider.calls).toBe(1);
    expect(provider.placements).toEqual(['revive']);
    expect(rewards.isClaimed('revive', ctx)).toBe(true);
    expect(rewards.gate('revive', ctx)).toBe('none');
  });

  it('never grants without completion: cancelled, failed, thrown, forged nonce, unknown status', async () => {
    const { rewards, provider, save } = await setup();
    provider.respond = () => ({ status: 'cancelled' });
    expect(await rewards.claim('revive', ctx)).toEqual({ ok: false, reason: 'cancelled' });
    provider.respond = () => ({ status: 'failed', reason: 'x' });
    expect(await rewards.claim('revive', ctx)).toEqual({ ok: false, reason: 'failed' });
    provider.respond = () => { throw new Error('boom'); };
    expect(await rewards.claim('revive', ctx)).toEqual({ ok: false, reason: 'failed' });
    provider.respond = () => ({ status: 'completed', nonce: 'forged' });
    expect(await rewards.claim('revive', ctx)).toEqual({ ok: false, reason: 'invalid' });
    provider.respond = () => ({ status: 'weird' } as unknown as AdResult);
    expect(await rewards.claim('revive', ctx)).toEqual({ ok: false, reason: 'invalid' });
    expect(rewards.isClaimed('revive', ctx)).toBe(false);
    expect(save.data.rewards.counts).toEqual({});
    expect(save.data.rewards.claimed).toEqual({});
    // and a later honest attempt still works
    provider.respond = null;
    expect((await rewards.claim('revive', ctx)).ok).toBe(true);
  });

  it('a provider that throws synchronously is a failure and still ends the ad hooks', async () => {
    const { rewards, provider, events } = await setup();
    provider.showRewardedAd = () => { throw new Error('sync'); };
    expect(await rewards.claim('revive', ctx)).toEqual({ ok: false, reason: 'failed' });
    expect(events).toEqual(['start:revive', 'end:revive']);
    expect(rewards.isBusy).toBe(false);
  });

  it('uses a fresh random nonce per request', async () => {
    const { rewards, provider } = await setup();
    await rewards.claim('revive', ctx);
    await rewards.claim('doubleGems', ctx);
    expect(new Set(provider.nonces).size).toBe(2);
    expect(provider.nonces[0].length).toBeGreaterThan(8);
  });

  it('records the claim in the flushed save before resolving', async () => {
    const { rewards, platform, provider } = await setup();
    let writesAtAd = platform.writes.length;
    provider.respond = (nonce) => { writesAtAd = platform.writes.length; return { status: 'completed', nonce }; };
    const r = await rewards.claim('revive', ctx);
    expect(r.ok).toBe(true);
    expect(platform.writes.length).toBe(writesAtAd + 1);
    const saved = JSON.parse(platform.stored!);
    expect(saved.rewards.claimed['run1:revive']).toBe(T0);
    expect(saved.rewards.counts.revive).toEqual({ day: '2026-06-01', n: 1 });
    expect(saved.rewards.counts.all).toEqual({ day: '2026-06-01', n: 1 });
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

  it('concurrent claims for one key give exactly one success and one ad', async () => {
    const { rewards, provider } = await setup();
    const results = await Promise.all([rewards.claim('revive', ctx), rewards.claim('revive', ctx), rewards.claim('revive', ctx)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === 'busy')).toHaveLength(2);
    expect(provider.calls).toBe(1);
  });

  it('only one claim at a time across placements', async () => {
    const { rewards, provider } = await setup();
    const [a, b] = await Promise.all([rewards.claim('revive', ctx), rewards.claim('doubleGems', ctx)]);
    expect(a.ok).toBe(true);
    expect(b).toEqual({ ok: false, reason: 'busy' });
    expect(provider.calls).toBe(1);
    expect((await rewards.claim('doubleGems', ctx)).ok).toBe(true);
  });

  it('a cancelled in-flight claim releases the lock', async () => {
    const { rewards, provider } = await setup();
    provider.respond = () => ({ status: 'cancelled' });
    const [x, y] = await Promise.all([rewards.claim('revive', ctx), rewards.claim('revive', ctx)]);
    expect([x, y].map((r) => (r.ok ? 'ok' : r.reason)).sort()).toEqual(['busy', 'cancelled']);
    provider.respond = null;
    expect((await rewards.claim('revive', ctx)).ok).toBe(true);
  });

  it('calls onAdStart before the provider and onAdEnd after every outcome', async () => {
    const { rewards, provider, events } = await setup();
    const order: string[] = [];
    rewards.setHooks({ onAdStart: () => order.push('start'), onAdEnd: () => order.push('end') });
    provider.respond = () => { order.push('provider'); return { status: 'cancelled' }; };
    await rewards.claim('revive', ctx);
    provider.respond = null;
    await rewards.claim('revive', ctx);
    expect(order).toEqual(['start', 'provider', 'end', 'start', 'end']);
    expect(events).toEqual([]);
  });

  it('does not call the ad hooks for gem payments or refused claims', async () => {
    const { rewards, provider, events, save } = await setup();
    provider.available = false;
    save.data.gems = 500;
    await rewards.claim('revive', ctx);
    await rewards.claim('revive', ctx);
    expect(events).toEqual([]);
  });

  it('a throwing hook does not break the claim', async () => {
    const { rewards } = await setup();
    rewards.setHooks({ onAdStart: () => { throw new Error('a'); }, onAdEnd: () => { throw new Error('b'); } });
    expect((await rewards.claim('revive', ctx)).ok).toBe(true);
  });
});

describe('claim keys and once-per-scope', () => {
  it('builds the documented claim keys', async () => {
    const { rewards } = await setup();
    expect(rewards.claimKey('revive', ctx)).toBe('run1:revive');
    expect(rewards.claimKey('doubleGems', ctx)).toBe('run1:doubleGems');
    expect(rewards.claimKey('emergencyPower', ctx)).toBe('run1:emergencyPower');
    expect(rewards.claimKey('rareTower', { runId: 'run1', key: '10' })).toBe('run1:rareTower:10');
    expect(rewards.claimKey('reroll', { runId: 'run1', key: '4' })).toBe('run1:reroll:4');
  });

  it('revive, doubleGems and emergencyPower are once per run', async () => {
    const { rewards } = await setup();
    for (const p of ['revive', 'doubleGems', 'emergencyPower'] as const) {
      expect((await rewards.claim(p, ctx)).ok).toBe(true);
      expect(await rewards.claim(p, ctx)).toEqual({ ok: false, reason: 'alreadyClaimed' });
      expect(rewards.gate(p, ctx)).toBe('none');
      expect((await rewards.claim(p, { runId: 'run2' })).ok).toBe(true); // a new run starts fresh
    }
  });

  it('rareTower is once per boss, reroll once per upgrade screen', async () => {
    const { rewards } = await setup();
    expect((await rewards.claim('rareTower', { runId: 'r', key: '10' })).ok).toBe(true);
    expect((await rewards.claim('rareTower', { runId: 'r', key: '10' })).ok).toBe(false);
    expect((await rewards.claim('rareTower', { runId: 'r', key: '20' })).ok).toBe(true);
    expect((await rewards.claim('reroll', { runId: 'r', key: '1' })).ok).toBe(true);
    expect((await rewards.claim('reroll', { runId: 'r', key: '2' })).ok).toBe(true);
    expect(await rewards.claim('reroll', { runId: 'r', key: '1' })).toEqual({ ok: false, reason: 'alreadyClaimed' });
  });

  it('rejects a missing run id, and a scoped placement without a key', async () => {
    const { rewards, provider } = await setup();
    expect(await rewards.claim('revive', { runId: '' })).toEqual({ ok: false, reason: 'invalid' });
    expect(await rewards.claim('reroll', { runId: 'r' })).toEqual({ ok: false, reason: 'invalid' });
    expect(await rewards.claim('rareTower', { runId: 'r', key: '' })).toEqual({ ok: false, reason: 'invalid' });
    expect(rewards.gate('reroll', { runId: 'r' })).toBe('none');
    expect(provider.calls).toBe(0);
  });

  it('prunes the ledger to the newest claims', async () => {
    const { rewards, save } = await setup();
    REWARD_CONFIG.maxClaims = 3;
    for (let i = 0; i < 6; i++) await rewards.claim('reroll', { runId: 'r', key: String(i) });
    expect(Object.keys(save.data.rewards.claimed)).toHaveLength(3);
    expect(save.data.rewards.claimed['r:reroll:5']).toBeDefined();
  });
});

describe('daily caps', () => {
  it('blocks ad claims past a placement cap and resets on the next UTC day', async () => {
    const t = await setup();
    REWARD_CONFIG.placements.reroll.dailyCap = 3;
    REWARD_CONFIG.placements.reroll.gemCost = null;
    for (let i = 0; i < 3; i++) expect((await t.rewards.claim('reroll', { runId: 'r', key: String(i) })).ok).toBe(true);
    expect(t.rewards.gate('reroll', { runId: 'r', key: '9' })).toBe('none');
    expect(await t.rewards.claim('reroll', { runId: 'r', key: '9' })).toEqual({ ok: false, reason: 'dailyLimit' });
    // other placements are not affected
    expect(t.rewards.gate('revive', ctx)).toBe('ad');

    t.setNow(T0 + DAY);
    expect(t.rewards.gate('reroll', { runId: 'r', key: '9' })).toBe('ad');
    expect((await t.rewards.claim('reroll', { runId: 'r', key: '9' })).ok).toBe(true);
    expect(t.save.data.rewards.counts.reroll).toEqual({ day: '2026-06-02', n: 1 });
  });

  it('applies the global daily cap across placements', async () => {
    const t = await setup();
    REWARD_CONFIG.globalDailyCap = 2;
    REWARD_CONFIG.placements.emergencyPower.gemCost = null;
    expect((await t.rewards.claim('revive', ctx)).ok).toBe(true);
    expect((await t.rewards.claim('doubleGems', ctx)).ok).toBe(true);
    expect(await t.rewards.claim('emergencyPower', ctx)).toEqual({ ok: false, reason: 'dailyLimit' });
    t.setNow(T0 + DAY);
    expect((await t.rewards.claim('emergencyPower', ctx)).ok).toBe(true);
  });

  it('cancelled and failed ads do not use up the daily cap', async () => {
    const t = await setup();
    REWARD_CONFIG.placements.revive.dailyCap = 1;
    t.provider.respond = () => ({ status: 'cancelled' });
    await t.rewards.claim('revive', ctx);
    t.provider.respond = () => ({ status: 'failed', reason: 'x' });
    await t.rewards.claim('revive', ctx);
    t.provider.respond = null;
    expect((await t.rewards.claim('revive', ctx)).ok).toBe(true);
  });

  it('gem payments are not counted against the ad caps', async () => {
    const t = await setup();
    t.provider.available = false;
    t.save.data.gems = 1000;
    await t.rewards.claim('revive', ctx);
    expect(t.save.data.rewards.counts).toEqual({});
  });

  it('past the cap the player may pay gems instead', async () => {
    const t = await setup();
    REWARD_CONFIG.placements.revive.dailyCap = 1;
    await t.rewards.claim('revive', { runId: 'a' });
    expect(t.rewards.gate('revive', { runId: 'b' })).toBe('none'); // cannot afford
    t.save.data.gems = REWARD_CONFIG.placements.revive.gemCost!;
    expect(t.rewards.gate('revive', { runId: 'b' })).toBe('gems');
    expect(await t.rewards.claim('revive', { runId: 'b' })).toMatchObject({ ok: true, via: 'gems' });
  });
});

describe('gems alternative', () => {
  it('uses gems when ads are unavailable and deducts exactly once', async () => {
    const { rewards, provider, save } = await setup();
    provider.available = false;
    const cost = REWARD_CONFIG.placements.revive.gemCost!;
    expect(rewards.gate('revive', ctx)).toBe('none');
    save.data.gems = cost + 5;
    expect(rewards.gate('revive', ctx)).toBe('gems');

    const r = await rewards.claim('revive', ctx);
    expect(r).toEqual({ ok: true, placement: 'revive', via: 'gems', gemsSpent: cost });
    expect(save.data.gems).toBe(5);
    expect(provider.calls).toBe(0);
    expect(await rewards.claim('revive', ctx)).toEqual({ ok: false, reason: 'alreadyClaimed' });
    expect(save.data.gems).toBe(5);
  });

  it('persists the payment together with the claim', async () => {
    const { rewards, provider, save, platform } = await setup();
    provider.available = false;
    save.data.gems = 100;
    await rewards.claim('revive', ctx);
    const stored = JSON.parse(platform.stored!);
    expect(stored.gems).toBe(100 - REWARD_CONFIG.placements.revive.gemCost!);
    expect(stored.rewards.claimed['run1:revive']).toBe(T0);
  });

  it('concurrent gem claims deduct once', async () => {
    const { rewards, provider, save } = await setup();
    provider.available = false;
    save.data.gems = 500;
    const rs = await Promise.all([rewards.claim('revive', ctx), rewards.claim('revive', ctx)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(save.data.gems).toBe(500 - REWARD_CONFIG.placements.revive.gemCost!);
  });

  it('reports insufficientGems / unavailable and never blocks progress', async () => {
    const { rewards, provider, save } = await setup();
    provider.available = false;
    expect(await rewards.claim('revive', ctx)).toEqual({ ok: false, reason: 'insufficientGems' });
    expect(save.data.gems).toBe(0);
    REWARD_CONFIG.placements.revive.gemCost = null;
    expect(await rewards.claim('revive', ctx)).toEqual({ ok: false, reason: 'unavailable' });
    expect(rewards.gate('revive', ctx)).toBe('none');
  });

  it('prefers the ad over paying gems', async () => {
    const { rewards, save } = await setup();
    save.data.gems = 999;
    expect(rewards.gate('revive', ctx)).toBe('ad');
    await rewards.claim('revive', ctx);
    expect(save.data.gems).toBe(999);
  });

  it('works with the NullRewardProvider (production without ads)', async () => {
    const platform = new FakePlatform(null);
    const save = new SaveManager(platform);
    await save.load();
    const rewards = new RewardService(new NullRewardProvider(), save, () => T0);
    expect(rewards.gate('reroll', { runId: 'r', key: '1' })).toBe('none');
    save.data.gems = 100;
    expect(rewards.gate('reroll', { runId: 'r', key: '1' })).toBe('gems');
    expect((await rewards.claim('reroll', { runId: 'r', key: '1' })).ok).toBe(true);
  });

  it('quote describes the offer for the UI', async () => {
    const { rewards, provider, save } = await setup();
    expect(rewards.quote('revive', ctx)).toEqual({
      gate: 'ad', gemCost: REWARD_CONFIG.placements.revive.gemCost, claimed: false, adAvailable: true, canAffordGems: false,
    });
    provider.available = false;
    save.data.gems = 1000;
    expect(rewards.quote('revive', ctx)).toMatchObject({ gate: 'gems', adAvailable: false, canAffordGems: true });
    await rewards.claim('revive', ctx);
    expect(rewards.quote('revive', ctx)).toMatchObject({ gate: 'none', claimed: true });
    expect(rewards.gemCost('reroll')).toBe(REWARD_CONFIG.placements.reroll.gemCost);
  });
});

describe('timeouts and host pause', () => {
  beforeEach(() => vi.useFakeTimers());

  it('treats an ad that never reports back as failed, closes it, and ignores a late completion', async () => {
    const { rewards, provider, events, save } = await setup();
    REWARD_CONFIG.adTimeoutMs = 1000;
    let release!: (r: AdResult) => void;
    let nonce = '';
    provider.respond = (n) => { nonce = n; return new Promise<AdResult>((r) => { release = r; }); };
    const claim = rewards.claim('revive', ctx);
    await vi.advanceTimersByTimeAsync(999);
    expect(provider.aborted).toBe(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(await claim).toEqual({ ok: false, reason: 'failed' });
    expect(provider.aborted).toBe(1);
    expect(events).toEqual(['start:revive', 'end:revive']);
    release({ status: 'completed', nonce });
    await vi.advanceTimersByTimeAsync(10);
    expect(rewards.isClaimed('revive', ctx)).toBe(false);
    expect(save.data.rewards.counts).toEqual({});
    expect(rewards.isBusy).toBe(false);
  });

  it('does not run the timeout while the host is paused: only the real result resolves the claim', async () => {
    const { rewards, provider } = await setup();
    REWARD_CONFIG.adTimeoutMs = 1000;
    let release!: (r: AdResult) => void;
    let nonce = '';
    provider.respond = (n) => { nonce = n; return new Promise<AdResult>((r) => { release = r; }); };
    const claim = rewards.claim('revive', ctx);
    let result: unknown;
    void claim.then((r) => { result = r; });
    await vi.advanceTimersByTimeAsync(600);
    rewards.setHostPaused(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(result).toBeUndefined();
    expect(provider.aborted).toBe(0);
    rewards.setHostPaused(false);
    await vi.advanceTimersByTimeAsync(300); // 600 + 300 < 1000: still waiting
    expect(result).toBeUndefined();
    release({ status: 'completed', nonce });
    await vi.advanceTimersByTimeAsync(0);
    expect(await claim).toMatchObject({ ok: true, via: 'ad' });
  });

  it('resumes the remaining time after the host resumes', async () => {
    const { rewards, provider } = await setup();
    REWARD_CONFIG.adTimeoutMs = 1000;
    provider.respond = () => new Promise<AdResult>(() => {});
    const claim = rewards.claim('revive', ctx);
    await vi.advanceTimersByTimeAsync(600);
    rewards.setHostPaused(true);
    await vi.advanceTimersByTimeAsync(5000);
    rewards.setHostPaused(false);
    await vi.advanceTimersByTimeAsync(350);
    expect(provider.aborted).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(await claim).toEqual({ ok: false, reason: 'failed' });
  });

  it('a claim started while the host is paused waits for resume before its timeout starts', async () => {
    const { rewards, provider } = await setup();
    REWARD_CONFIG.adTimeoutMs = 1000;
    provider.respond = () => new Promise<AdResult>(() => {});
    rewards.setHostPaused(true);
    const claim = rewards.claim('revive', ctx);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(provider.aborted).toBe(0);
    rewards.setHostPaused(false);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await claim).toEqual({ ok: false, reason: 'failed' });
  });
});
