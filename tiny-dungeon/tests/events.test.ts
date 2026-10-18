import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { Rng } from '../src/core/rng';
import { applyUpgrade, onRoomCleared, rollUpgradeChoices } from '../src/core/run';
import { BUFFS, BUFF_BY_ID, COSMETICS } from '../src/data/buffs';
import { SHRINE_OPTIONS, applyShrine, canUseShrine, curseHpMult, rollShrineOptions } from '../src/data/events';
import { EXTRA_FRAMES, ICONS } from '../src/game/assets';
import { makeRun } from './coreHelpers';

describe('buffs and cosmetics data', () => {
  it('defines the companions and buffs with real frames and icons', () => {
    for (const id of ['companion_fairy', 'companion_wisp', 'buff_fury', 'buff_haste', 'buff_fortune', 'buff_bulwark']) {
      expect(BUFF_BY_ID[id], id).toBeDefined();
    }
    for (const b of BUFFS) {
      expect((ICONS as readonly string[]).includes(b.icon)).toBe(true);
      if (b.companion) expect((EXTRA_FRAMES as readonly string[]).includes(b.companion)).toBe(true);
    }
    expect(COSMETICS.map((c) => c.id).sort()).toEqual(['skin_crimson', 'skin_emerald', 'skin_gold', 'skin_shadow']);
  });
});

describe('shrines', () => {
  it('lists icons that exist', () => {
    expect(SHRINE_OPTIONS.map((o) => o.id)).toEqual(expect.arrayContaining(['blood_altar', 'healing_fountain', 'gamblers_idol', 'cursed_chest']));
    for (const o of SHRINE_OPTIONS) expect((ICONS as readonly string[]).includes(o.icon), o.id).toBe(true);
  });

  it('blood altar costs 25% max HP and makes the next offer epic or better', () => {
    const run = makeRun();
    run.room = 8;
    const hp = run.hp;
    expect(applyShrine(run, 'blood_altar', new Rng(1)).ok).toBe(true);
    expect(run.hp).toBe(hp - Math.ceil(run.stats.maxHp * 0.25));
    const rng = new Rng(2);
    for (let i = 0; i < 50; i++) {
      for (const c of rollUpgradeChoices(run, rng)) expect(['epic', 'legendary']).toContain(c.def.rarity);
    }
    applyUpgrade(run, 'sharp_blade'); // any pick consumes the blessing
    expect(run.nextChoice).toBeUndefined();
    run.hp = 5;
    expect(canUseShrine(run, 'blood_altar')).toBe(false);
    expect(applyShrine(run, 'blood_altar', new Rng(1)).ok).toBe(false);
    expect(run.hp).toBe(5);
  });

  it('healing fountain heals to full', () => {
    const run = makeRun();
    expect(canUseShrine(run, 'healing_fountain')).toBe(false);
    run.hp = 3;
    expect(applyShrine(run, 'healing_fountain', new Rng(1)).ok).toBe(true);
    expect(run.hp).toBe(run.stats.maxHp);
  });

  it("gambler's idol costs half the gold and sometimes offers a legendary", () => {
    let wins = 0;
    for (let s = 0; s < 200; s++) {
      const run = makeRun();
      run.gold = 100;
      run.room = 10;
      expect(applyShrine(run, 'gamblers_idol', new Rng(s)).ok).toBe(true);
      expect(run.gold).toBe(50);
      if (run.nextChoice?.minRarity === 'legendary') {
        wins++;
        expect(rollUpgradeChoices(run, new Rng(s))[0].def.rarity).toBe('legendary');
      }
    }
    expect(wins).toBeGreaterThan(70);
    expect(wins).toBeLessThan(130);
    const poor = makeRun();
    expect(applyShrine(poor, 'gamblers_idol', new Rng(1)).ok).toBe(false);
  });

  it('cursed chest pays gold and curses the next rooms, then wears off', () => {
    const run = makeRun();
    run.room = 6;
    expect(curseHpMult(run)).toBe(1);
    applyShrine(run, 'cursed_chest', new Rng(1));
    expect(run.gold).toBeGreaterThan(0);
    expect(curseHpMult(run)).toBeCloseTo(1.2, 9);
    onRoomCleared(run); // the shrine room itself
    for (let i = 0; i < BALANCE.shrines.cursedChestRooms; i++) {
      expect(curseHpMult(run)).toBeCloseTo(1.2, 9);
      onRoomCleared(run);
    }
    expect(curseHpMult(run)).toBe(1);
  });

  it('timed shrine buffs last the promised number of rooms after the shrine room', () => {
    const run = makeRun();
    applyShrine(run, 'war_banner', new Rng(1));
    onRoomCleared(run); // shrine room
    for (let i = 0; i < BALANCE.shrines.buffRooms; i++) {
      expect(run.buffs.map((b) => b.id)).toContain('buff_fury');
      onRoomCleared(run);
    }
    expect(run.buffs).toEqual([]);
  });

  it('rolls distinct options and includes the fountain when hurt', () => {
    const run = makeRun();
    for (let s = 0; s < 50; s++) {
      const opts = rollShrineOptions(run, new Rng(s), 3);
      expect(new Set(opts.map((o) => o.id)).size).toBe(3);
    }
    run.hp = 1;
    for (let s = 0; s < 50; s++) expect(rollShrineOptions(run, new Rng(s), 3).map((o) => o.id)).toContain('healing_fountain');
  });
});
