import { describe, expect, it } from 'vitest';
import { SLOTS } from '../../src/data/map';
import {
  DragMachine, IdMirror, QUALITY_PRESETS, QualityMeter, SfxThrottle, abilityButtonXs, bounceOut, classifyTarget, damageLabel,
  mergeHitstopMs, mergeSound, showDamageNumber, nearestSlot, overlayForPhase, pickTowerSlot, punchScale, resolveDropSlot, shouldOfferEmergency,
  shouldOfferRareTower, tutorialStep, type SlotPos, type TutorialInput,
} from '../../src/game/play/logic';

const POS: SlotPos[] = SLOTS.map((s) => ({ id: s.id, x: s.x, y: s.y }));

describe('slot hit-testing and magnet', () => {
  it('finds the nearest slot within the magnet radius', () => {
    expect(nearestSlot(360, 410, POS)).toBe(5);
    expect(nearestSlot(360 + 40, 410 + 30, POS)).toBe(5);
    expect(nearestSlot(230, 630 - 20, POS)).toBe(7);
  });

  it('returns -1 outside the radius and respects a custom radius', () => {
    expect(nearestSlot(360, 520, POS)).toBe(-1);
    expect(nearestSlot(360, 410 + 50, POS, 40)).toBe(-1);
    expect(nearestSlot(360, 410 + 50, POS, 60)).toBe(5);
  });

  it('picks the closer of two slots', () => {
    // between slot 4 (230,410) and slot 5 (360,410), slightly nearer 5
    expect(nearestSlot(300, 410, POS, 80)).toBe(5);
    expect(nearestSlot(290, 410, POS, 80)).toBe(4);
  });

  it('drops on the lifted tower first, then falls back to the finger', () => {
    // lifted tower over slot 5, finger near slot 8 below it
    expect(resolveDropSlot(360, 420, 360, 600, POS)).toBe(5);
    // lifted tower in the middle of nowhere, finger right on slot 8
    expect(resolveDropSlot(360, 520, 360, 635, POS)).toBe(8);
    // neither
    expect(resolveDropSlot(20, 20, 20, 100, POS)).toBe(-1);
  });

  it('picks a tower by a press on its sprite box (above the pad), not far away', () => {
    expect(pickTowerSlot(360, 410, POS)).toBe(5);
    expect(pickTowerSlot(360, 410 - 70, POS)).toBe(5);
    expect(pickTowerSlot(360, 410 + 90, POS)).toBe(-1);
    expect(pickTowerSlot(360 + 65, 410, POS)).toBe(-1);
  });
});

describe('target classification', () => {
  const slots = [
    { unlocked: true, hasTower: true },
    { unlocked: true, hasTower: true },
    { unlocked: true, hasTower: false },
    { unlocked: false, hasTower: false },
  ];
  const can = (a: number, b: number): boolean => a === 0 && b === 1;
  it('classifies merge, swap, move, locked and self', () => {
    expect(classifyTarget(0, 1, slots, can)).toBe('merge');
    expect(classifyTarget(1, 0, slots, can)).toBe('swap');
    expect(classifyTarget(0, 2, slots, can)).toBe('move');
    expect(classifyTarget(0, 3, slots, can)).toBe('locked');
    expect(classifyTarget(0, 0, slots, can)).toBe('self');
  });
});

describe('drag state machine', () => {
  it('is a tap when released before the threshold', () => {
    const m = new DragMachine(8);
    expect(m.press(1, 5, 100, 100)).toBe(true);
    expect(m.move(1, 104, 103)).toBe('none');
    expect(m.release(1, 104, 103)).toEqual({ kind: 'tap', slot: 5 });
    expect(m.phase).toBe('idle');
  });

  it('lifts after 8 px and then keeps dragging', () => {
    const m = new DragMachine(8);
    m.press(1, 3, 0, 0);
    expect(m.move(1, 5, 5)).toBe('none');
    expect(m.move(1, 8, 8)).toBe('lift');
    expect(m.phase).toBe('dragging');
    expect(m.move(1, 50, 50)).toBe('drag');
    expect(m.release(1, 60, 60)).toEqual({ kind: 'drop', slot: 3 });
  });

  it('follows one pointer only and ignores a second press', () => {
    const m = new DragMachine(8);
    expect(m.press(1, 2, 0, 0)).toBe(true);
    expect(m.press(2, 4, 50, 50)).toBe(false);
    expect(m.move(2, 200, 200)).toBe('none');
    expect(m.release(2, 200, 200)).toEqual({ kind: 'none' });
    expect(m.phase).toBe('pressed');
  });

  it('cancels cleanly and allows a new drag', () => {
    const m = new DragMachine(8);
    m.press(1, 2, 0, 0);
    m.move(1, 40, 40);
    m.cancel();
    expect(m.phase).toBe('idle');
    expect(m.release(1, 0, 0)).toEqual({ kind: 'none' });
    expect(m.press(3, 6, 0, 0)).toBe(true);
  });

  it('refuses to press without a slot', () => {
    expect(new DragMachine().press(1, -1, 0, 0)).toBe(false);
  });
});

