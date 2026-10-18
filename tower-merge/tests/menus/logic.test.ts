import { describe, expect, it } from 'vitest';
import { META_UPGRADES } from '../../src/data/meta';
import { emptyLifetimeStats } from '../../src/core/achievements';
import type { AchievementDef, DailyModifier, TowerDef } from '../../src/data/types';
import {
  achievementRows, bossKills, countUnlocked, dailyButtonStatus, dailyStatus, firstSentence, formatCountdown, formatDailyDate,
  formatMetaValue, formatRunDate, formatStat, metaDescription, metaGainText, metaTotalAt, modifierIcon, msUntilNextUtcDay,
  loadoutCount, loadoutReasonText, loadoutSlots, prettyName, rankSynergies, rankTowerKills, sortAchievementRows, towerStatsAt,
} from '../../src/game/menus/logic';

const meta = (id: string) => {
  const def = META_UPGRADES.find((m) => m.id === id);
  if (!def) throw new Error(`no meta upgrade ${id}`);
  return def;
};

describe('meta descriptions', () => {
  it('shows fractions as percentages and counts as numbers', () => {
    expect(formatMetaValue('damagePct', 0.12)).toBe('12%');
    expect(formatMetaValue('fireRatePct', 0.045)).toBe('4.5%');
    expect(formatMetaValue('castleHp', 45)).toBe('45');
    expect(formatMetaValue('rerolls', 2)).toBe('2');
  });
  it('removes float noise from totals', () => {
    expect(metaTotalAt(meta('metaDamage'), 3)).toBe(0.36);
    expect(formatMetaValue('damagePct', metaTotalAt(meta('metaDamage'), 7))).toBe('84%');
    expect(formatMetaValue('coinGainPct', metaTotalAt(meta('metaCoinGain'), 3))).toBe('15%');
  });
  it('fills {value} with the total at the given level', () => {
    expect(metaDescription(meta('metaCastleHp'), 3)).toBe('+45 castle HP at the start of a run.');
    expect(metaDescription(meta('metaDamage'), 3)).toBe('Towers deal +36% damage.');
    expect(metaDescription(meta('metaDiscount'), 0)).toBe('Towers cost 0% less to buy.');
  });
  it('every shipped description resolves without a leftover placeholder', () => {
    for (const def of META_UPGRADES) {
      for (let l = 0; l <= def.maxLevel; l++) expect(metaDescription(def, l)).not.toMatch(/[{}]/);
    }
  });
  it('shows the per-level gain', () => {
    expect(metaGainText(meta('metaCastleHp'))).toBe('+15');
    expect(metaGainText(meta('metaDamage'))).toBe('+12%');
  });
});

describe('tower stats', () => {
  const def = {
    damage: 10, fireRate: 2, range: 200, splashRadius: 0, critChance: 0.05,
    levels: [{ damageMult: 1, fireRateMult: 1, rangeBonus: 0 }, { damageMult: 2, fireRateMult: 1.5, rangeBonus: 10 }],
  } as unknown as TowerDef;
  it('scales base stats by the level multipliers', () => {
    expect(towerStatsAt(def, 1)).toMatchObject({ damage: 10, fireRate: 2, range: 200, dps: 20 });
    expect(towerStatsAt(def, 2)).toMatchObject({ damage: 20, fireRate: 3, range: 210, dps: 60 });
  });
  it('is undefined without a definition and tolerates missing levels', () => {
    expect(towerStatsAt(undefined, 1)).toBeUndefined();
    expect(towerStatsAt(def, 5)?.damage).toBe(10);
  });
  it('formats stat numbers compactly', () => {
    expect(formatStat(34)).toBe('34');
    expect(formatStat(1.6500001)).toBe('1.65');
    expect(formatStat(12.34)).toBe('12.3');
    expect(formatStat(230.4)).toBe('230');
    expect(formatStat(NaN)).toBe('-');
  });
});

describe('rankings', () => {
  it('ranks towers by kills, drops zero entries and breaks ties by tower order', () => {
    const r = rankTowerKills({ cannon: 50, arrow: 200, frost: 50, magic: 0 });
    expect(r.map((x) => x.id)).toEqual(['arrow', 'cannon', 'frost']);
    expect(r[0].fraction).toBe(1);
    expect(r[1].fraction).toBeCloseTo(0.25);
  });
  it('returns an empty list when nothing has been killed', () => {
    expect(rankTowerKills({})).toEqual([]);
    expect(rankSynergies({})).toEqual([]);
  });
  it('limits and orders synergies', () => {
    const counts = { a: 1, b: 9, c: 5, d: 5, e: 2, f: 7 };
    expect(rankSynergies(counts, 4).map((x) => x.id)).toEqual(['b', 'f', 'c', 'd']);
  });
  it('maps boss ids to their kill counters', () => {
    const s = { ...emptyLifetimeStats(), goblinKingKills: 1, golemKills: 2, dragonKills: 3 };
    expect([bossKills(s, 'goblinKing'), bossKills(s, 'stoneGolem'), bossKills(s, 'dragon')]).toEqual([1, 2, 3]);
  });
});

