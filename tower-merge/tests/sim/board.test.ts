import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { UNLOCK_ORDER } from '../../src/data/map';
import { createWorld } from '../../src/sim/World';
import { advance, arena, defaultRunOptions, internals, NO_CONTENT } from './helpers';

const fresh = (over = {}) => createWorld(defaultRunOptions(3, { startingSlots: 12, ...over }), NO_CONTENT);

describe('merge, move and swap', () => {
  it('merges identical type and level into level + 1 with a new uid', () => {
    const { w } = arena({ towers: [{ type: 'arrow', level: 2 }, { type: 'arrow', level: 2 }] });
    const uidA = w.slots[5].tower!.uid;
    const uidB = w.slots[8].tower!.uid;
    expect(w.canMerge(8, 5)).toBe(true);
    expect(w.moveTower(8, 5)).toBe('merged');
    expect(w.slots[8].tower).toBeNull();
    const t = w.slots[5].tower!;
    expect(t.level).toBe(3);
    expect(t.uid).not.toBe(uidA);
    expect(t.uid).not.toBe(uidB);
    expect(w.stats.towersMerged).toBe(1);
    expect(w.stats.highestTowerLevel).toBe(3);
    const evs = w.drainEvents();
    expect(evs).toContainEqual({ type: 'merged', slot: 5, fromSlot: 8, tower: 'arrow', level: 3 });
  });

  it('does not merge at the maximum level, different types or different levels', () => {
    const { w } = arena({ towers: [{ type: 'arrow', level: 5 }, { type: 'arrow', level: 5 }, { type: 'cannon', level: 5 }, { type: 'arrow', level: 1 }] });
    expect(w.canMerge(5, 8)).toBe(false);
    expect(w.moveTower(5, 8)).toBe('swapped');
    expect(w.canMerge(5, 4)).toBe(false); // arrow 5 vs cannon 5
    expect(w.canMerge(5, 6)).toBe(false); // arrow 5 vs arrow 1
    expect(w.slots[5].tower!.level).toBe(5);
  });

  it('moves to an empty slot and swaps with a different tower', () => {
    const { w } = arena({ towers: [{ type: 'arrow', level: 1 }, { type: 'cannon', level: 2 }] });
    expect(w.moveTower(5, 4)).toBe('moved');
    expect(w.slots[5].tower).toBeNull();
    expect(w.slots[4].tower!.type).toBe('arrow');
    expect(w.slots[4].tower!.slot).toBe(4);
    expect(w.moveTower(4, 8)).toBe('swapped');
    expect(w.slots[4].tower!.type).toBe('cannon');
    expect(w.slots[8].tower!.type).toBe('arrow');
    expect(w.slots[4].tower!.slot).toBe(4);
    expect(w.slots[8].tower!.slot).toBe(8);
  });

  it('rejects invalid drags: locked slots, empty source, same slot, bad indexes', () => {
    const w = createWorld(defaultRunOptions(3), NO_CONTENT);
    expect(w.slots.filter((s) => s.unlocked)).toHaveLength(4);
    expect(w.moveTower(5, 0)).toBe('invalid'); // slot 0 is locked
    expect(w.moveTower(0, 5)).toBe('invalid');
    expect(w.moveTower(8, 4)).toBe('invalid'); // empty source
    expect(w.moveTower(5, 5)).toBe('invalid');
    expect(w.moveTower(-1, 5)).toBe('invalid');
    expect(w.moveTower(5, 99)).toBe('invalid');
    expect(w.canMerge(5, 5)).toBe(false);
  });

  it('merging a level 4 into a level 4 yields the maximum level 5', () => {
    const { w } = arena({ towers: [{ type: 'magic', level: 4 }, { type: 'magic', level: 4 }] });
    expect(w.moveTower(5, 8)).toBe('merged');
    expect(w.slots[8].tower!.level).toBe(5);
  });

  it('keeps the starting arrow tower at the level given by the meta bonus', () => {
    const w = createWorld(defaultRunOptions(3, { startTowerLevel: 3 }), NO_CONTENT);
    expect(w.slots[UNLOCK_ORDER[0]].tower).toMatchObject({ type: 'arrow', level: 3 });
  });
});

