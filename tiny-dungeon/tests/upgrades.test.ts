import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { ICONS } from '../src/game/assets';
import { Rng } from '../src/core/rng';
import { applyUpgrade, isUpgradeAvailable, rollUpgradeChoices } from '../src/core/run';
import { SYNERGIES, SYNERGY_BY_ID } from '../src/data/synergies';
import { UPGRADES, UPGRADE_BY_ID } from '../src/data/upgrades';
import { makeRun } from './coreHelpers';

describe('upgrade data', () => {
  it('has the required content and valid references', () => {
    expect(UPGRADES.length).toBeGreaterThanOrEqual(38);
    expect(new Set(UPGRADES.map((u) => u.id)).size).toBe(UPGRADES.length);
    const icons = new Set<string>(ICONS);
    for (const u of UPGRADES) {
      expect(icons.has(u.icon), `${u.id} icon ${u.icon}`).toBe(true);
      expect(u.desc.length).toBeLessThanOrEqual(70);
      expect(u.maxLevel).toBeGreaterThanOrEqual(1);
    }
    for (const id of [
      'sharp_blade', 'quick_hands', 'thick_armor', 'swift_boots', 'lucky_strike', 'iron_skin', 'magnet', 'regeneration',
      'keen_edge', 'long_reach', 'greed', 'scholar', 'heavy_hitter', 'nimble', 'take_bow', 'take_staff', 'take_sword',
      'wide_swing', 'extra_arrow', 'arcane_bounce', 'honed_steel', 'fletching', 'focus_crystal', 'double_strike',
      'fire_weapon', 'frost_touch', 'chain_lightning', 'vampire_fang', 'piercing_shots', 'multishot', 'venom',
      'explosive_death', 'thunderstorm', 'blade_orbit', 'phoenix_heart', 'toxic_plague', 'glass_cannon',
      'infinite_blades', 'meteor_storm', 'soul_harvest', 'chaos_engine', 'potion',
    ]) expect(UPGRADE_BY_ID[id], id).toBeDefined();
    expect(UPGRADE_BY_ID.take_bow.unlock).toBe('bow');
    expect(UPGRADE_BY_ID.take_staff.unlock).toBe('staff');
    expect(UPGRADE_BY_ID.phoenix_heart.maxLevel).toBe(1);
    expect(UPGRADE_BY_ID.potion.maxLevel).toBe(99);
    for (const u of UPGRADES.filter((x) => x.rarity === 'legendary')) expect(u.maxLevel).toBe(1);
  });

  it('every synergy references real upgrades and has effects', () => {
    expect(SYNERGIES.length).toBeGreaterThanOrEqual(12);
    for (const s of SYNERGIES) {
      expect(s.requires.length).toBeGreaterThanOrEqual(2);
      for (const r of s.requires) expect(UPGRADE_BY_ID[r], `${s.id} -> ${r}`).toBeDefined();
      expect(s.effects.length).toBeGreaterThan(0);
    }
    for (const id of ['wildfire', 'storm_crit', 'plague_bomb', 'frozen_fortress', 'inferno_burst', 'shatter', 'tempest',
      'bloodlust', 'arrow_storm', 'armageddon', 'soul_reaper', 'chaos_theory', 'iron_wall', 'glass_storm']) {
      expect(SYNERGY_BY_ID[id], id).toBeDefined();
    }
    for (const id of ['frozen_fortress', 'tempest', 'armageddon']) expect(SYNERGY_BY_ID[id].evolution).toBe(true);
  });
});