describe('pool index mirroring', () => {
  it('reports spawn, keep, despawn and idle', () => {
    const m = new IdMirror(4);
    expect(m.sync(0, false, 0)).toBe('idle');
    expect(m.sync(0, true, 10)).toBe('spawn');
    expect(m.isShown(0)).toBe(true);
    expect(m.sync(0, true, 10)).toBe('keep');
    expect(m.sync(0, false, 10)).toBe('despawn');
    expect(m.sync(0, false, 10)).toBe('idle');
  });

  it('resets when the id changes at the same index', () => {
    const m = new IdMirror(2);
    m.sync(1, true, 7);
    expect(m.sync(1, true, 8)).toBe('spawn');
    expect(m.sync(1, true, 8)).toBe('keep');
  });

  it('re-spawns a reused id after it went inactive', () => {
    const m = new IdMirror(1);
    m.sync(0, true, 3);
    m.sync(0, false, 3);
    expect(m.sync(0, true, 3)).toBe('spawn');
  });
});

describe('quality meter', () => {
  const feed = (q: QualityMeter, fps: number, seconds: number): void => {
    const n = Math.round(seconds * fps);
    for (let i = 0; i < n; i++) q.push(1000 / fps);
  };

  it('stays high at 60 fps', () => {
    const q = new QualityMeter();
    feed(q, 60, 10);
    expect(q.level).toBe(0);
    expect(q.fps).toBeGreaterThan(55);
  });

  it('degrades below ~48 fps and keeps going while it stays slow', () => {
    const q = new QualityMeter();
    feed(q, 30, 6);
    expect(q.level).toBeGreaterThanOrEqual(1);
    feed(q, 30, 8);
    expect(q.level).toBe(QUALITY_PRESETS.length - 1);
  });

  it('ignores the warmup and long hitches', () => {
    const q = new QualityMeter();
    feed(q, 20, 1.5);
    expect(q.level).toBe(0);
    const r = new QualityMeter();
    for (let i = 0; i < 400; i++) r.push(1000);
    expect(r.level).toBe(0);
  });

  it('recovers after a long good stretch', () => {
    const q = new QualityMeter();
    feed(q, 30, 6);
    const low = q.level;
    expect(low).toBeGreaterThan(0);
    feed(q, 60, 30);
    expect(q.level).toBeLessThan(low);
  });

  it('can be pinned and presets get cheaper', () => {
    const q = new QualityMeter();
    q.lock(2);
    feed(q, 60, 20);
    expect(q.level).toBe(2);
    expect(QUALITY_PRESETS[2].particles).toBeLessThan(QUALITY_PRESETS[0].particles);
    expect(QUALITY_PRESETS[2].damageNumbers).toBeLessThan(QUALITY_PRESETS[0].damageNumbers);
    expect(QUALITY_PRESETS[2].trails).toBe(false);
  });
});

describe('sfx throttle', () => {
  it('enforces the gap per key and a per-frame cap', () => {
    const t = new SfxThrottle(2);
    expect(t.allow('a', 0, 50, 1)).toBe(true);
    expect(t.allow('a', 20, 50, 1)).toBe(false);
    expect(t.allow('b', 20, 0, 1)).toBe(true);
    expect(t.allow('c', 20, 0, 1)).toBe(false); // frame cap of 2 reached
    expect(t.allow('c', 21, 0, 2)).toBe(true); // next frame
    expect(t.allow('a', 80, 50, 3)).toBe(true);
  });
});