describe('names and text', () => {
  it('makes readable names from ids', () => {
    expect(prettyName('goblin')).toBe('Goblin');
    expect(prettyName('stoneGolem')).toBe('Stone Golem');
    expect(prettyName('goblinKing')).toBe('Goblin King');
  });
  it('takes the first sentence', () => {
    expect(firstSentence('Fast shots. Cheap and reliable.')).toBe('Fast shots.');
    expect(firstSentence('No full stop')).toBe('No full stop');
    expect(firstSentence('  Slows enemies down!  Really. ')).toBe('Slows enemies down!');
  });
});

describe('achievements', () => {
  const defs: AchievementDef[] = [
    { id: 'a', name: 'A', description: '', icon: 'star', stat: 'towersMerged', target: 100, reward: 10 },
    { id: 'b', name: 'B', description: '', icon: 'star', stat: 'bestWave', target: 10, reward: 10 },
    { id: 'c', name: 'C', description: '', icon: 'star', stat: 'runs', target: 5, reward: 10 },
    { id: 'd', name: 'D', description: '', icon: 'star', stat: 'bossesKilled', target: 1, reward: 10 },
  ];
  const stats = { ...emptyLifetimeStats(), towersMerged: 25, bestWave: 12, runs: 4 };
  it('clamps progress to the target and marks finished ones', () => {
    const rows = achievementRows(stats, ['b'], defs);
    expect(rows.map((r) => [r.def.id, r.value, r.unlocked])).toEqual([['a', 25, false], ['b', 10, true], ['c', 4, false], ['d', 0, false]]);
    expect(rows[0].fraction).toBeCloseTo(0.25);
    expect(rows[1].fraction).toBe(1);
  });
  it('sorts closest-to-done first and unlocked last', () => {
    const order = sortAchievementRows(achievementRows(stats, [], defs)).map((r) => r.def.id);
    // b is met by the stats (12 >= 10) so it counts as unlocked and goes last
    expect(order).toEqual(['c', 'a', 'd', 'b']);
  });
  it('counts unlocked against the total', () => {
    expect(countUnlocked(emptyLifetimeStats(), [])).toMatchObject({ unlocked: 0 });
    expect(countUnlocked(emptyLifetimeStats(), []).total).toBeGreaterThan(10);
  });
});

describe('daily helpers', () => {
  it('counts down to the next UTC midnight', () => {
    expect(msUntilNextUtcDay(Date.UTC(2026, 9, 18, 0, 0, 0))).toBe(86_400_000);
    expect(msUntilNextUtcDay(Date.UTC(2026, 9, 18, 23, 59, 59, 500))).toBe(500);
    expect(msUntilNextUtcDay(new Date('2026-12-31T18:30:00Z'))).toBe(5.5 * 3600_000);
  });
  it('formats a countdown as HH:MM:SS, rounding partial seconds up', () => {
    expect(formatCountdown(5_025_000)).toBe('01:23:45');
    expect(formatCountdown(500)).toBe('00:00:01');
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown(-5)).toBe('00:00:00');
    expect(formatCountdown(Number.NaN)).toBe('00:00:00');
    expect(formatCountdown(86_400_000)).toBe('24:00:00');
  });
  it("ignores a record of another day", () => {
    const rec = { key: '2026-10-17', bestWave: 9, attempts: 2 };
    expect(dailyStatus(rec, '2026-10-18')).toEqual({ bestWave: 0, attempts: 0, played: false });
    expect(dailyStatus(rec, '2026-10-17')).toEqual({ bestWave: 9, attempts: 2, played: true });
    expect(dailyStatus(null, '2026-10-17').played).toBe(false);
  });
  it('words the menu button status', () => {
    expect(dailyButtonStatus({ bestWave: 0, attempts: 0, played: false })).toBe('New!');
    expect(dailyButtonStatus({ bestWave: 8, attempts: 1, played: true })).toBe('Best wave 8');
  });
  it('formats dates', () => {
    expect(formatDailyDate('2026-10-18')).toBe('Sunday, Oct 18');
    expect(formatDailyDate('nope')).toBe('nope');
    expect(formatRunDate('2026-03-05')).toBe('5 Mar 2026');
    expect(formatRunDate('')).toBe('');
  });
  it('picks an icon for every modifier, known or not', () => {
    expect(modifierIcon({ id: 'swarm', name: '', description: '' })).toBe('skull');
    expect(modifierIcon({ id: 'x', name: '', description: '', towerPool: ['frost', 'arrow', 'fire'] } as DailyModifier)).toBe('frost');
    expect(modifierIcon({ id: 'x', name: '', description: '', startCoins: 5 })).toBe('coin');
    expect(modifierIcon({ id: 'x', name: '', description: '' })).toBe('star');
  });
});

describe('loadout helpers', () => {
  it('words every block reason and has a fallback', () => {
    expect(loadoutReasonText('full')).toBe('Loadout is full - remove a tower first');
    expect(loadoutReasonText('minimum')).toContain('at least 3');
    expect(loadoutReasonText('noAir')).toContain('flying');
    expect(loadoutReasonText('locked')).toContain('Unlock');
    expect(loadoutReasonText(undefined)).toBe('Cannot change the loadout');
  });
  it('formats the count and never exceeds the size', () => {
    expect(loadoutCount(3, 4)).toBe('3/4');
    expect(loadoutCount(6, 4)).toBe('4/4');
  });
  it('pads slots with null', () => {
    expect(loadoutSlots(['arrow', 'frost'], 4)).toEqual(['arrow', 'frost', null, null]);
    expect(loadoutSlots([], 2)).toEqual([null, null]);
    expect(loadoutSlots(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
  });
});
