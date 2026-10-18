import { describe, expect, it } from 'vitest';
import { EVENTS } from '../../src/data/events';
import type { EventOption } from '../../src/data/types';
import { UPGRADES } from '../../src/data/upgrades';
import {
  VICTORY_WAVE, buildResultRows, canAffordOption, chestLayout, claimFailureMessage, countTaken, countUpValue, countdownFraction,
  countdownSeconds, eventOptionIcon, gemsLabel, hasFreeSlot, isVictory, offerLabel, percentLabel, pickRewardTower, reviveOfferAvailable,
  sliderValue, stackInfo, upgradeInventory,
} from '../../src/game/overlays/logic';
import { createFakeWorld, fakeRunStats, fakeSlots } from '../../src/game/overlays/fakeWorld';
import { ICON_KEYS } from '../../src/data/types';

describe('upgrade stacks', () => {
  it('counts taken upgrades', () => {
    const m = countTaken(['a', 'b', 'a']);
    expect(m.get('a')).toBe(2);
    expect(m.get('b')).toBe(1);
    expect(m.get('c')).toBeUndefined();
  });

  it('shows no label for an upgrade that was not taken', () => {
    expect(stackInfo('a', 3, ['b'])).toEqual({ owned: 0, next: 1, max: 3, label: null });
  });

  it('labels the stack level a pick would reach', () => {
    expect(stackInfo('a', 3, ['a']).label).toBe('Stack 2/3');
    expect(stackInfo('a', 3, ['a', 'a']).label).toBe('Stack 3/3');
  });

  it('never shows a label for unique upgrades and never exceeds max', () => {
    expect(stackInfo('a', 1, ['a']).label).toBeNull();
    expect(stackInfo('a', 2, ['a', 'a', 'a']).next).toBe(2);
  });

  it('lists distinct upgrades in first-taken order and skips unknown ids', () => {
    const lookup = (id: string) => (id === 'x' ? undefined : { id });
    const inv = upgradeInventory(['b', 'a', 'b', 'x'], lookup);
    expect(inv.map((e) => [e.def.id, e.count])).toEqual([['b', 2], ['a', 1]]);
  });

  it('works with the real upgrade data', () => {
    const u = UPGRADES[0];
    expect(stackInfo(u.id, u.maxStacks, [u.id]).owned).toBe(1);
  });
});

describe('events', () => {
  const opt = (over: Partial<EventOption>): EventOption => ({ id: 'o', label: 'O', description: '', ...over });

  it('disables an option the player cannot afford', () => {
    expect(canAffordOption(opt({ cost: 90 }), 89)).toBe(false);
    expect(canAffordOption(opt({ cost: 90 }), 90)).toBe(true);
    expect(canAffordOption(opt({}), 0)).toBe(true);
  });

  it('turns the rolled chest options into chests plus the leave button', () => {
    const def = EVENTS.find((e) => e.id === 'chest')!;
    const rolled = [def.options[0], def.options[2], def.options[4], def.options[6]];
    const layout = chestLayout({ id: 'chest', options: rolled });
    expect(layout.chests.map((o) => o.id)).toEqual(['coins', 'heal', 'epicUpgrade']);
    expect(layout.leave?.id).toBe('leave');
  });

  it('does not make chests for other events', () => {
    const def = EVENTS.find((e) => e.id === 'merchant')!;
    expect(chestLayout({ id: 'merchant', options: def.options })).toEqual({ chests: [], leave: null });
    expect(chestLayout({ id: 'chest', options: [opt({})] })).toEqual({ chests: [], leave: null });
  });

  it('gives every option of every event a real icon', () => {
    for (const ev of EVENTS) for (const o of ev.options) expect(ICON_KEYS).toContain(eventOptionIcon(o));
  });
});

