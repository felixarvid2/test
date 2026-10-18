import { describe, expect, it } from 'vitest';
import { TOWERS } from '../../src/data/towers';
import { TOWER_IDS } from '../../src/data/types';
import { arena, defaultRunOptions, flag, internals, NO_CONTENT, stat } from './helpers';
import { createWorld } from '../../src/sim/World';

const first = (w: ReturnType<typeof arena>['w']) => w.describeTower(5)!;

describe('stat aggregation', () => {
  it('uses (base + flat) * (1 + pct) * mul', () => {
    const { w } = arena({
      towers: [{ type: 'arrow', level: 1 }],
      effects: [stat('damage', 'flat', 5), stat('damage', 'pct', 0.2), stat('damage', 'pct', 0.3), stat('damage', 'mul', 2), stat('damage', 'mul', 1.5)],
    });
    expect(first(w).damage).toBeCloseTo((TOWERS.arrow.damage + 5) * 1.5 * 3, 6);
  });

  it('scopes effects to the listed tower types', () => {
    const { w } = arena({
      towers: [{ type: 'arrow', level: 1 }, { type: 'cannon', level: 1 }],
      effects: [stat('damage', 'mul', 2, ['cannon'])],
    });
    expect(w.describeTower(5)!.damage).toBeCloseTo(TOWERS.arrow.damage, 6);
    expect(w.describeTower(8)!.damage).toBeCloseTo(TOWERS.cannon.damage * 2, 6);
  });

  it('applies level multipliers and cumulative instance-scoped perks', () => {
    const { w } = arena({ towers: [{ type: 'arrow', level: 4 }, { type: 'arrow', level: 2 }] });
    const l4 = w.describeTower(5)!;
    const l2 = w.describeTower(8)!;
    const def = TOWERS.arrow;
    expect(l4.damage).toBeCloseTo(def.damage * def.levels[3].damageMult, 6);
    expect(l4.critChance).toBeCloseTo(def.critChance + 0.25, 6);
    // the L4 perks do not leak into the L2 tower
    expect(l2.critChance).toBeCloseTo(def.critChance, 6);
    expect(l4.perks).toEqual(['Double Arrows', 'Piercing Arrows', 'Critical Hits']);
    expect(l2.perks).toEqual(['Double Arrows']);
    expect(l4.range).toBeCloseTo(def.range + def.levels[3].rangeBonus, 6);
  });

  it('every tower defines exactly the requested perks for levels 2 to 5', () => {
    const names: Record<string, string[]> = {
      arrow: ['Double Arrows', 'Piercing Arrows', 'Critical Hits', 'Multishot'],
      cannon: ['Larger Explosions', 'Cluster Bombs', 'Armor Penetration', 'Burning Shells'],
      frost: ['Increased Slow', 'Freeze Chance', 'Frost Explosion', 'Area Freeze'],
      lightning: ['Additional Chain Targets', 'Increased Chain Range', 'Stun Chance', 'Critical Lightning'],
      fire: ['Stronger Burning', 'Fire Spread', 'Flame Explosions', 'Persistent Fire Zones'],
      poison: ['Increased Duration', 'Poison Spread', 'Enemy Vulnerability', 'Poison Explosions'],
      sniper: ['Increased Crit Damage', 'Execute', 'Armor Piercing', 'Faster Targeting'],
      magic: ['Random Elements', 'Multiple Projectiles', 'Area Damage', 'Arcane Explosions'],
    };
    for (const id of TOWER_IDS) {
      const def = TOWERS[id];
      expect(def.levels).toHaveLength(5);
      expect(def.levels.slice(1).map((l) => l.perkName)).toEqual(names[id]);
      for (const l of def.levels.slice(1)) {
        expect(l.perkDesc && l.perkDesc.length).toBeGreaterThan(10);
        expect(l.perks.length).toBeGreaterThan(0);
      }
    }
    expect(TOWERS.cannon.attack).toBe('lobbed');
    expect(TOWERS.cannon.hitsAir).toBe(false);
    expect(TOWERS.sniper.attack).toBe('beam');
    expect(TOWERS.lightning.attack).toBe('chain');
    expect(TOWERS.frost.baseEffects.some((e) => e.kind === 'flag' && e.flag === 'slowOnHit')).toBe(true);
    for (const id of ['arrow', 'cannon', 'frost'] as const) expect(TOWERS[id].unlock.kind).toBe('start');
  });

  it('a level 2 tower is worth about 2.3-2.5x a level 1 in DPS ', () => {
    for (const id of TOWER_IDS) {
      const { w } = arena({ towers: [{ type: id, level: 1 }, { type: id, level: 2 }] });
      const ratio = w.describeTower(8)!.dps / w.describeTower(5)!.dps;
      const lo = 2.3;
      expect(ratio, id).toBeGreaterThanOrEqual(lo);
      expect(ratio, id).toBeLessThanOrEqual(2.55);
    }
  });

  it('global stats: castle HP, tower cost, coin gain, ability cooldown, wave coin bonus', () => {
    const base = createWorld(defaultRunOptions(1), NO_CONTENT);
    const { w } = arena({
      effects: [
        { kind: 'global', stat: 'castleMaxHp', op: 'pct', value: 0.5 },
        { kind: 'global', stat: 'towerCost', op: 'pct', value: -0.25 },
        { kind: 'global', stat: 'abilityCooldown', op: 'mul', value: 0.5 },
      ],
    });
    expect(w.castleMaxHp).toBe(base.castleMaxHp * 1.5);
    expect(w.buyCost()).toBe(Math.round(base.buyCost() * 0.75));
    expect(w.abilities[0].maxCooldown).toBeCloseTo(base.abilities[0].maxCooldown * 0.5, 6);
  });

  it('meta bonuses from RunOptions apply', () => {
    const w = createWorld(defaultRunOptions(1, {
      castleHpBonus: 40, startCoinsBonus: 50, damagePct: 0.1, fireRatePct: 0.2, discountPct: 0.1, abilityCdPct: 0.2, startTowerLevel: 3, startingSlots: 6,
    }), NO_CONTENT);
    const ref = createWorld(defaultRunOptions(1), NO_CONTENT);
    expect(w.castleMaxHp).toBe(ref.castleMaxHp + 40);
    expect(w.coins).toBe(ref.coins + 50);
    expect(w.buyCost()).toBe(Math.round(ref.buyCost() * 0.9));
    expect(w.slots.filter((s) => s.unlocked)).toHaveLength(6);
    expect(w.slots[5].tower!.level).toBe(3);
    expect(w.abilities[0].maxCooldown).toBeCloseTo(ref.abilities[0].maxCooldown * 0.8, 6);
    const lv3 = TOWERS.arrow.levels[2];
    expect(w.describeTower(5)!.damage).toBeCloseTo(TOWERS.arrow.damage * lv3.damageMult * 1.1, 6);
    expect(w.describeTower(5)!.fireRate).toBeCloseTo(TOWERS.arrow.fireRate * lv3.fireRateMult * 1.2, 6);
  });

  it('daily effects, start coins and wave modifier are applied', () => {
    const w = createWorld(defaultRunOptions(1, { daily: { startCoins: 250, effects: [flag('castleRegen', 2)] } }), NO_CONTENT);
    const ref = createWorld(defaultRunOptions(1), NO_CONTENT);
    expect(w.coins).toBe(ref.coins + 250);
    expect(internals(w).gm.flags.length).toBeGreaterThan(0);
  });

  it('adjacencyBonus raises damage per adjacent tower of a different type', () => {
    const { w } = arena({ towers: [{ type: 'arrow', level: 1 }, { type: 'cannon', level: 1 }, { type: 'arrow', level: 1 }], effects: [flag('adjacencyBonus', 0.25)] });
    // slot 5 (arrow) neighbours slot 8 (cannon) and slot 4 (arrow): one different neighbour.
    expect(w.describeTower(5)!.damage).toBeCloseTo(TOWERS.arrow.damage * 1.25, 6);
    // slot 8 (cannon) neighbours only slot 5 (arrow) among the occupied slots.
    expect(w.describeTower(8)!.damage).toBeCloseTo(TOWERS.cannon.damage * 1.25, 6);
  });
});
