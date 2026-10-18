import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { EVENTS } from '../../src/data/events';
import { MAX_TOWER_LEVEL } from '../../src/data/types';
import { defaultRunOptions } from '../../src/sim/bot';
import { grantedValue } from '../../src/sim/board';
import { createWorld } from '../../src/sim/World';
import { loopTests } from '../../tools/balance/economy';

const NO_CONTENT = { upgrades: [], synergies: [], events: [] };

describe('economy', () => {
  it('selling always returns less than was paid, for every tower on the board', () => {
    const w = createWorld(defaultRunOptions(9, { startCoinsBonus: 5000, startingSlots: 12, towerPool: ['arrow', 'cannon', 'frost', 'fire'] }), NO_CONTENT);
    expect(BALANCE.economy.sellRefund).toBeLessThan(1);
    for (let i = 0; i < 11; i++) {
      const cost = w.buyCost();
      const b = w.buyTower();
      expect(b.ok).toBe(true);
      expect(w.sellValue(b.slot as number)).toBeLessThan(cost);
    }
    // merged towers sell for less than the sum of their price
    let paid = 0;
    const merged = createWorld(defaultRunOptions(9, { startCoinsBonus: 5000, towerPool: ['arrow'] }), NO_CONTENT);
    merged.sellTower(5);
    const a = (paid += merged.buyCost(), merged.buyTower());
    const b = (paid += merged.buyCost(), merged.buyTower());
    expect(merged.moveTower(a.slot as number, b.slot as number)).toBe('merged');
    expect(merged.sellValue(b.slot as number)).toBeLessThan(paid);
  });

  it('buy/sell and buy/merge/sell loops lose coins, so they cannot be farmed', () => {
    const loops = loopTests();
    expect(loops.buySell).toBeLessThan(-5);
    expect(loops.buyMergeSell).toBeLessThan(-10);
  });

  it('free towers are worth little when sold and never more than the merchant charges for them', () => {
    const loops = loopTests();
    const merchant = EVENTS.find((e) => e.id === 'merchant')!.options.find((o) => o.id === 'buyTower')!;
    expect(loops.grantedL2Sell).toBeLessThan(merchant.cost as number);
    for (let l = 1; l <= MAX_TOWER_LEVEL; l++) {
      expect(Math.floor(grantedValue(l) * BALANCE.economy.sellRefund)).toBeLessThan(grantedValue(l));
    }
  });

  it('tower prices grow monotonically and a slot costs more than the tower it holds', () => {
    let prev = 0;
    for (let n = 0; n < 40; n++) {
      const cost = Math.max(BALANCE.economy.buyMinCost, Math.round(BALANCE.economy.buyBaseCost * BALANCE.economy.buyGrowth ** n));
      expect(cost).toBeGreaterThanOrEqual(prev);
      prev = cost;
    }
    expect(BALANCE.economy.slotUnlockBase).toBeGreaterThan(BALANCE.economy.buyBaseCost);
    expect(BALANCE.economy.slotUnlockGrowth).toBeGreaterThan(BALANCE.economy.buyGrowth);
  });

  it('no event hands out more than a couple of towers worth of coins', () => {
    for (const ev of EVENTS) {
      for (const o of ev.options) {
        for (const e of o.effects ?? []) {
          if (e.kind === 'instant' && e.action === 'grantCoins') expect(e.value).toBeLessThanOrEqual(200);
        }
      }
    }
    expect(BALANCE.upgrades.fallbackCoins.every((c) => c <= 250)).toBe(true);
  });
});
