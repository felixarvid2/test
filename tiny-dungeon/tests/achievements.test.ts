import { describe, expect, it } from 'vitest';
import { evaluateAchievements, recordRun } from '../src/core/achievements';
import type { RunSummary } from '../src/core/types';
import { ACHIEVEMENTS } from '../src/data/achievements';
import { BOSSES } from '../src/data/bosses';
import { COSMETICS } from '../src/data/buffs';
import { ICONS } from '../src/game/assets';
import { defaultSave } from '../src/save/SaveManager';

function summary(over: Partial<RunSummary> = {}): RunSummary {
  return {
    runId: 'r', mode: 'normal', hero: 'knight', roomsCleared: 0, kills: 0, gold: 0, level: 1,
    bossesDefeated: [], synergies: [], durationSec: 60, noDamageRooms: 0, legendaries: 0, ...over,
  };
}

describe('achievement data', () => {
  it('has at least 18 achievements with real icons and unique ids', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(18);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    const icons = new Set<string>(ICONS);
    for (const a of ACHIEVEMENTS) expect(icons.has(a.icon), a.id).toBe(true);
    const kinds = new Set(ACHIEVEMENTS.map((a) => a.check.kind));
    for (const k of ['totalKills', 'bestRoom', 'bossDefeated', 'noDamageRoom', 'legendariesTotal', 'runs', 'goldTotal',
      'synergiesInRun', 'killsInRun', 'heroRoom', 'dailyCompleted', 'levelInRun']) expect(kinds.has(k as never), k).toBe(true);
  });

  it('only hands out known unlock ids', () => {
    const skins = new Set(COSMETICS.map((c) => c.id));
    for (const a of ACHIEVEMENTS) {
      const u = a.reward?.unlock;
      if (!u) continue;
      expect(u.startsWith('skin_') ? skins.has(u) : u.startsWith('variant_'), `${a.id} -> ${u}`).toBe(true);
    }
    const all = ACHIEVEMENTS.map((a) => a.reward?.unlock);
    for (const v of ['variant_ghost', 'variant_spider', 'variant_fire_slime', 'variant_ogre', 'skin_gold', 'skin_shadow', 'skin_emerald', 'skin_crimson']) {
      expect(all).toContain(v);
    }
  });
});

