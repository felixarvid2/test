import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { weaponLevel } from '../src/core/combat';
import { Rng } from '../src/core/rng';
import {
  addGold, addXp, applyBuff, applyUpgrade, createRun, damagePlayer, healPlayer, onRoomCleared, recomputeStats,
  registerBossKill, registerKill, revivePlayer, toSummary, xpToNext,
} from '../src/core/run';
import { HEROES } from '../src/data/heroes';
import { makeRun } from './coreHelpers';

describe('createRun', () => {
  it('starts with the hero weapon, full HP and hero stats', () => {
    const k = makeRun('knight');
    expect(k.weapons).toEqual(['sword']);
    expect(k.hp).toBe(k.stats.maxHp);
    expect(k.stats.maxHp).toBe(HEROES.knight.base.maxHp);
    expect(k.stats.armor).toBe((HEROES.knight.base.armor ?? 0) + 1); // + Bulwark
    expect(makeRun('ranger').weapons).toEqual(['bow']);
    expect(makeRun('mage').weapons).toEqual(['staff']);
    expect(makeRun('ranger').stats.critChance).toBeGreaterThan(makeRun('knight').stats.critChance);
    expect(makeRun('mage').stats.elementPower).toBeGreaterThan(1);
  });

  it('applies permanent upgrades and free rerolls', () => {
    const r = makeRun('knight', { meta: { vitality: 3, might: 2, second_wind: 2 } });
    expect(r.stats.maxHp).toBe(HEROES.knight.base.maxHp! + 30);
    expect(r.hp).toBe(r.stats.maxHp);
    expect(r.stats.damageMult).toBeCloseTo(1.1, 6);
    expect(r.rerollsLeft).toBe(2);
    expect(makeRun().rerollsLeft).toBe(BALANCE.rerollsPerRun);
  });

  it('daily mode forces the challenge setup deterministically', () => {
    const a = createRun({ hero: 'knight', seed: 5, mode: 'daily', meta: {}, unlocks: [], dailyKey: '2026-02-01' });
    const b = createRun({ hero: 'mage', seed: 99, mode: 'daily', meta: {}, unlocks: [], dailyKey: '2026-02-01' });
    expect(a.hero).toBe(b.hero);
    expect(a.seed).toBe(b.seed);
    expect(a.upgrades).toEqual(b.upgrades);
    expect(Object.keys(a.upgrades)).toHaveLength(1);
    expect(a.stats).toEqual(b.stats);
  });
});

