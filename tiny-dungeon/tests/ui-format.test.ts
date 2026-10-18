import { describe, expect, it } from 'vitest';
import { achievementProgress, fmt, metaEffectText } from '../src/game/ui/format';
import { ACHIEVEMENTS } from '../src/data/achievements';
import { META_BY_ID, META_UPGRADES } from '../src/data/meta';
import { defaultSave } from '../src/save/SaveManager';

describe('fmt', () => {
  it('groups thousands and rounds', () => {
    expect(fmt(0)).toBe('0');
    expect(fmt(999)).toBe('999');
    expect(fmt(1000)).toBe('1,000');
    expect(fmt(1234567.6)).toBe('1,234,568');
  });
});

describe('metaEffectText', () => {
  it('formats flat, percentage and fractional stats per level', () => {
    expect(metaEffectText(META_BY_ID.vitality, 0)).toBe('+0 HP');
    expect(metaEffectText(META_BY_ID.vitality, 3)).toBe('+30 HP');
    expect(metaEffectText(META_BY_ID.might, 2)).toBe('+10% damage');
    expect(metaEffectText(META_BY_ID.precision, 3)).toBe('+6% crit');
  });

  it('describes the special upgrades', () => {
    expect(metaEffectText(META_BY_ID.armory_bow, 0)).toBe('Locked');
    expect(metaEffectText(META_BY_ID.armory_bow, 1)).toBe('Unlocked');
    expect(metaEffectText(META_BY_ID.insight, 0)).toBe('3 choices');
    expect(metaEffectText(META_BY_ID.insight, 1)).toBe('4 choices');
    expect(metaEffectText(META_BY_ID.second_wind, 1)).toBe('1 free reroll');
    expect(metaEffectText(META_BY_ID.second_wind, 2)).toBe('2 free rerolls');
  });

  it('has text for every shop row at level 0 and at max level', () => {
    for (const def of META_UPGRADES) {
      expect(metaEffectText(def, 0).length).toBeGreaterThan(0);
      expect(metaEffectText(def, def.maxLevel).length).toBeGreaterThan(0);
    }
  });
});

describe('achievementProgress', () => {
  it('reads lifetime stats', () => {
    const save = defaultSave();
    save.stats.totalKills = 480;
    save.stats.bestRoom = 9;
    save.stats.bestRoomByHero = { mage: 4 };
    const kills = ACHIEVEMENTS.find((a) => a.id === 'kills_1000')!;
    expect(achievementProgress(kills.check, save)).toEqual({ cur: 480, max: 1000 });
    const room = ACHIEVEMENTS.find((a) => a.id === 'room_10')!;
    expect(achievementProgress(room.check, save)).toEqual({ cur: 9, max: 10 });
    const mage = ACHIEVEMENTS.find((a) => a.id === 'mage_10')!;
    expect(achievementProgress(mage.check, save)).toEqual({ cur: 4, max: 10 });
  });

  it('is null for boss achievements and defined for every counter', () => {
    const save = defaultSave();
    for (const a of ACHIEVEMENTS) {
      const p = achievementProgress(a.check, save);
      if (a.check.kind === 'bossDefeated') expect(p).toBeNull();
      else expect(p?.max).toBeGreaterThan(0);
    }
  });
});