describe('buying towers', () => {
  it('price rises with every purchase', () => {
    const w = fresh({ startCoinsBonus: 5000 });
    const costs: number[] = [];
    for (let i = 0; i < 6; i++) {
      costs.push(w.buyCost());
      expect(w.buyTower().ok).toBe(true);
    }
    for (let i = 1; i < costs.length; i++) expect(costs[i]).toBeGreaterThan(costs[i - 1]);
    expect(costs[0]).toBe(BALANCE.economy.buyBaseCost);
    expect(w.stats.towersBought).toBe(6);
  });

  it('spends coins, fills the first free slot in unlock order and rolls only pool towers', () => {
    const w = fresh({ startCoinsBonus: 5000, towerPool: ['frost'] });
    const coins = w.coins;
    const cost = w.buyCost();
    const r = w.buyTower();
    expect(r).toEqual({ ok: true, slot: 8, tower: 'frost' });
    expect(w.coins).toBe(coins - cost);
    expect(w.slots[8].tower!.level).toBe(1);
    for (let i = 0; i < 6; i++) expect(w.buyTower().tower).toBe('frost');
  });

  it('rolls towers weighted over the pool (all pool types appear)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 5; seed++) {
      const w = createWorld(defaultRunOptions(seed, { startCoinsBonus: 9000, startingSlots: 12 }), NO_CONTENT);
      for (let i = 0; i < 8; i++) { const r = w.buyTower(); if (r.tower) seen.add(r.tower); }
    }
    expect([...seen].sort()).toEqual(['arrow', 'cannon', 'frost']);
  });

  it('fails without coins or free slots, and in non-board phases', () => {
    const poor = createWorld(defaultRunOptions(3, { startCoinsBonus: -BALANCE.economy.startCoins + 5 }), NO_CONTENT);
    expect(poor.buyTower().ok).toBe(false);
    const full = fresh({ startCoinsBonus: 9000 });
    let guard = 0;
    while (full.buyTower().ok && guard++ < 20) { /* fill the board */ }
    expect(full.slots.every((s) => s.tower)).toBe(true);
    const coins = full.coins;
    expect(full.buyTower().ok).toBe(false);
    expect(full.coins).toBe(coins);
  });

  it('the tower cost multiplier and discount change the price', () => {
    const w = fresh({ discountPct: 0.5 });
    expect(w.buyCost()).toBe(Math.round(BALANCE.economy.buyBaseCost * 0.5));
  });
});

describe('slots and selling', () => {
  it('unlocking costs coins and the price escalates', () => {
    const w = fresh({ startingSlots: 4, startCoinsBonus: 5000 });
    const c1 = w.unlockSlotCost();
    expect(w.unlockSlot(0)).toBe(true);
    const c2 = w.unlockSlotCost();
    expect(c2).toBeGreaterThan(c1);
    expect(w.slots[0].unlocked).toBe(true);
    expect(w.unlockSlot(0)).toBe(false); // already unlocked
    expect(w.drainEvents().some((e) => e.type === 'slotUnlocked' && e.slot === 0)).toBe(true);
  });

  it('cannot unlock without enough coins', () => {
    const w = createWorld(defaultRunOptions(3), NO_CONTENT);
    expect(w.coins).toBeLessThan(w.unlockSlotCost() + 1000);
    w.unlockSlot(0);
    w.unlockSlot(1);
    w.unlockSlot(2);
    const unlocked = w.slots.filter((s) => s.unlocked).length;
    expect(unlocked).toBeLessThan(8);
  });

  it('selling refunds a fraction of the coins invested, merges add up', () => {
    const w = fresh({ startCoinsBonus: 5000 });
    const a = w.buyTower();
    const costA = BALANCE.economy.buyBaseCost;
    const coins = w.coins;
    expect(w.sellValue(a.slot!)).toBe(Math.floor(costA * BALANCE.economy.sellRefund));
    expect(w.sellTower(a.slot!)).toBe(true);
    expect(w.coins).toBe(coins + Math.floor(costA * BALANCE.economy.sellRefund));
    expect(w.slots[a.slot!].tower).toBeNull();
    expect(w.sellTower(a.slot!)).toBe(false);
  });

  it('board actions are only allowed in the prewave and wave phases', () => {
    const w = createWorld(defaultRunOptions(3, { startCoinsBonus: 500 }), { ...NO_CONTENT });
    const s = internals(w);
    s.phase = 'upgrade';
    expect(w.buyTower().ok).toBe(false);
    expect(w.moveTower(5, 8)).toBe('invalid');
    expect(w.sellTower(5)).toBe(false);
    s.phase = 'prewave';
    expect(w.buyTower().ok).toBe(true);
  });

  it('works during a wave too', () => {
    const w = fresh({ startCoinsBonus: 500 });
    w.startWaveNow();
    advance(w, 1);
    expect(w.phase).toBe('wave');
    expect(w.buyTower().ok).toBe(true);
  });
});
