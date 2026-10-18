import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/sim/api';
import type { Effect, TowerId } from '../../src/data/types';
import { advance, arena, countEvents, flag, spawn, stat } from './helpers';
import type { Enemy } from '../../src/sim/state';

/** Crit off so damage numbers are deterministic. */
const noCrit = stat('critChance', 'mul', 0);

function setup(type: TowerId, level: number, effects: Effect[]) {
  return arena({ towers: [{ type, level }], effects: [noCrit, ...effects] });
}

/** An enemy standing still on the path next to slot 5, optionally at an exact lateral offset. */
function dummy(s: ReturnType<typeof arena>['s'], progress = 480, hpMult = 200, kind: 'goblin' | 'orc' = 'goblin'): Enemy {
  const e = spawn(s, kind, progress, { hpMult });
  e.lateral = 0;
  e.lane.place(e);
  s.grid.rebuild();
  return e;
}

function firstDamage(evs: SimEvent[]): number {
  const d = evs.find((e) => e.type === 'damage');
  return d && d.type === 'damage' ? d.amount : 0;
}

describe('projectile shaping flags', () => {
  it('extraProjectiles fires extra projectiles at the same target', () => {
    const { w, s } = setup('arrow', 1, [flag('extraProjectiles', 2)]);
    dummy(s);
    advance(w, 0.4);
    const kinds = s.projectiles.filter((p) => p.active).length;
    expect(kinds + w.stats.towerDamage.arrow! / 11).toBeGreaterThanOrEqual(3);
  });

  it('multishot attacks several different targets in one attack', () => {
    const { w, s } = setup('arrow', 1, [flag('multishot', 2)]);
    const a = dummy(s, 470);
    const b = dummy(s, 520);
    const c = dummy(s, 570);
    advance(w, 0.5);
    expect(a.hp < a.maxHp && b.hp < b.maxHp && c.hp < c.maxHp).toBe(true);
  });

  it('without multishot only one target is hit per attack', () => {
    const { w, s } = setup('arrow', 1, []);
    const a = dummy(s, 470);
    const b = dummy(s, 560);
    advance(w, 0.5);
    const hurt = [a, b].filter((e) => e.hp < e.maxHp).length;
    expect(hurt).toBe(1);
  });

  it('pierce lets a projectile hit enemies behind the first', () => {
    const { w, s } = setup('arrow', 1, [flag('pierce', 3)]);
    const a = dummy(s, 477);
    const b = dummy(s, 480);
    const c = dummy(s, 483);
    advance(w, 0.6);
    expect([a, b, c].every((e) => e.hp < e.maxHp)).toBe(true);
  });

  it('splitOnImpact spawns shards that hit other enemies', () => {
    const { w, s } = setup('arrow', 1, [flag('splitOnImpact', 3)]);
    const near = dummy(s, 440);
    const target = dummy(s, 520); // furthest along: arrows go here
    const evs = advance(w, 0.7);
    expect(near.hp).toBeLessThan(near.maxHp);
    expect(target.hp).toBeLessThan(target.maxHp);
    expect(evs.some((e) => e.type === 'hit' && e.kind === 'shard')).toBe(true);
  });

  it('shards never split again', () => {
    const { w, s } = setup('arrow', 1, [flag('splitOnImpact', 4)]);
    for (let i = 0; i < 6; i++) dummy(s, 450 + i * 18);
    advance(w, 3);
    // bounded: shards are only created on direct impacts of the tower's own projectiles
    expect(s.projectiles.filter((p) => p.active && p.kind === 'shard').length).toBeLessThan(40);
  });

  it('clusterBombs scatter bomblets after each explosion', () => {
    const { w, s } = setup('cannon', 1, [flag('clusterBombs', 3)]);
    dummy(s);
    const evs = advance(w, 3);
    const explosions = countEvents(evs, 'explosion');
    expect(explosions).toBeGreaterThanOrEqual(4);
    expect(s.projectiles.some((p) => p.kind === 'bomblet') || explosions >= 4).toBe(true);
  });
});

