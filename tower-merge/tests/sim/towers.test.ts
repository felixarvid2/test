import { describe, expect, it } from 'vitest';
import { gemsFor } from '../../src/data/balance';
import { advance, arena, countEvents, flag, godWorld, playWaves, spawn, stat } from './helpers';

const noCrit = stat('critChance', 'mul', 0);

describe('tower attacks', () => {
  it('arrows emit shot events and travel as projectiles before hitting', () => {
    const { w, s } = arena({ towers: [{ type: 'arrow', level: 1 }], effects: [noCrit], idle: true });
    spawn(s, 'goblin', 480, { hpMult: 100 });
    const evs: ReturnType<typeof w.drainEvents> = [];
    let sawProjectile = false;
    for (let i = 0; i < 60; i++) {
      w.update(1 / 60);
      evs.push(...w.drainEvents());
      if (w.projectiles.some((p) => p.active && p.kind === 'arrow')) sawProjectile = true;
    }
    expect(sawProjectile).toBe(true);
    const shot = evs.find((e) => e.type === 'shot');
    expect(shot).toMatchObject({ type: 'shot', tower: 'arrow', slot: 5, level: 1 });
    expect(evs.some((e) => e.type === 'hit' && e.kind === 'arrow')).toBe(true);
    expect(w.slots[5].tower!.kills + w.slots[5].tower!.damageDealt).toBeGreaterThan(0);
    expect(w.stats.towerDamage.arrow).toBeGreaterThan(0);
  });

  it('cannons lob shells (arc data) that explode and hit several ground enemies', () => {
    const { w, s } = arena({ towers: [{ type: 'cannon', level: 1 }], effects: [noCrit], idle: true });
    const a = spawn(s, 'goblin', 470, { hpMult: 100 });
    const b = spawn(s, 'goblin', 490, { hpMult: 100 });
    a.baseSpeed = 0; b.baseSpeed = 0;
    let arc = false;
    const evs = [] as ReturnType<typeof w.drainEvents>;
    for (let i = 0; i < 150; i++) {
      w.update(1 / 60);
      evs.push(...w.drainEvents());
      const p = w.projectiles.find((q) => q.active && q.kind === 'cannonball');
      if (p && p.arcHeight > 0 && p.arcT > 0 && p.arcT < 1) arc = true;
    }
    expect(arc).toBe(true);
    expect(evs.some((e) => e.type === 'explosion' && e.element === 'physical')).toBe(true);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('lightning chains between enemies instantly with a chain event', () => {
    const { w, s } = arena({ towers: [{ type: 'lightning', level: 1 }], effects: [noCrit], idle: true });
    const es = [470, 490, 510, 530].map((p) => spawn(s, 'goblin', p, { hpMult: 100 }));
    const evs = advance(w, 1.2);
    const chain = evs.find((e) => e.type === 'chain');
    expect(chain && chain.type === 'chain' && chain.source).toBe('lightning');
    expect(es.filter((e) => e.hp < e.maxHp).length).toBe(3);
    expect(w.stats.chainLightnings).toBeGreaterThan(0);
  });

  it('snipers fire beams at the highest-HP enemy in a very long range', () => {
    const { w, s } = arena({ towers: [{ type: 'sniper', level: 1 }], effects: [noCrit] });
    const far = spawn(s, 'goblin', 1500, { hpMult: 10 }); // further along but weaker
    const tank = spawn(s, 'orc', 20, { hpMult: 100 }); // at the start of the path, far from the tower
    far.baseSpeed = 0; tank.baseSpeed = 0;
    const evs = advance(w, 3);
    expect(evs.some((e) => e.type === 'beam')).toBe(true);
    expect(tank.hp).toBeLessThan(tank.maxHp);
    expect(far.hp).toBe(far.maxHp);
  });

  it('other towers prefer the enemy furthest along the path', () => {
    const { w, s } = arena({ towers: [{ type: 'arrow', level: 1 }], effects: [noCrit], idle: true });
    const behind = spawn(s, 'goblin', 440, { hpMult: 100 });
    const ahead = spawn(s, 'goblin', 520, { hpMult: 100 });
    behind.baseSpeed = 0; ahead.baseSpeed = 0;
    advance(w, 0.6);
    expect(ahead.hp).toBeLessThan(ahead.maxHp);
    expect(behind.hp).toBe(behind.maxHp);
  });

  it('fire towers spray a cone hitting several enemies and burning them', () => {
    const { w, s } = arena({ towers: [{ type: 'fire', level: 1 }], effects: [noCrit], idle: true });
    // slot 5 is at (360, 410): enemies on the y = 520 row at x = 330..390 are within 125 px and in front
    const es = [0, 12, -12].map((dx) => {
      const e = spawn(s, 'goblin', 950 + (610 - (360 + dx)), { hpMult: 100 });
      e.lateral = 0; e.lane.place(e); e.baseSpeed = 0;
      return e;
    });
    s.grid.rebuild();
    const evs = advance(w, 1);
    expect(countEvents(evs, 'cone')).toBeGreaterThan(0);
    expect(es.every((e) => e.hp < e.maxHp && e.burnTime > 0)).toBe(true);
  });

  it('towers disabled by a boss stay quiet until the timer runs out', () => {
    const { w, s } = arena({ towers: [{ type: 'arrow', level: 1 }], effects: [noCrit], idle: true });
    const e = spawn(s, 'goblin', 480, { hpMult: 1000 });
    e.baseSpeed = 0;
    s.slots[5].tower!.disabledTime = 2;
    advance(w, 1.9);
    expect(e.hp).toBe(e.maxHp);
    advance(w, 1);
    expect(e.hp).toBeLessThan(e.maxHp);
  });

  it('towers only attack inside their range', () => {
    const { w, s } = arena({ towers: [{ type: 'fire', level: 1 }], idle: true });
    const e = spawn(s, 'goblin', 480, { hpMult: 100 }); // 110 px away; fire range is 125 -> hit
    e.baseSpeed = 0;
    advance(w, 1);
    expect(e.hp).toBeLessThan(e.maxHp);
    const far = spawn(s, 'goblin', 1500, { hpMult: 100 });
    far.baseSpeed = 0;
    advance(w, 1);
    expect(far.hp).toBe(far.maxHp);
  });

  it('keeps per-tower kill and damage statistics and run stats by type', () => {
    const w = godWorld(5, { startTowerLevel: 3 });
    playWaves(w, 4);
    const t = w.slots.find((s) => s.tower)!.tower!;
    expect(t.kills).toBeGreaterThan(0);
    expect(t.damageDealt).toBeGreaterThan(0);
    expect(w.stats.towerKills.arrow).toBeGreaterThan(0);
    expect(w.stats.towerDamage.arrow).toBeGreaterThan(0);
    expect(w.stats.enemiesKilled).toBe(Object.values(w.stats.towerKills).reduce((a, b) => a + (b ?? 0), 0));
    expect(w.stats.highestTowerLevel).toBe(3);
  });

  it('gemsEarned follows the balance formula and grows with waves and bosses', () => {
    const w = godWorld(6, { startTowerLevel: 5 });
    let last = 0;
    playWaves(w, 12, { onEvents: (_e, world) => { expect(world.stats.gemsEarned).toBeGreaterThanOrEqual(last); last = world.stats.gemsEarned; } });
    const bossGems = (8 + 15);
    expect(w.stats.wavesCleared).toBe(11);
    expect(w.stats.gemsEarned).toBe(gemsFor(11, bossGems));
    expect(w.stats.gemsEarned).toBeGreaterThan(gemsFor(11, 0));
  });
});

describe('unused flag sanity', () => {
  it('flag helper builds scoped flags', () => {
    expect(flag('pierce', 1, ['arrow'])).toEqual({ kind: 'flag', flag: 'pierce', value: 1, tower: ['arrow'] });
  });
});
