import { describe, expect, it } from 'vitest';
import { buyHero, buyMeta, canBuyMeta, extraChoices, freeRerolls, metaCost, metaEffects, runGoldReward } from '../src/core/meta';
import { HEROES } from '../src/data/heroes';
import { META_BY_ID, META_UPGRADES } from '../src/data/meta';
import { defaultSave } from '../src/save/SaveManager';

describe('meta shop', () => {
  it('costs strictly increase with level for every leveled upgrade', () => {
    for (const m of META_UPGRADES.filter((x) => x.maxLevel > 1)) {
      for (let l = 1; l < m.maxLevel; l++) expect(metaCost(m, l)).toBeGreaterThan(metaCost(m, l - 1));
    }
    expect(metaCost(META_BY_ID.vitality, 0)).toBe(META_BY_ID.vitality.baseCost);
    expect(metaCost(META_BY_ID.vitality, 2)).toBe(Math.round(META_BY_ID.vitality.baseCost * META_BY_ID.vitality.costGrowth ** 2));
  });

  it('defines the required permanent upgrades', () => {
    expect(META_BY_ID.vitality).toMatchObject({ maxLevel: 10, effects: [{ stat: 'maxHp', add: 10 }] });
    expect(META_BY_ID.might).toMatchObject({ maxLevel: 10, effects: [{ stat: 'damageMult', pct: 0.05 }] });
    for (const id of ['swiftness', 'precision', 'fortune', 'wisdom']) expect(META_BY_ID[id].maxLevel).toBe(5);
    expect(META_BY_ID.armory_bow.special).toBe('unlockBow');
    expect(META_BY_ID.armory_staff.special).toBe('unlockStaff');
    expect(META_BY_ID.insight.special).toBe('extraChoice');
    expect(META_BY_ID.second_wind).toMatchObject({ special: 'reroll', maxLevel: 2 });
  });

  it('purchases deduct gold, raise the level and stop at the maximum', () => {
    const save = defaultSave();
    save.gold = 1000;
    expect(canBuyMeta(save, 'vitality')).toBe(true);
    const cost = metaCost(META_BY_ID.vitality, 0);
    expect(buyMeta(save, 'vitality')).toBe(true);
    expect(save.gold).toBe(1000 - cost);
    expect(save.meta.vitality).toBe(1);
    const cost2 = metaCost(META_BY_ID.vitality, 1);
    expect(buyMeta(save, 'vitality')).toBe(true);
    expect(save.gold).toBe(1000 - cost - cost2);
    save.gold = 0;
    expect(canBuyMeta(save, 'vitality')).toBe(false);
    expect(buyMeta(save, 'vitality')).toBe(false);
    expect(save.meta.vitality).toBe(2);
    save.gold = 1e9;
    for (let i = 0; i < 30; i++) buyMeta(save, 'vitality');
    expect(save.meta.vitality).toBe(10);
    expect(canBuyMeta(save, 'vitality')).toBe(false);
    expect(buyMeta(save, 'nonexistent')).toBe(false);
  });

  it('armory purchases unlock the weapons exactly once', () => {
    const save = defaultSave();
    save.gold = 1e6;
    expect(buyMeta(save, 'armory_bow')).toBe(true);
    expect(buyMeta(save, 'armory_staff')).toBe(true);
    expect(buyMeta(save, 'armory_bow')).toBe(false);
    expect(save.unlocks.filter((u) => u === 'bow')).toHaveLength(1);
    expect(save.unlocks).toContain('staff');
  });

  it('heroes are bought once for their price', () => {
    const save = defaultSave();
    expect(buyHero(save, 'knight')).toBe(false); // already owned
    expect(buyHero(save, 'ranger')).toBe(false); // too poor
    save.gold = HEROES.ranger.unlockCost + 5;
    expect(buyHero(save, 'ranger')).toBe(true);
    expect(save.gold).toBe(5);
    expect(save.heroes).toContain('ranger');
    expect(buyHero(save, 'ranger')).toBe(false);
  });

  it('turns levels into effects and specials', () => {
    const effects = metaEffects({ vitality: 3, might: 0, insight: 1, second_wind: 2, unknown: 4 });
    expect(effects).toEqual([[{ stat: 'maxHp', add: 30 }]]);
    expect(extraChoices({})).toBe(0);
    expect(extraChoices({ insight: 1 })).toBe(1);
    expect(freeRerolls({ second_wind: 2 })).toBe(2);
    expect(freeRerolls({ second_wind: 9 })).toBe(2);
    expect(freeRerolls({})).toBe(0);
  });

  it('banks collected gold plus a small room bonus', () => {
    const base = { runId: 'x', mode: 'normal' as const, hero: 'knight' as const, kills: 0, level: 1, bossesDefeated: [], synergies: [], durationSec: 0, noDamageRooms: 0, legendaries: 0 };
    expect(runGoldReward({ ...base, roomsCleared: 0, gold: 0 })).toBe(0);
    expect(runGoldReward({ ...base, roomsCleared: 5, gold: 100 })).toBeGreaterThan(100);
    expect(runGoldReward({ ...base, roomsCleared: 5, gold: 100 })).toBeLessThan(120);
  });
});