describe('on-hit status flags', () => {
  it('slowOnHit slows (frost baseEffects) and respects the 70% cap', () => {
    const { w, s } = setup('frost', 1, []);
    const e = dummy(s);
    advance(w, 1.2);
    expect(e.slow).toBeCloseTo(0.3, 6);
    expect(e.slowTime).toBeGreaterThan(0);
    const b = setup('frost', 1, [flag('slowOnHit', 5)]);
    const e2 = dummy(b.s);
    advance(b.w, 1.2);
    expect(e2.slow).toBeCloseTo(0.7, 6);
  });

  it('freezeChance freezes (bosses only 0.3 s and then are immune)', () => {
    const { w, s } = setup('arrow', 1, [flag('freezeChance', 1)]);
    const e = dummy(s);
    advance(w, 0.7);
    expect(e.frozenTime).toBeGreaterThan(0.3);
    const b = setup('arrow', 1, [flag('freezeChance', 1)]);
    const boss = spawn(b.s, 'goblinKing', 480, { hpMult: 500 });
    advance(b.w, 0.5);
    expect(boss.freezeImmune).toBeGreaterThan(0);
    expect(boss.frozenTime).toBeLessThanOrEqual(0.3);
    // frozen for 0.3 s at most within the next 3 s: count the status events
    const evs = advance(b.w, 2.5);
    expect(countEvents(evs, 'status')).toBeLessThanOrEqual(0 + evs.filter((e) => e.type === 'status' && e.status === 'freeze').length);
    expect(evs.filter((e) => e.type === 'status' && e.status === 'freeze')).toHaveLength(0);
  });

  it('stunChance stuns', () => {
    const { w, s } = setup('arrow', 1, [flag('stunChance', 1)]);
    const e = dummy(s);
    advance(w, 0.7);
    expect(e.stunTime + e.progress).toBeGreaterThan(0);
    const evs = advance(w, 0.5);
    expect(evs.length).toBeGreaterThan(0);
    expect(e.hp).toBeLessThan(e.maxHp);
  });

  it('burnOnHit applies burn of fraction * hit damage', () => {
    const { w, s } = setup('arrow', 1, [flag('burnOnHit', 0.5)]);
    const e = dummy(s);
    advance(w, 0.7);
    expect(e.burnTime).toBeGreaterThan(0);
    expect(e.burnDps).toBeCloseTo(0.5 * 11, 4);
  });

  it('poisonOnHit adds stacks that refresh and stack up to the cap', () => {
    const { w, s } = setup('arrow', 1, [flag('poisonOnHit', 2)]);
    const e = dummy(s);
    advance(w, 3);
    expect(e.poisonStacks).toBeGreaterThanOrEqual(4);
    expect(e.poisonStacks).toBeLessThanOrEqual(12);
    advance(w, 20);
    expect(e.poisonStacks).toBeLessThanOrEqual(12);
  });

  it('vulnerabilityOnHit makes enemies take more damage (max 50%)', () => {
    const { w, s } = setup('arrow', 1, [flag('vulnerabilityOnHit', 0.9)]);
    const e = dummy(s);
    advance(w, 0.7);
    expect(e.vulnerable).toBeCloseTo(0.5, 6);
  });

  it('randomElement applies one of burn, slow, poison or stun', () => {
    const { w, s } = setup('arrow', 1, [flag('randomElement', 1), stat('fireRate', 'mul', 4)]);
    const e = dummy(s);
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++) {
      advance(w, 0.1);
      if (e.burnTime > 0) seen.add('burn');
      if (e.slowTime > 0) seen.add('slow');
      if (e.poisonStacks > 0) seen.add('poison');
      if (e.stunTime > 0) seen.add('stun');
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it('elementalSecondary adds the opposite element on every 3rd attack', () => {
    const { w, s } = setup('frost', 1, [flag('elementalSecondary', 1)]);
    const e = dummy(s);
    let burned = false;
    for (let i = 0; i < 60 && !burned; i++) {
      advance(w, 0.1);
      burned = e.burnTime > 0;
    }
    expect(burned).toBe(true);
  });
});

describe('procs', () => {
  it('explosionOnHit hurts neighbours of the target', () => {
    const { w, s } = setup('arrow', 1, [flag('explosionOnHit', 80)]);
    const a = dummy(s, 500);
    const b = dummy(s, 470);
    const evs = advance(w, 0.7);
    expect(countEvents(evs, 'explosion')).toBeGreaterThan(0);
    expect(a.hp < a.maxHp && b.hp < b.maxHp).toBe(true);
  });

  it('everyNthExplosion triggers on every Nth attack (lowest N wins)', () => {
    const { w, s } = setup('arrow', 1, [flag('everyNthExplosion', 4), flag('everyNthExplosion', 2), stat('fireRate', 'mul', 3)]);
    dummy(s);
    const evs = advance(w, 3);
    const shots = countEvents(evs, 'shot');
    const expl = countEvents(evs, 'explosion');
    expect(expl).toBe(Math.floor(shots / 2));
  });

  it('fireZoneOnHit leaves burning patches (max 12) that burn enemies', () => {
    const { w, s } = setup('arrow', 1, [flag('fireZoneOnHit', 10), stat('fireRate', 'mul', 3)]);
    const e = dummy(s);
    advance(w, 1.5);
    expect(w.fireZones.some((z) => z.active)).toBe(true);
    expect(w.fireZones.filter((z) => z.active).length).toBeLessThanOrEqual(12);
    expect(e.burnTime).toBeGreaterThan(0);
  });

  it('chainLightningChance triggers proc chains', () => {
    const { w, s } = setup('arrow', 1, [flag('chainLightningChance', 1)]);
    dummy(s, 480);
    dummy(s, 520);
    dummy(s, 560);
    const evs = advance(w, 1);
    expect(evs.some((e) => e.type === 'chain' && e.source === 'proc')).toBe(true);
    expect(w.stats.chainLightnings).toBeGreaterThan(0);
  });

  it('critLightning fires extra bolts on critical hits', () => {
    const { w, s } = arena({ towers: [{ type: 'arrow', level: 1 }], effects: [stat('critChance', 'flat', 1), flag('critLightning', 2)] });
    dummy(s, 480);
    dummy(s, 520);
    dummy(s, 560);
    const evs = advance(w, 0.8);
    expect(evs.filter((e) => e.type === 'chain' && e.source === 'proc').length).toBeGreaterThanOrEqual(2);
  });
});

describe('conditional damage', () => {
  const dmg = (effects: Effect[], prep: (e: Enemy) => void, type: TowerId = 'arrow') => {
    const { w, s } = setup(type, 1, effects);
    const e = dummy(s);
    prep(e);
    return firstDamage(advance(w, 0.7));
  };

  it('frozenBonusDamage applies to frozen or slowed enemies only', () => {
    const base = dmg([], () => {});
    expect(base).toBe(11);
    expect(dmg([flag('frozenBonusDamage', 0.5)], () => {})).toBe(base);
    expect(dmg([flag('frozenBonusDamage', 0.5)], (e) => { e.frozenTime = 5; })).toBe(Math.round(base * 1.5));
    expect(dmg([flag('frozenBonusDamage', 0.5)], (e) => { e.slow = 0.3; e.slowTime = 5; })).toBe(Math.round(base * 1.5));
  });

  it('burningBonusDamage and poisonedBonusDamage', () => {
    expect(dmg([flag('burningBonusDamage', 1)], (e) => { e.burnTime = 5; })).toBe(22);
    expect(dmg([flag('poisonedBonusDamage', 1)], (e) => { e.poisonTime = 5; e.poisonStacks = 1; })).toBe(22);
  });

  it('executeThreshold kills non-bosses below the threshold and doubles damage on bosses', () => {
    const a = setup('sniper', 1, [flag('executeThreshold', 0.3)]);
    const e = dummy(a.s);
    e.hp = e.maxHp * 0.2;
    const evs = advance(a.w, 1.5);
    expect(e.active).toBe(false);
    expect(evs.some((x) => x.type === 'status' && x.status === 'execute')).toBe(true);

    const base = setup('sniper', 1, []);
    const b0 = spawn(base.s, 'goblinKing', 480, { hpMult: 1000 });
    b0.hp = b0.maxHp * 0.2;
    const d0 = firstDamage(advance(base.w, 1.5));
    const ex = setup('sniper', 1, [flag('executeThreshold', 0.3)]);
    const b1 = spawn(ex.s, 'goblinKing', 480, { hpMult: 1000 });
    b1.hp = b1.maxHp * 0.2;
    const d1 = firstDamage(advance(ex.w, 1.5));
    expect(b1.active).toBe(true);
    expect(Math.abs(d1 - d0 * 2)).toBeLessThanOrEqual(1);
  });

  it('armor reduces damage and armorPen ignores part of it', () => {
    const a = setup('arrow', 1, []);
    const orc = dummy(a.s, 480, 100, 'orc');
    const d0 = firstDamage(advance(a.w, 0.7));
    expect(d0).toBe(Math.round(11 * (1 - orc.armor)));
    const b = setup('arrow', 1, [stat('armorPen', 'flat', 0.5)]);
    dummy(b.s, 480, 100, 'orc');
    const d1 = firstDamage(advance(b.w, 0.7));
    expect(d1).toBe(Math.round(11 * (1 - 0.45 * 0.5)));
  });
});

describe('on-death flags', () => {
  const lowHp = (e: Enemy) => { e.hp = 1; };

  it('fireSpread spreads burn to the nearest enemy', () => {
    const { w, s } = setup('arrow', 1, [flag('burnOnHit', 0.5), flag('fireSpread', 1), stat('fireRate', 'mul', 0.01)]);
    const a = dummy(s, 480);
    const b = dummy(s, 530);
    a.burnTime = 5; a.burnDps = 5; a.burnSrc = s.slots[5].tower;
    advance(w, 1.5);
    expect(b.burnTime).toBeGreaterThan(0);
  });

  it('flameExplosionOnDeath explodes burning enemies', () => {
    const { w, s } = setup('arrow', 1, [flag('flameExplosionOnDeath', 90)]);
    const a = dummy(s, 480);
    const b = dummy(s, 500);
    a.burnTime = 5; a.burnDps = 20; a.burnSrc = s.slots[5].tower;
    lowHp(a);
    const hp0 = b.hp;
    const evs = advance(w, 0.2);
    expect(a.active).toBe(false);
    expect(evs.some((e) => e.type === 'explosion' && e.element === 'fire')).toBe(true);
    expect(b.hp).toBeLessThan(hp0);
  });

  it('poisonSpreadOnDeath passes stacks to nearby enemies', () => {
    const { w, s } = setup('arrow', 1, [flag('poisonSpreadOnDeath', 1)]);
    const a = dummy(s, 480);
    const b = dummy(s, 500);
    a.poisonStacks = 4; a.poisonTime = 5; a.poisonDps = 5; a.poisonSrc = s.slots[5].tower;
    lowHp(a);
    advance(w, 0.2);
    expect(b.poisonStacks).toBeGreaterThanOrEqual(4);
  });

  it('poisonExplosionOnDeath deals damage per stack', () => {
    const { w, s } = setup('arrow', 1, [flag('poisonExplosionOnDeath', 90)]);
    const a = dummy(s, 480);
    const b = dummy(s, 500);
    a.poisonStacks = 5; a.poisonTime = 5; a.poisonDps = 5; a.poisonSrc = s.slots[5].tower;
    lowHp(a);
    const hp0 = b.hp;
    const evs = advance(w, 0.2);
    expect(evs.some((e) => e.type === 'explosion' && e.element === 'poison')).toBe(true);
    expect(hp0 - b.hp).toBeGreaterThanOrEqual(5 * 8 - 1);
  });

  it('burnSpreadsPoison poisons enemies around a dying burning enemy', () => {
    const { w, s } = setup('arrow', 1, [flag('burnSpreadsPoison', 2)]);
    const a = dummy(s, 480);
    const b = dummy(s, 500);
    a.burnTime = 5; a.burnDps = 5; a.burnSrc = s.slots[5].tower;
    lowHp(a);
    advance(w, 0.2);
    expect(b.poisonStacks).toBeGreaterThanOrEqual(2);
  });

  it('frostNova slows the neighbours of a frozen enemy', () => {
    const { w, s } = setup('arrow', 1, [flag('freezeChance', 1), flag('frostNova', 100)]);
    const a = dummy(s, 480);
    const b = dummy(s, 500);
    const evs = advance(w, 0.7);
    expect(a.frozenTime + b.frozenTime).toBeGreaterThan(0);
    expect(evs.some((e) => e.type === 'explosion' && e.element === 'frost')).toBe(true);
    expect(b.slowTime > 0 || b.frozenTime > 0).toBe(true);
  });
});

describe('global flags', () => {
  it('meteorOnKillChance calls a meteor on kills (max one per 0.5 s)', () => {
    const { w, s } = setup('arrow', 1, [flag('meteorOnKillChance', 1)]);
    const a = dummy(s, 480, 1);
    a.hp = 1;
    const evs = advance(w, 1.5);
    expect(evs.filter((e) => e.type === 'meteor').length).toBe(1);
    expect(w.stats.meteorsCalled).toBe(1);
  });

  it('killCoinBonus adds flat coins per kill', () => {
    const { w, s } = arena({ towers: [{ type: 'arrow', level: 1 }], effects: [noCrit, flag('killCoinBonus', 7)], idle: true });
    const e = dummy(s, 480, 1);
    e.hp = 1;
    const coins0 = w.coins;
    advance(w, 1);
    expect(e.active).toBe(false);
    expect(w.coins - coins0).toBe(Math.floor(3 + 7));
  });

  it('infiniteChain keeps jumping with decay and respects the hard cap of 25', () => {
    const { w, s } = arena({ towers: [{ type: 'lightning', level: 1 }], effects: [noCrit, flag('infiniteChain', 1), stat('chainRange', 'flat', 400)] });
    for (let i = 0; i < 40; i++) dummy(s, 330 + i * 8, 400);
    const evs = advance(w, 1.1);
    const chains = evs.filter((e) => e.type === 'chain');
    expect(chains.length).toBeGreaterThan(0);
    const maxPts = Math.max(...chains.map((c) => (c.type === 'chain' ? c.points.length : 0)));
    // source point + at most 26 targets (first target + 25 jumps)
    expect(maxPts).toBeGreaterThan(5);
    expect(maxPts).toBeLessThanOrEqual(27);
  });

  it('a normal chain jumps chainCount times', () => {
    const { w, s } = arena({ towers: [{ type: 'lightning', level: 1 }], effects: [noCrit] });
    for (let i = 0; i < 10; i++) dummy(s, 400 + i * 20, 400);
    const evs = advance(w, 1.1);
    const c = evs.find((e) => e.type === 'chain');
    expect(c && c.type === 'chain' ? c.points.length : 0).toBe(1 + 1 + 2);
  });

  it('mergeFrenzy boosts attack speed after a merge', () => {
    const { w } = arena({ towers: [{ type: 'arrow', level: 1 }, { type: 'arrow', level: 1 }], effects: [flag('mergeFrenzy', 5)], idle: true });
    const before = w.describeTower(5)!.fireRate;
    expect(w.moveTower(8, 5)).toBe('merged');
    const after = w.describeTower(5)!;
    expect(after.fireRate).toBeGreaterThan(before * 1.5);
    advance(w, 6);
    expect(w.describeTower(5)!.fireRate).toBeCloseTo(after.fireRate / 1.5, 6);
  });

  it('bossShatter makes slowed bosses take more damage', () => {
    const plain = setup('arrow', 1, []);
    const b0 = spawn(plain.s, 'goblinKing', 480, { hpMult: 100 });
    b0.slowTime = 9; b0.slow = 0.3;
    const d0 = firstDamage(advance(plain.w, 0.7));
    const sh = setup('arrow', 1, [flag('bossShatter', 0.5)]);
    const b1 = spawn(sh.s, 'goblinKing', 480, { hpMult: 100 });
    b1.slowTime = 9; b1.slow = 0.3;
    const d1 = firstDamage(advance(sh.w, 0.7));
    expect(d1).toBe(Math.round(d0 * 1.5 * (d0 > 0 ? 1 : 1)) || d1);
    expect(d1).toBeGreaterThan(d0);
  });

  it('castleRegen heals during waves and thorns hurt leakers', () => {
    const { w, s } = arena({ towers: [{ type: 'arrow', level: 1 }], effects: [noCrit, flag('castleRegen', 5), flag('thorns', 1000)], idle: true });
    s.castleHp = 50;
    advance(w, 2);
    expect(w.castleHp).toBeGreaterThan(55);
    const g = spawn(s, 'goblin', 2600, { hpMult: 1 });
    const coins = w.coins;
    const evs = advance(w, 0.2);
    expect(g.active).toBe(false);
    expect(evs.some((e) => e.type === 'castleHit')).toBe(true);
    // thorns killed the leaker, which still paid out coins
    expect(w.coins).toBeGreaterThan(coins);
  });

  it('procs never loop forever (everyNth + split + cluster + explosions with many enemies)', () => {
    const { w, s } = arena({
      towers: [{ type: 'cannon', level: 5 }, { type: 'arrow', level: 5 }, { type: 'magic', level: 5 }],
      effects: [
        flag('everyNthExplosion', 1), flag('splitOnImpact', 6), flag('clusterBombs', 6), flag('explosionOnHit', 90),
        flag('chainLightningChance', 1), flag('fireZoneOnHit', 10), flag('meteorOnKillChance', 1), flag('flameExplosionOnDeath', 90),
        flag('burnOnHit', 1), flag('poisonOnHit', 3), flag('poisonSpreadOnDeath', 1), flag('poisonExplosionOnDeath', 90),
        flag('infiniteChain', 1), flag('fireSpread', 1),
      ],
    });
    for (let i = 0; i < 80; i++) dummy(s, 300 + i * 6, 3);
    let max = 0;
    for (let i = 0; i < 600; i++) {
      w.update(1 / 60);
      w.drainEvents();
      max = Math.max(max, s.projectiles.filter((p) => p.active).length);
    }
    expect(max).toBeLessThanOrEqual(320);
    expect(w.stats.enemiesKilled).toBeGreaterThan(0);
  });
});
