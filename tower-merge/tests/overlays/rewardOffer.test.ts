import { describe, expect, it } from 'vitest';
import { MockRewardProvider } from '../../src/rewards/MockRewardProvider';
import { NullRewardProvider } from '../../src/rewards/NullRewardProvider';
import { RewardService } from '../../src/rewards/RewardService';
import type { ClaimResult, RewardQuote } from '../../src/rewards/types';
import { RewardOfferState } from '../../src/game/overlays/logic';
import { SaveManager } from '../../src/save/SaveManager';
import { FakePlatform } from '../platform/fakePlatform';

const quote = (over: Partial<RewardQuote> = {}): RewardQuote => ({
  gate: 'ad', gemCost: 15, claimed: false, adAvailable: true, canAffordGems: false, ...over,
});

describe('RewardOfferState (stubbed quotes)', () => {
  it('is visible and enabled with an ad gate', () => {
    const s = new RewardOfferState(() => quote());
    expect(s.view()).toEqual({ visible: true, enabled: true, busy: false, mode: 'ad', label: 'Watch ad' });
  });

  it('shows the gem price when the gate is gems', () => {
    const s = new RewardOfferState(() => quote({ gate: 'gems', adAvailable: false, canAffordGems: true }), 'Reroll');
    expect(s.view().label).toBe('Reroll - 15 gems');
    expect(s.view().mode).toBe('gems');
  });

  it('hides itself when the gate is none or the reward was claimed', () => {
    expect(new RewardOfferState(() => quote({ gate: 'none' })).view().visible).toBe(false);
    expect(new RewardOfferState(() => quote({ claimed: true })).view().visible).toBe(false);
  });

  it('stays visible but disabled while a claim is pending, even though the service reports none', () => {
    let q = quote();
    const s = new RewardOfferState(() => q);
    expect(s.begin()).toBe(true);
    q = quote({ gate: 'none' }); // RewardService is busy
    expect(s.view()).toMatchObject({ visible: true, enabled: false, busy: true, label: 'Watch ad' });
    expect(s.begin()).toBe(false); // a second tap is ignored
  });

  it('grants only on ok and then hides for good', () => {
    const s = new RewardOfferState(() => quote());
    s.begin();
    const out = s.finish({ ok: true, placement: 'reroll', via: 'ad', gemsSpent: 0 });
    expect(out).toEqual({ granted: true, message: null });
    expect(s.view().visible).toBe(false);
    expect(s.begin()).toBe(false);
  });

  it.each([
    ['cancelled', /no reward/i],
    ['failed', /unavailable/i],
    ['dailyLimit', /limit/i],
  ] as const)('does not grant on %s, toasts and becomes tappable again', (reason, message) => {
    const s = new RewardOfferState(() => quote());
    s.begin();
    const out = s.finish({ ok: false, reason } as ClaimResult);
    expect(out.granted).toBe(false);
    expect(out.message).toMatch(message);
    expect(s.view()).toMatchObject({ visible: true, enabled: true, busy: false });
  });

  it('can be blocked by the scene without hiding', () => {
    const s = new RewardOfferState(() => quote());
    s.setBlocked(true);
    expect(s.view()).toMatchObject({ visible: true, enabled: false });
    expect(s.begin()).toBe(false);
    s.setBlocked(false);
    expect(s.begin()).toBe(true);
  });
});

describe('RewardOfferState with the real RewardService', () => {
  async function setup(provider: MockRewardProvider | NullRewardProvider, gems = 0) {
    const save = new SaveManager(new FakePlatform());
    await save.load();
    save.data.gems = gems;
    const rewards = new RewardService(provider, save);
    const ctx = { runId: 'run1', key: 'upgrade-3' };
    return { rewards, ctx, save };
  }

  it('claims through an ad, grants once, and cannot be claimed again', async () => {
    const provider = new MockRewardProvider({ mode: 'complete', delayMs: 0 });
    const { rewards, ctx } = await setup(provider);
    const state = new RewardOfferState(() => rewards.quote('reroll', ctx));
    expect(state.begin()).toBe(true);
    const result = await rewards.claim('reroll', ctx);
    expect(state.finish(result).granted).toBe(true);
    expect(rewards.quote('reroll', ctx).claimed).toBe(true);
    expect(new RewardOfferState(() => rewards.quote('reroll', ctx)).view().visible).toBe(false);
  });

  it('a cancelled ad grants nothing and the offer is still there', async () => {
    const { rewards, ctx } = await setup(new MockRewardProvider({ mode: 'cancel', delayMs: 0 }));
    const state = new RewardOfferState(() => rewards.quote('reroll', ctx));
    state.begin();
    const out = state.finish(await rewards.claim('reroll', ctx));
    expect(out.granted).toBe(false);
    expect(out.message).toMatch(/no reward/i);
    expect(state.view().visible).toBe(true);
  });

  it('without ads the gem price is offered when affordable, and nothing otherwise', async () => {
    const poor = await setup(new NullRewardProvider(), 0);
    expect(new RewardOfferState(() => poor.rewards.quote('reroll', poor.ctx)).view().visible).toBe(false);
    const rich = await setup(new NullRewardProvider(), 100);
    const v = new RewardOfferState(() => rich.rewards.quote('reroll', rich.ctx)).view();
    expect(v).toMatchObject({ visible: true, mode: 'gems', label: '15 gems' });
  });

  it('doubleGems has no gem alternative: hidden without ads', async () => {
    const { rewards } = await setup(new NullRewardProvider(), 1000);
    expect(new RewardOfferState(() => rewards.quote('doubleGems', { runId: 'run1' })).view().visible).toBe(false);
  });
});