describe('recordRun and evaluateAchievements', () => {
  it('updates lifetime stats', () => {
    const save = defaultSave();
    recordRun(save, summary({
      roomsCleared: 6, kills: 120, gold: 80, level: 7, bossesDefeated: ['giant_slime'], synergies: ['wildfire', 'shatter'],
      noDamageRooms: 3, legendaries: 1, hero: 'ranger',
    }));
    const s = save.stats;
    expect(s).toMatchObject({
      runs: 1, totalKills: 120, totalGold: 80, bestRoom: 7, bestLevel: 7, bestKillsInRun: 120, legendariesTotal: 1,
      bestNoDamageRooms: 3, maxSynergiesInRun: 2,
    });
    expect(s.bestRoomByHero.ranger).toBe(7);
    expect(s.bossesDefeated.giant_slime).toBe(1);
    expect(save.lastRun?.runId).toBe('r');
    recordRun(save, summary({ roomsCleared: 2, kills: 10 }));
    expect(save.stats.bestRoom).toBe(7);
    expect(save.stats.runs).toBe(2);
    expect(save.stats.totalKills).toBe(130);
  });

  it('triggers once, records the time and grants gold, tokens and unlocks', () => {
    const save = defaultSave();
    const run = summary({ roomsCleared: 9, kills: 150, bossesDefeated: ['giant_slime'] });
    recordRun(save, run);
    const earned = evaluateAchievements(save, run).map((a) => a.id);
    expect(earned).toEqual(expect.arrayContaining(['kills_100', 'room_5', 'room_10', 'boss_slime']));
    expect(earned).not.toContain('room_15');
    for (const id of earned) expect(save.achievements[id]).toBeGreaterThan(0);
    const expectedGold = ACHIEVEMENTS.filter((a) => earned.includes(a.id)).reduce((s, a) => s + (a.reward?.gold ?? 0), 0);
    const expectedTokens = ACHIEVEMENTS.filter((a) => earned.includes(a.id)).reduce((s, a) => s + (a.reward?.tokens ?? 0), 0);
    expect(save.gold).toBe(expectedGold);
    expect(save.rewards.tokens).toBe(expectedTokens);
    expect(expectedTokens).toBeGreaterThan(0);
    expect(save.unlocks).toContain('variant_fire_slime');
    // second evaluation grants nothing more
    const gold = save.gold;
    expect(evaluateAchievements(save, run)).toEqual([]);
    expect(evaluateAchievements(save)).toEqual([]);
    expect(save.gold).toBe(gold);
  });

  it('puts skins into cosmetics and enemy variants into unlocks, without duplicates', () => {
    const save = defaultSave();
    save.stats.bestRoom = 15;
    evaluateAchievements(save);
    expect(save.cosmetics.owned).toContain('skin_gold');
    expect(save.unlocks).not.toContain('skin_gold');
    save.achievements = {};
    evaluateAchievements(save);
    expect(save.cosmetics.owned.filter((s) => s === 'skin_gold')).toHaveLength(1);
  });

  it('evaluates the special kinds', () => {
    const save = defaultSave();
    const run = summary({ roomsCleared: 4, noDamageRooms: 4, hero: 'mage', level: 15, synergies: ['a', 'b', 'c'], kills: 300 });
    recordRun(save, run);
    const ids = evaluateAchievements(save, run).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['no_damage_5', 'level_15', 'synergies_3', 'kills_run_300']));
    expect(ids).not.toContain('mage_10');
    save.stats.dailyCompleted = 3;
    save.stats.bestRoomByHero.mage = 10;
    save.stats.legendariesTotal = 5;
    save.stats.runs = 10;
    save.stats.totalGold = 5000;
    save.stats.totalKills = 1000;
    const later = evaluateAchievements(save).map((a) => a.id);
    expect(later).toEqual(expect.arrayContaining(['daily_3', 'mage_10', 'legendaries_5', 'runs_10', 'gold_5000', 'kills_1000']));
  });

  it('has a defeat achievement for every boss and a room 30 milestone', () => {
    for (const b of BOSSES) {
      const a = ACHIEVEMENTS.find((x) => x.check.kind === 'bossDefeated' && x.check.boss === b.id);
      expect(a, b.id).toBeDefined();
      expect(a?.reward?.gold, b.id).toBeGreaterThan(0);
    }
    const rewards = ['boss_spider', 'boss_lich', 'boss_mimic'].map((id) => ACHIEVEMENTS.find((a) => a.id === id)?.reward);
    for (const r of rewards) expect(r?.tokens).toBeGreaterThan(0);
    expect(ACHIEVEMENTS.find((a) => a.id === 'room_30')?.check).toEqual({ kind: 'bestRoom', value: 30 });
  });

  it('awards the new boss achievements once, from a run or from saved stats', () => {
    const save = defaultSave();
    const run = summary({ roomsCleared: 24, bossesDefeated: ['giant_slime', 'skeleton_king', 'dragon', 'spider_queen'] });
    recordRun(save, run);
    const first = evaluateAchievements(save, run).map((a) => a.id);
    expect(first).toEqual(expect.arrayContaining(['boss_spider', 'room_25']));
    expect(first).not.toContain('boss_lich');
    expect(first).not.toContain('boss_mimic');
    expect(first).not.toContain('room_30');
    const goldBefore = save.gold;
    const tokensBefore = save.rewards.tokens;

    const deep = summary({ roomsCleared: 30, bossesDefeated: ['lich', 'mimic_king'] });
    recordRun(save, deep);
    const second = evaluateAchievements(save, deep).map((a) => a.id);
    expect(second.sort()).toEqual(['boss_lich', 'boss_mimic', 'room_30']);
    const gain = ACHIEVEMENTS.filter((a) => second.includes(a.id));
    expect(save.gold).toBe(goldBefore + gain.reduce((s, a) => s + (a.reward?.gold ?? 0), 0));
    expect(save.rewards.tokens).toBe(tokensBefore + gain.reduce((s, a) => s + (a.reward?.tokens ?? 0), 0));
    // nothing is granted a second time, with or without the run
    const gold = save.gold;
    expect(evaluateAchievements(save, deep)).toEqual([]);
    expect(evaluateAchievements(save)).toEqual([]);
    expect(save.gold).toBe(gold);
    expect(save.stats.bossesDefeated).toMatchObject({ spider_queen: 1, lich: 1, mimic_king: 1 });
  });

  it('one run can earn every boss achievement', () => {
    const save = defaultSave();
    const run = summary({ roomsCleared: 30, bossesDefeated: BOSSES.map((b) => b.id) });
    recordRun(save, run);
    const ids = evaluateAchievements(save, run).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining([
      'boss_slime', 'boss_king', 'boss_dragon', 'boss_spider', 'boss_lich', 'boss_mimic', 'room_15', 'room_25', 'room_30',
    ]));
  });
});