describe('rewards', () => {
  it('finds a free unlocked slot', () => {
    expect(hasFreeSlot(fakeSlots(8, 5))).toBe(true);
    expect(hasFreeSlot(fakeSlots(6, 6))).toBe(false);
    expect(hasFreeSlot([])).toBe(false);
  });

  it('picks a tower from the pool', () => {
    expect(pickRewardTower(['arrow', 'frost', 'magic'], 0)).toBe('arrow');
    expect(pickRewardTower(['arrow', 'frost', 'magic'], 0.5)).toBe('frost');
    expect(pickRewardTower(['arrow', 'frost', 'magic'], 0.999)).toBe('magic');
    expect(pickRewardTower([], 0.3)).toBeNull();
  });

  it('offers revive only when defeated, not revived, and the gate is open', () => {
    const w = createFakeWorld({ phase: 'defeated' });
    expect(reviveOfferAvailable(w, 'ad')).toBe(true);
    expect(reviveOfferAvailable(w, 'gems')).toBe(true);
    expect(reviveOfferAvailable(w, 'none')).toBe(false);
    expect(reviveOfferAvailable(createFakeWorld({ phase: 'defeated', revived: true }), 'ad')).toBe(false);
    expect(reviveOfferAvailable(createFakeWorld({ phase: 'over' }), 'ad')).toBe(false);
  });
});

describe('labels and messages', () => {
  it('labels the offer by mode', () => {
    expect(offerLabel('ad', { gemCost: 15 })).toBe('Watch ad');
    expect(offerLabel('gems', { gemCost: 15 })).toBe('15 gems');
    expect(offerLabel('gems', { gemCost: 1 }, 'Reroll')).toBe('Reroll - 1 gem');
    expect(gemsLabel(null)).toBe('0 gems');
  });

  it('has a message for every failure except already-claimed', () => {
    expect(claimFailureMessage('cancelled')).toMatch(/no reward/i);
    expect(claimFailureMessage('failed')).toBeTruthy();
    expect(claimFailureMessage('alreadyClaimed')).toBeNull();
  });
});

describe('results', () => {
  it('says victory from wave 15', () => {
    expect(isVictory(VICTORY_WAVE - 1)).toBe(false);
    expect(isVictory(VICTORY_WAVE)).toBe(true);
  });

  it('builds the six count-up rows from the run stats', () => {
    const rows = buildResultRows(fakeRunStats({ wave: 9, enemiesKilled: 100, towersMerged: 7, highestTowerLevel: 3, coinsEarned: 500 }), 40, 0);
    expect(rows.map((r) => [r.key, r.value])).toEqual([
      ['wave', 9], ['kills', 100], ['merges', 7], ['level', 3], ['coins', 500], ['gems', 40],
    ]);
    expect(rows[5].label).toBe('Gems earned');
  });

  it('mentions the achievement bonus in the gems row', () => {
    const rows = buildResultRows(fakeRunStats(), 65, 25);
    expect(rows[5].label).toBe('Gems (+25 bonus)');
    expect(rows[5].value).toBe(65);
  });

  it('counts up with ease-out and clamps', () => {
    expect(countUpValue(100, 0)).toBe(0);
    expect(countUpValue(100, 1)).toBe(100);
    expect(countUpValue(100, 0.5)).toBeGreaterThan(50);
    expect(countUpValue(100, 2)).toBe(100);
    expect(countUpValue(100, -1)).toBe(0);
  });

  it('computes the revive countdown', () => {
    expect(countdownFraction(8, 8)).toBe(1);
    expect(countdownFraction(2, 8)).toBe(0.25);
    expect(countdownFraction(-1, 8)).toBe(0);
    expect(countdownFraction(1, 0)).toBe(0);
    expect(countdownSeconds(8)).toBe(8);
    expect(countdownSeconds(7.2)).toBe(8);
    expect(countdownSeconds(0.01)).toBe(1);
    expect(countdownSeconds(0)).toBe(0);
  });
});

describe('pause sliders', () => {
  it('maps the pointer to a snapped 0..1 volume', () => {
    expect(sliderValue(250, 250, 320)).toBe(0);
    expect(sliderValue(570, 250, 320)).toBe(1);
    expect(sliderValue(410, 250, 320)).toBe(0.5);
    expect(sliderValue(9999, 250, 320)).toBe(1);
    expect(sliderValue(-50, 250, 320)).toBe(0);
    expect(sliderValue(260, 250, 320, 0.05)).toBe(0.05);
    expect(sliderValue(5, 0, 0)).toBe(0);
    expect(percentLabel(0.55)).toBe('55%');
  });
});