describe('applyUpgrade', () => {
  it('raises levels, stats and never exceeds maxLevel', () => {
    const run = makeRun();
    const before = run.stats.damageMult;
    applyUpgrade(run, 'sharp_blade');
    expect(run.upgrades.sharp_blade).toBe(1);
    expect(run.stats.damageMult).toBeCloseTo(before + 0.2, 6);
    for (let i = 0; i < 10; i++) applyUpgrade(run, 'sharp_blade');
    expect(run.upgrades.sharp_blade).toBe(5);
    expect(run.stats.damageMult).toBeCloseTo(before + 1.0, 6);
    expect(() => applyUpgrade(run, 'nope')).toThrow();
  });

  it('grants weapons once and raises weapon level via weapon-specific cards', () => {
    const run = makeRun();
    const r = applyUpgrade(run, 'take_bow');
    expect(r.weapon).toBe('bow');
    expect(run.weapons).toEqual(['sword', 'bow']);
    expect(applyUpgrade(run, 'take_bow').weapon).toBeUndefined();
    expect(run.weapons).toEqual(['sword', 'bow']);
    expect(weaponLevel(run, 'bow')).toBe(1);
    applyUpgrade(run, 'extra_arrow');
    applyUpgrade(run, 'fletching');
    expect(weaponLevel(run, 'bow')).toBe(3);
    expect(weaponLevel(run, 'sword')).toBe(1);
  });

  it('raises current HP with max HP and clamps it when max HP falls', () => {
    const run = makeRun();
    run.hp = 50;
    const max0 = run.stats.maxHp;
    applyUpgrade(run, 'thick_armor');
    const gained = run.stats.maxHp - max0;
    expect(gained).toBeGreaterThan(0);
    expect(run.hp).toBe(50 + gained);
    run.hp = run.stats.maxHp;
    applyUpgrade(run, 'glass_cannon');
    expect(run.stats.maxHp).toBeLessThan(max0 + gained);
    expect(run.hp).toBe(run.stats.maxHp);
    expect(run.hp).toBeGreaterThan(0);
  });

  it('counts legendaries once', () => {
    const run = makeRun();
    applyUpgrade(run, 'meteor_storm');
    applyUpgrade(run, 'meteor_storm');
    applyUpgrade(run, 'chaos_engine');
    applyUpgrade(run, 'sharp_blade');
    expect(run.legendariesPicked).toBe(2);
    expect(toSummary(run).legendaries).toBe(2);
  });

  it('activates synergies exactly when all requirements are owned, once', () => {
    const run = makeRun();
    expect(applyUpgrade(run, 'fire_weapon').newSynergies).toEqual([]);
    expect(run.synergies).toEqual([]);
    const r = applyUpgrade(run, 'double_strike');
    expect(r.newSynergies.map((s) => s.id)).toEqual(['wildfire']);
    expect(run.synergies).toEqual(['wildfire']);
    expect(run.stats.burnMaxStacks).toBe(BALANCE.baseStats.burnMaxStacks + 2);
    // more levels of a requirement never re-trigger it
    expect(applyUpgrade(run, 'double_strike').newSynergies).toEqual([]);
    expect(applyUpgrade(run, 'fire_weapon').newSynergies).toEqual([]);
    expect(run.synergies).toEqual(['wildfire']);
    // a card that completes two synergies reports both
    const r2 = makeRun();
    applyUpgrade(r2, 'frost_touch');
    applyUpgrade(r2, 'chain_lightning');
    applyUpgrade(r2, 'keen_edge');
    const both = applyUpgrade(r2, 'blade_orbit');
    expect(both.newSynergies.map((s) => s.id)).toEqual(['frozen_fortress']);
    expect(r2.synergies).toContain('shatter');
  });

  it('synergy effects change stats (storm crit flag, orbit blade)', () => {
    const run = makeRun();
    applyUpgrade(run, 'chain_lightning');
    applyUpgrade(run, 'lucky_strike');
    expect(run.stats.chainCanCrit).toBe(1);
    applyUpgrade(run, 'blade_orbit');
    applyUpgrade(run, 'frost_touch');
    expect(run.stats.orbitFreeze).toBe(1);
    expect(run.stats.orbitBlades).toBe(2 + 1);
  });

  it('infinite blades makes the sword faster, wider and double-striking', () => {
    const run = makeRun();
    const aps = run.stats.attackSpeedMult;
    applyUpgrade(run, 'infinite_blades');
    expect(run.stats.attackSpeedMult).toBeCloseTo(aps * 1.2, 9);
    expect(run.stats.multiStrike).toBe(1);
    expect(run.stats.swordArc).toBeGreaterThanOrEqual(BALANCE.baseStats.swordArc + 30);
  });

  it('soul harvest grows damage per kill and stops at the cap', () => {
    const run = makeRun();
    applyUpgrade(run, 'soul_harvest');
    const d0 = run.stats.damageMult;
    for (let i = 0; i < 100; i++) registerKill(run);
    expect(run.kills).toBe(100);
    expect(run.stats.damageMult).toBeCloseTo(d0 * (1 + 100 * run.stats.soulHarvest), 6);
    for (let i = 0; i < 5000; i++) registerKill(run);
    expect(run.stats.damageMult).toBeLessThanOrEqual(d0 * (1 + BALANCE.soulHarvestMaxBonus) + 1e-9);
    expect(run.stats.damageMult).toBeGreaterThan(d0 * (1 + BALANCE.soulHarvestMaxBonus) - 0.02);
    expect(run.kills).toBe(5100);
  });
});

describe('damage, healing, phoenix, revive', () => {
  it('armor reduces damage but never below the minimum', () => {
    const rng = new Rng(1);
    const run = makeRun('knight');
    run.stats.armor = 3;
    expect(damagePlayer(run, 10, rng)).toMatchObject({ taken: 7, dodged: false, fatal: false, phoenix: false });
    expect(run.hp).toBe(run.stats.maxHp - 7);
    expect(damagePlayer(run, 2, rng).taken).toBe(BALANCE.minDamageTaken);
    expect(run.damageTaken).toBe(8);
  });

  it('dodge ignores hits entirely', () => {
    const run = makeRun();
    run.stats.dodge = 1;
    const r = damagePlayer(run, 50, new Rng(1));
    expect(r.dodged).toBe(true);
    expect(r.taken).toBe(0);
    expect(run.hp).toBe(run.stats.maxHp);
    expect(run.damageTaken).toBe(0);
  });

  it('a fatal hit ends the run', () => {
    const run = makeRun();
    const r = damagePlayer(run, 9999, new Rng(1));
    expect(r.fatal).toBe(true);
    expect(run.hp).toBe(0);
    expect(damagePlayer(run, 1, new Rng(1)).fatal).toBe(true);
  });

  it('phoenix saves at 1 HP once per charge', () => {
    const rng = new Rng(1);
    const run = makeRun();
    applyUpgrade(run, 'phoenix_heart');
    const r1 = damagePlayer(run, 9999, rng);
    expect(r1).toMatchObject({ fatal: false, phoenix: true });
    expect(run.hp).toBe(1);
    expect(run.phoenixUsed).toBe(1);
    const r2 = damagePlayer(run, 9999, rng);
    expect(r2.fatal).toBe(true);
    expect(r2.phoenix).toBe(false);
  });

  it('heals are capped and revive restores a fraction', () => {
    const run = makeRun();
    run.hp = 10;
    expect(healPlayer(run, 5)).toBe(5);
    expect(healPlayer(run, 99999)).toBe(run.stats.maxHp - 15);
    expect(run.hp).toBe(run.stats.maxHp);
    expect(healPlayer(run, 10)).toBe(0);
    run.hp = 0;
    expect(healPlayer(run, 10)).toBe(0); // the dead stay dead until revived
    revivePlayer(run, 0.5);
    expect(run.hp).toBe(Math.round(run.stats.maxHp * 0.5));
    expect(run.revived).toBe(true);
    revivePlayer(run, 0);
    expect(run.hp).toBe(1);
  });

  it('regeneration and life on kill live in stats', () => {
    const run = makeRun();
    applyUpgrade(run, 'regeneration');
    applyUpgrade(run, 'vampire_fang');
    expect(run.stats.regen).toBeCloseTo(0.5 + 0.6, 6); // Bulwark + card
    expect(run.stats.lifeOnKill).toBe(1);
  });
});