describe('merge feel', () => {
  it('pitches up with level and switches to the big sound for L4-L5', () => {
    expect(mergeSound(2).key).toBe('merge');
    expect(mergeSound(3).rate).toBeGreaterThan(mergeSound(2).rate);
    expect(mergeSound(4).key).toBe('merge_big');
    expect(mergeSound(5).key).toBe('merge_big');
  });

  it('keeps hitstop between 50 and 80 ms', () => {
    for (let l = 2; l <= 5; l++) {
      expect(mergeHitstopMs(l)).toBeGreaterThanOrEqual(50);
      expect(mergeHitstopMs(l)).toBeLessThanOrEqual(80);
    }
  });

  it('punches from 0.6 up past 1.2 and settles at 1', () => {
    expect(punchScale(0)).toBeCloseTo(0.6);
    expect(punchScale(0.16)).toBeCloseTo(1.25, 1);
    expect(punchScale(0.9)).toBeCloseTo(1, 2);
    expect(bounceOut(0)).toBe(0);
    expect(bounceOut(1)).toBeCloseTo(1, 2);
  });
});

describe('tutorial and overlays', () => {
  const base: TutorialInput = {
    firstRunDone: false, mergeHintShown: false, towersBought: 0, towersMerged: 0, wave: 1, coins: 120, buyCost: 36, hasFreeSlot: true, hasPair: false,
  };
  it('asks to buy first, then to merge once a pair exists', () => {
    expect(tutorialStep(base)).toBe('buy');
    expect(tutorialStep({ ...base, towersBought: 1 })).toBe('none');
    expect(tutorialStep({ ...base, towersBought: 1, hasPair: true })).toBe('merge');
  });
  it('is silent after the first run, after a merge, or when buying is impossible', () => {
    expect(tutorialStep({ ...base, firstRunDone: true })).toBe('none');
    expect(tutorialStep({ ...base, hasPair: true, towersMerged: 1 })).toBe('none');
    expect(tutorialStep({ ...base, coins: 5 })).toBe('none');
    expect(tutorialStep({ ...base, hasFreeSlot: false })).toBe('none');
    expect(tutorialStep({ ...base, wave: 10 })).toBe('none');
  });
  it('maps phases to blocking overlays', () => {
    expect(overlayForPhase('upgrade')).toBe('Upgrade');
    expect(overlayForPhase('event')).toBe('Event');
    expect(overlayForPhase('defeated')).toBe('GameOver');
    expect(overlayForPhase('over')).toBeNull();
    expect(overlayForPhase('wave')).toBeNull();
    expect(overlayForPhase('prewave')).toBeNull();
  });
  it('gates reward offers', () => {
    expect(shouldOfferRareTower('ad', true)).toBe(true);
    expect(shouldOfferRareTower('gems', false)).toBe(false);
    expect(shouldOfferRareTower('none', true)).toBe(false);
    expect(shouldOfferEmergency('ad', true, false)).toBe(true);
    expect(shouldOfferEmergency('ad', true, true)).toBe(false);
    expect(shouldOfferEmergency('ad', false, false)).toBe(false);
    expect(shouldOfferEmergency('none', true, false)).toBe(false);
  });
});

describe('damage number clutter', () => {
  it('shows everything on a quiet screen and crits always', () => {
    expect(showDamageNumber(1, 500, 2, false)).toBe(true);
    expect(showDamageNumber(1, 500, 30, true)).toBe(true);
  });
  it('drops small hits relative to the biggest recent hit in a crowd', () => {
    expect(showDamageNumber(10, 500, 8, false)).toBe(false);
    expect(showDamageNumber(120, 500, 8, false)).toBe(true);
    expect(showDamageNumber(120, 500, 14, false)).toBe(false);
    expect(showDamageNumber(200, 500, 14, false)).toBe(true);
  });
});

describe('small helpers', () => {
  it('lays ability buttons out nearest the BUY button first', () => {
    expect(abilityButtonXs(0)).toEqual([]);
    expect(abilityButtonXs(2)).toEqual([165, 555]);
    expect(abilityButtonXs(4)).toHaveLength(4);
    expect(new Set(abilityButtonXs(4)).size).toBe(4);
  });
  it('formats damage', () => {
    expect(damageLabel(12.4)).toBe('12');
    expect(damageLabel(0.2)).toBe('1');
    expect(damageLabel(15300)).toBe('15.3k');
    expect(damageLabel(250000)).toBe('250k');
  });
});
