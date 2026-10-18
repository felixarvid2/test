import { describe, expect, it, vi } from 'vitest';

// Fixture towers: only cannon and poison cannot hit air.
vi.mock('../../src/data/towers', () => ({
  TOWERS: {
    arrow: { hitsAir: true }, cannon: { hitsAir: false }, frost: { hitsAir: true }, lightning: { hitsAir: true },
    fire: { hitsAir: true }, poison: { hitsAir: false }, sniper: { hitsAir: true }, magic: { hitsAir: true },
  },
}));

const { defaultSave, migrate, repairLoadout } = await import('../../src/save/SaveManager');
const catalog = { metaMax: {}, achievementIds: [] };
const mig = (raw: unknown) => migrate(raw, catalog);
const START = ['arrow', 'cannon', 'frost'] as const;
const ALL = ['arrow', 'cannon', 'frost', 'lightning', 'fire', 'poison', 'sniper', 'magic'] as const;

describe('loadout default and repair', () => {
  it('a fresh save has the three start towers as its loadout', () => {
    expect(defaultSave().loadout).toEqual(['arrow', 'cannon', 'frost']);
  });

  it('migrates an old save without the field: filled to min(4, unlocked) in tower order', () => {
    expect(mig({ gems: 5 }).loadout).toEqual(['arrow', 'cannon', 'frost']);
    expect(mig({ unlockedTowers: ['fire', 'lightning', 'sniper'] }).loadout).toEqual(['arrow', 'cannon', 'frost', 'lightning']);
  });

  it('keeps a stored valid loadout, including a 3-tower choice with more towers unlocked', () => {
    const s = mig({ unlockedTowers: [...ALL], loadout: ['fire', 'arrow', 'sniper'] });
    expect(s.loadout).toEqual(['fire', 'arrow', 'sniper']);
    expect(mig(JSON.parse(JSON.stringify(s))).loadout).toEqual(s.loadout);
  });

  it('drops locked, unknown, duplicate and non-string ids and truncates to 4', () => {
    const s = mig({
      unlockedTowers: ['fire', 'lightning', 'sniper', 'magic'],
      loadout: ['fire', 'fire', 'dragon', 7, 'poison', 'lightning', 'sniper', 'magic', 'arrow'],
    });
    expect(s.loadout).toEqual(['fire', 'lightning', 'sniper', 'magic']);
  });

  it('tops up from the unlocked towers in TOWER_IDS order', () => {
    expect(mig({ unlockedTowers: ['fire'], loadout: ['fire'] }).loadout).toEqual(['fire', 'arrow', 'cannon']);
    expect(mig({ loadout: [] }).loadout).toEqual([...START]);
    expect(mig({ loadout: 'x' }).loadout).toEqual([...START]);
  });

  it('guarantees an air-capable tower: swaps the last entry for the first unlocked one', () => {
    const s = mig({ unlockedTowers: ['poison', 'fire'], loadout: ['cannon', 'poison'] });
    // cannon, poison, then topped up with arrow (air) already satisfies it
    expect(s.loadout).toEqual(['cannon', 'poison', 'arrow']);
    const t = mig({ unlockedTowers: ['poison'], loadout: ['cannon', 'poison', 'frost'] });
    expect(t.loadout).toContain('frost');
    // no air in the kept entries at all
    expect(repairLoadout(['cannon', 'poison'], ['arrow', 'cannon', 'poison'], 2)).toEqual(['cannon', 'arrow']);
  });

  it('repairLoadout never exceeds the unlocked count or the size', () => {
    expect(repairLoadout([], ['arrow', 'cannon'])).toEqual(['arrow', 'cannon']);
    expect(repairLoadout(ALL, ALL)).toHaveLength(4);
    expect(repairLoadout(['arrow'], ['arrow'])).toEqual(['arrow']);
  });
});
