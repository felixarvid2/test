import { describe, expect, it } from 'vitest';
import { dailyChallenge, recordDaily } from '../src/core/daily';
import { UPGRADE_BY_ID } from '../src/data/upgrades';
import { defaultSave } from '../src/save/SaveManager';

describe('dailyChallenge', () => {
  it('is identical for the same date', () => {
    expect(dailyChallenge('2026-06-01')).toEqual(dailyChallenge('2026-06-01'));
    const c = dailyChallenge('2026-06-01');
    expect(c.key).toBe('2026-06-01');
    expect(['knight', 'ranger', 'mage']).toContain(c.hero);
    expect(UPGRADE_BY_ID[c.startUpgrade]).toBeDefined();
    expect(c.modifier.length).toBeGreaterThan(0);
    expect(c.modifierName.length).toBeGreaterThan(0);
  });

  it('differs across dates', () => {
    const keys = Array.from({ length: 30 }, (_, i) => `2026-07-${String(i + 1).padStart(2, '0')}`);
    const seeds = new Set(keys.map((k) => dailyChallenge(k).seed));
    expect(seeds.size).toBe(keys.length);
    expect(dailyChallenge('2026-07-01')).not.toEqual(dailyChallenge('2026-07-02'));
    expect(new Set(keys.map((k) => dailyChallenge(k).hero)).size).toBeGreaterThan(1);
    expect(new Set(keys.map((k) => dailyChallenge(k).modifierName)).size).toBeGreaterThan(1);
    expect(new Set(keys.map((k) => dailyChallenge(k).startUpgrade)).size).toBeGreaterThan(1);
  });

  it('defaults to today', () => {
    expect(dailyChallenge().key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('recordDaily', () => {
  it('keeps the best result, counts attempts and completes a day once', () => {
    const save = defaultSave();
    recordDaily(save, '2026-06-01', 4, 50);
    expect(save.daily['2026-06-01']).toEqual({ bestRoom: 5, kills: 50, attempts: 1 });
    expect(save.stats.dailyCompleted).toBe(1);
    recordDaily(save, '2026-06-01', 2, 80);
    expect(save.daily['2026-06-01']).toEqual({ bestRoom: 5, kills: 80, attempts: 2 });
    expect(save.stats.dailyCompleted).toBe(1);
    recordDaily(save, '2026-06-02', 0, 1);
    expect(save.stats.dailyCompleted).toBe(2);
  });

  it('prunes to the last 30 days', () => {
    const save = defaultSave();
    for (let i = 1; i <= 40; i++) recordDaily(save, `2026-05-${String(i).padStart(2, '0')}`, 1, 1);
    expect(Object.keys(save.daily)).toHaveLength(30);
    expect(save.daily['2026-05-01']).toBeUndefined();
    expect(save.daily['2026-05-40']).toBeDefined();
  });
});