describe('rollUpgradeChoices', () => {
  it('offers 3 distinct cards, 4 with Insight', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 50; i++) {
      const run = makeRun();
      const ids = rollUpgradeChoices(run, rng).map((c) => c.def.id);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
    }
    const insight = makeRun('knight', { meta: { insight: 1 } });
    expect(rollUpgradeChoices(insight, rng)).toHaveLength(4);
    expect(rollUpgradeChoices(insight, rng, { count: 2 })).toHaveLength(2);
  });

  it('never offers maxed cards, missing-weapon cards, locked cards or owned weapons', () => {
    const rng = new Rng(2);
    const run = makeRun('knight', { unlocks: [] });
    run.room = 12;
    run.upgrades.sharp_blade = 5; // maxed
    for (let i = 0; i < 300; i++) {
      for (const c of rollUpgradeChoices(run, rng)) {
        expect(c.def.id).not.toBe('sharp_blade');
        expect(c.def.requiresWeapon === undefined || run.weapons.includes(c.def.requiresWeapon)).toBe(true);
        expect(['take_bow', 'take_staff', 'take_sword']).not.toContain(c.def.id); // locked / already owned
        expect(c.def.requiresWeapon).not.toBe('bow');
        expect(c.def.tags.includes('projectile')).toBe(false); // knight holds no projectile weapon
        expect(c.nextLevel).toBe((run.upgrades[c.def.id] ?? 0) + 1);
      }
    }
  });

  it('unlock gates open the weapon cards, and 3 weapons close them again', () => {
    const rng = new Rng(3);
    const run = makeRun('knight');
    run.room = 12;
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) for (const c of rollUpgradeChoices(run, rng)) seen.add(c.def.id);
    expect(seen.has('take_bow')).toBe(true);
    expect(seen.has('take_staff')).toBe(true);
    applyUpgrade(run, 'take_bow');
    applyUpgrade(run, 'take_staff');
    expect(run.weapons).toEqual(['sword', 'bow', 'staff']);
    for (let i = 0; i < 200; i++) {
      for (const c of rollUpgradeChoices(run, rng)) expect(c.def.grantsWeapon).toBeUndefined();
    }
    // bow-specific cards appear once the bow is owned
    const later = new Set<string>();
    for (let i = 0; i < 400; i++) for (const c of rollUpgradeChoices(run, rng)) later.add(c.def.id);
    expect(later.has('extra_arrow')).toBe(true);
  });

  it('rarity weights are roughly 60/28/10/2 once everything is available', () => {
    const rng = new Rng(4);
    const run = makeRun('knight');
    run.room = 30;
    applyUpgrade(run, 'take_bow');
    applyUpgrade(run, 'take_staff');
    const counts = { common: 0, rare: 0, epic: 0, legendary: 0 };
    const n = 6000;
    for (let i = 0; i < n; i++) counts[rollUpgradeChoices(run, rng, { count: 1 })[0].def.rarity]++;
    const w = BALANCE.rarity.weights;
    const total = w.common + w.rare + w.epic + w.legendary;
    expect(counts.common / n).toBeGreaterThan((w.common / total) * 0.9);
    expect(counts.common / n).toBeLessThan((w.common / total) * 1.1);
    expect(counts.rare / n).toBeGreaterThan((w.rare / total) * 0.85);
    expect(counts.rare / n).toBeLessThan((w.rare / total) * 1.15);
    expect(counts.epic / n).toBeGreaterThan(0.07);
    expect(counts.epic / n).toBeLessThan(0.13);
    expect(counts.legendary).toBeGreaterThan(0);
    expect(counts.legendary / n).toBeLessThan(0.04);
  });

  it('keeps legendary and epic cards out of the earliest rooms', () => {
    const rng = new Rng(5);
    const run = makeRun();
    run.room = 1;
    for (let i = 0; i < 300; i++) {
      for (const c of rollUpgradeChoices(run, rng)) expect(c.def.rarity === 'common' || c.def.rarity === 'rare').toBe(true);
    }
  });

  it('luck shifts offers toward rarer cards', () => {
    const rate = (luck: number): number => {
      const rng = new Rng(6);
      const run = makeRun();
      run.room = 30;
      run.stats.luck = luck;
      let rare = 0;
      const n = 3000;
      for (let i = 0; i < n; i++) if (rollUpgradeChoices(run, rng, { count: 1 })[0].def.rarity !== 'common') rare++;
      return rare / n;
    };
    expect(rate(1.5)).toBeGreaterThan(rate(0) + 0.1);
  });

  it('minRarity forces rare-or-better cards while enough exist', () => {
    const rng = new Rng(7);
    const run = makeRun();
    run.room = 10;
    for (let i = 0; i < 100; i++) {
      for (const c of rollUpgradeChoices(run, rng, { minRarity: 'epic' })) {
        expect(['epic', 'legendary']).toContain(c.def.rarity);
      }
    }
  });

  it('hero favoured tags are picked more often', () => {
    const rng = new Rng(8);
    const run = makeRun('knight');
    run.room = 12;
    let favored = 0;
    let neutral = 0;
    const pool = UPGRADES.filter((u) => u.rarity === 'common' && isUpgradeAvailable(run, u, ['bow', 'staff']));
    const fav = (id: string): boolean => UPGRADE_BY_ID[id].tags.some((t) => t === 'defense' || t === 'melee');
    for (let i = 0; i < 4000; i++) {
      const c = rollUpgradeChoices(run, rng, { count: 1, minRarity: 'common' })[0];
      if (c.def.rarity !== 'common') continue;
      if (fav(c.def.id)) favored++;
      else neutral++;
    }
    const favShare = pool.filter((u) => fav(u.id)).length / pool.length;
    expect(favored / (favored + neutral)).toBeGreaterThan(favShare);
  });

  it('always returns at least one card, even with every upgrade maxed', () => {
    const rng = new Rng(9);
    const run = makeRun();
    for (const u of UPGRADES) if (!u.onPick) run.upgrades[u.id] = u.maxLevel;
    run.weapons = ['sword', 'bow', 'staff'];
    const cards = rollUpgradeChoices(run, rng);
    expect(cards.length).toBeGreaterThanOrEqual(1);
    expect(cards.map((c) => c.def.id)).toContain('potion');
    expect(rollUpgradeChoices(run, rng, { count: 1 })).toHaveLength(1);
  });

  it('adds synergy hints for cards that advance or complete a synergy', () => {
    const rng = new Rng(10);
    const run = makeRun();
    run.room = 12;
    applyUpgrade(run, 'fire_weapon');
    let completes = false;
    for (let i = 0; i < 400 && !completes; i++) {
      for (const c of rollUpgradeChoices(run, rng)) {
        if (c.def.id === 'double_strike') {
          expect(c.synergyHints).toContain('Wildfire');
          completes = true;
        }
      }
    }
    expect(completes).toBe(true);
  });

  it('potion and gold pouch heal / pay but are never part of normal offers', () => {
    const rng = new Rng(11);
    const run = makeRun();
    run.room = 12;
    for (let i = 0; i < 200; i++) {
      for (const c of rollUpgradeChoices(run, rng)) expect(c.def.onPick).toBeUndefined();
    }
    run.hp = 10;
    const before = run.hp;
    applyUpgrade(run, 'potion');
    expect(run.hp).toBeGreaterThan(before);
    const gold = run.gold;
    applyUpgrade(run, 'gold_pouch');
    expect(run.gold).toBeGreaterThan(gold);
  });
});
