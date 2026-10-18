import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import {
  baseHitDamage, burnDps, chainDamage, chainJumps, explodeChanceFor, explosionDamage, explosionRadius, meteorDamage,
  orbitDamage, poisonDps, rollHit, rollStatuses, thunderDamage, thunderStrikes, weaponLevel, weaponStats,
} from '../src/core/combat';
import { Rng } from '../src/core/rng';
import { applyUpgrade } from '../src/core/run';
import { WEAPONS } from '../src/data/weapons';
import { makeRun } from './coreHelpers';

describe('weaponStats', () => {
  it('matches the weapon definitions at base', () => {
    const k = makeRun('knight');
    const sword = weaponStats(k, 'sword');
    expect(sword.damage).toBeCloseTo(WEAPONS.sword.baseDamage, 6);
    expect(sword.arc).toBe(110);
    expect(sword.range).toBe(WEAPONS.sword.range);
    expect(sword.count).toBe(1);
    expect(sword.cooldown).toBeCloseTo(WEAPONS.sword.cooldown, 6);
    const r = makeRun('ranger');
    const bow = weaponStats(r, 'bow');
    expect(bow.count).toBe(1);
    expect(bow.range).toBeGreaterThan(400);
    expect(bow.projectileSpeed).toBeGreaterThan(0);
    expect(weaponStats(makeRun('mage'), 'staff').bounces).toBe(1);
  });

  it('responds to upgrades, weapon level and extra weapons', () => {
    const run = makeRun('ranger');
    const d0 = weaponStats(run, 'bow').damage;
    applyUpgrade(run, 'fletching');
    expect(weaponLevel(run, 'bow')).toBe(2);
    expect(weaponStats(run, 'bow').damage).toBeGreaterThan(d0 + 3);
    applyUpgrade(run, 'extra_arrow');
    applyUpgrade(run, 'multishot');
    expect(weaponStats(run, 'bow').count).toBe(3);
    applyUpgrade(run, 'piercing_shots'); // completes Arrow Storm: +1 pierce more
    expect(weaponStats(run, 'bow').pierce).toBe(2);
    expect(weaponStats(run, 'bow').count).toBe(4);
    applyUpgrade(run, 'quick_hands');
    expect(weaponStats(run, 'bow').cooldown).toBeLessThan(WEAPONS.bow.cooldown / 1.1);
    const mageRun = makeRun('mage');
    applyUpgrade(mageRun, 'arcane_bounce');
    expect(weaponStats(mageRun, 'staff').bounces).toBe(2);
    // a second weapon deals reduced damage
    const knight = makeRun('knight');
    applyUpgrade(knight, 'take_bow');
    expect(weaponStats(knight, 'bow').damage).toBeCloseTo(WEAPONS.bow.baseDamage * BALANCE.weapons.extraWeaponDamage, 6);
    expect(baseHitDamage(knight)).toBeGreaterThan(0);
  });

  it('keeps cooldown above the floor even at the attack speed cap', () => {
    const run = makeRun();
    run.stats.attackSpeedMult = 4;
    expect(weaponStats(run, 'sword').cooldown).toBeGreaterThanOrEqual(BALANCE.weapons.minCooldown);
  });
});

describe('rollHit / rollStatuses', () => {
  it('crits multiply damage by critDamage and respect chance', () => {
    const run = makeRun();
    run.stats.critChance = 1;
    run.stats.critDamage = 2;
    const rng = new Rng(1);
    expect(rollHit(run.stats, 10, rng)).toEqual({ amount: 20, crit: true });
    run.stats.critChance = 0;
    expect(rollHit(run.stats, 10, rng)).toEqual({ amount: 10, crit: false });
    run.stats.critChance = 0.3;
    let crits = 0;
    for (let i = 0; i < 5000; i++) if (rollHit(run.stats, 10, rng).crit) crits++;
    expect(crits / 5000).toBeGreaterThan(0.27);
    expect(crits / 5000).toBeLessThan(0.33);
    expect(rollHit(run.stats, 0.1, rng).amount).toBe(1);
  });

  it('shatter adds crit chance and damage against frozen enemies', () => {
    const run = makeRun();
    run.stats.critChance = 0;
    run.stats.frostShatter = 1;
    const rng = new Rng(2);
    expect(rollHit(run.stats, 100, rng).amount).toBe(100);
    let sum = 0;
    for (let i = 0; i < 200; i++) sum += rollHit(run.stats, 100, rng, { frozen: true }).amount;
    expect(sum / 200).toBeGreaterThan(130);
  });

  it('statuses only roll for owned effects', () => {
    const run = makeRun();
    const rng = new Rng(3);
    for (let i = 0; i < 200; i++) {
      expect(rollStatuses(run.stats, rng)).toEqual({ burn: false, slow: false, freeze: false, chain: false, poison: false, chaos: null });
    }
    applyUpgrade(run, 'fire_weapon');
    applyUpgrade(run, 'venom');
    applyUpgrade(run, 'frost_touch');
    applyUpgrade(run, 'chain_lightning');
    applyUpgrade(run, 'chaos_engine');
    const seen = { burn: 0, slow: 0, poison: 0, chain: 0, chaos: 0 };
    const elements = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const s = rollStatuses(run.stats, rng);
      if (s.burn) seen.burn++;
      if (s.slow) seen.slow++;
      if (s.poison) seen.poison++;
      if (s.chain) seen.chain++;
      if (s.chaos) {
        seen.chaos++;
        elements.add(s.chaos);
      }
    }
    expect(seen.burn / 3000).toBeGreaterThan(0.25);
    expect(seen.burn / 3000).toBeLessThan(0.35);
    for (const v of Object.values(seen)) expect(v).toBeGreaterThan(0);
    expect(elements.size).toBe(4);
  });
});

describe('ability maths', () => {
  it('scales with stats and respects the anti-runaway limits', () => {
    const run = makeRun();
    run.stats.burnDps = 0.3;
    run.stats.elementPower = 2;
    expect(burnDps(run.stats, 10)).toBeCloseTo(6, 6);
    run.stats.poisonDps = 0.1;
    expect(poisonDps(run.stats, 10)).toBeCloseTo(2, 6);
    run.stats.chainDamage = 0.5;
    expect(chainDamage(run.stats, 10)).toBeCloseTo(10, 6);
    run.stats.chainCount = 6;
    expect(chainJumps(run.stats)).toBe(BALANCE.limits.maxChainJumpsPerHit);
    run.stats.explosionDamage = 1.5;
    expect(explosionDamage(run.stats, 10)).toBe(15);
    run.stats.explosionRadius = 80;
    run.stats.areaMult = 2;
    expect(explosionRadius(run.stats)).toBe(160);
    run.stats.orbitDamage = 0.4;
    expect(orbitDamage(run.stats, 10)).toBeCloseTo(4, 6);
    expect(thunderDamage(run.stats, 10)).toBeGreaterThan(10);
    expect(meteorDamage(run.stats, 10)).toBeGreaterThan(10);
    run.stats.thunderLevel = 8;
    expect(thunderStrikes(run.stats)).toBeLessThanOrEqual(BALANCE.limits.maxThunderStrikesPerPulse);
    run.stats.explodeChance = 0.2;
    expect(explodeChanceFor(run.stats, true)).toBe(0.2);
    run.stats.burnExplode = 1;
    expect(explodeChanceFor(run.stats, true)).toBe(1);
    expect(explodeChanceFor(run.stats, false)).toBe(0.2);
  });
});