describe('xp and levels', () => {
  it('xp curve grows monotonically', () => {
    let prev = 0;
    for (let l = 1; l <= 40; l++) {
      expect(xpToNext(l)).toBeGreaterThan(prev);
      prev = xpToNext(l);
    }
    expect(xpToNext(1)).toBe(BALANCE.xp.base);
  });

  it('addXp levels up, carries leftovers, applies bonuses and heals a little', () => {
    const run = makeRun();
    const need = xpToNext(1);
    run.hp = 40;
    const dmg0 = run.stats.damageMult;
    const max0 = run.stats.maxHp;
    expect(addXp(run, need - 1)).toBe(0);
    expect(run.level).toBe(1);
    expect(addXp(run, 1)).toBe(1);
    expect(run.level).toBe(2);
    expect(run.levelBonuses).toBe(1);
    expect(run.stats.damageMult).toBeCloseTo(dmg0 + 0.03, 6);
    expect(run.stats.maxHp).toBe(max0 + 4);
    expect(run.hp).toBeCloseTo(40 + 4 + run.stats.maxHp * BALANCE.levelUpHealFraction, 6);
    expect(run.xp).toBeCloseTo(0, 6);
    // several levels at once
    const gained = addXp(run, xpToNext(2) + xpToNext(3) + 1);
    expect(gained).toBe(2);
    expect(run.level).toBe(4);
  });

  it('xpMult speeds leveling and addGold applies goldMult', () => {
    const run = makeRun();
    applyUpgrade(run, 'scholar');
    addXp(run, 10);
    expect(run.xp).toBeCloseTo(12, 6);
    applyUpgrade(run, 'greed');
    expect(addGold(run, 10)).toBeCloseTo(12, 6);
    expect(run.gold).toBeCloseTo(12, 6);
  });
});

describe('rooms, buffs, summary', () => {
  it('onRoomCleared advances rooms, tracks the no-damage streak and heals', () => {
    const run = makeRun();
    onRoomCleared(run);
    onRoomCleared(run);
    expect(run.room).toBe(3);
    expect(run.roomsWithoutDamage).toBe(2);
    damagePlayer(run, 5, new Rng(1));
    onRoomCleared(run);
    expect(run.room).toBe(4);
    expect(run.roomsWithoutDamage).toBe(2); // streak ends and stays
    onRoomCleared(run);
    expect(run.roomsWithoutDamage).toBe(2);
    const s = toSummary(run);
    expect(s.roomsCleared).toBe(4);
    expect(s.noDamageRooms).toBe(2);
    run.hp = 10;
    const before = run.hp;
    onRoomCleared(run);
    expect(run.hp).toBeGreaterThan(before);
  });

  it('buffs apply, extend, tick down and expire', () => {
    const run = makeRun();
    const d0 = run.stats.damageMult;
    applyBuff(run, 'buff_fury', 2);
    expect(run.stats.damageMult).toBeCloseTo(d0 + 0.25, 6);
    applyBuff(run, 'buff_fury', 1); // does not shorten
    expect(run.buffs).toEqual([{ id: 'buff_fury', roomsLeft: 2 }]);
    applyBuff(run, 'companion_fairy', 1);
    onRoomCleared(run);
    expect(run.buffs).toEqual([{ id: 'buff_fury', roomsLeft: 1 }]);
    onRoomCleared(run);
    expect(run.buffs).toEqual([]);
    expect(run.stats.damageMult).toBeCloseTo(d0, 6);
    applyBuff(run, 'does_not_exist', 3);
    expect(run.buffs).toEqual([]);
  });

  it('recomputeStats is idempotent and toSummary reports the run', () => {
    const run = makeRun();
    applyUpgrade(run, 'fire_weapon');
    const snap = { ...run.stats };
    recomputeStats(run);
    recomputeStats(run);
    expect(run.stats).toEqual(snap);
    registerKill(run);
    registerBossKill(run, 'giant_slime');
    registerBossKill(run, 'giant_slime');
    run.gold = 12.7;
    run.elapsed = 61.4;
    expect(toSummary(run)).toMatchObject({
      runId: 'test-run', mode: 'normal', hero: 'knight', roomsCleared: 0, kills: 1, gold: 12,
      bossesDefeated: ['giant_slime'], durationSec: 61, level: 1,
    });
  });
});
