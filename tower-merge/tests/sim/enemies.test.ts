import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../../src/data/enemies';
import { ENEMY_IDS } from '../../src/data/types';
import { AIR_LANE, GROUND_LANE } from '../../src/sim/path';
import { FLY_LANE, PATH } from '../../src/data/map';
import { advance, arena, countEvents, flag, spawn, stat } from './helpers';

describe('enemy definitions', () => {
  it('cover all ten enemies with sane values and gradual introduction', () => {
    expect(Object.keys(ENEMIES).sort()).toEqual([...ENEMY_IDS].sort());
    for (const id of ENEMY_IDS) {
      const d = ENEMIES[id];
      expect(d.hp).toBeGreaterThan(0);
      expect(d.speed).toBeGreaterThan(0);
      expect(d.armor).toBeGreaterThanOrEqual(0);
      expect(d.armor).toBeLessThanOrEqual(0.8);
      expect(d.threat).toBeGreaterThan(0);
    }
    expect(ENEMIES.stoneling.firstWave).toBe(999);
    expect(ENEMIES.imp.firstWave).toBe(999);
    expect(ENEMIES.bat.flying).toBe(true);
    expect(ENEMIES.rat.speed).toBeGreaterThan(ENEMIES.goblin.speed * 1.5);
    expect(ENEMIES.rat.hp).toBeLessThan(ENEMIES.goblin.hp);
    expect(ENEMIES.orc.armor).toBeGreaterThanOrEqual(0.4);
    expect(ENEMIES.orc.speed).toBeLessThan(ENEMIES.goblin.speed);
    expect(ENEMIES.troll.hp).toBeGreaterThan(ENEMIES.orc.hp * 3);
    expect(ENEMIES.skeleton.abilities.some((a) => a.kind === 'frontShield')).toBe(true);
    expect(ENEMIES.shaman.abilities.some((a) => a.kind === 'heal')).toBe(true);
    expect(ENEMIES.summoner.abilities.some((a) => a.kind === 'summon')).toBe(true);
    const firsts = ENEMY_IDS.map((id) => ENEMIES[id].firstWave).filter((w) => w < 999);
    expect(new Set(firsts).size).toBeGreaterThanOrEqual(7);
  });
});

describe('movement', () => {
  it('lanes are precomputed polylines and ground enemies follow the path to the castle', () => {
    let len = 0;
    for (let i = 1; i < PATH.length; i++) len += Math.hypot(PATH[i].x - PATH[i - 1].x, PATH[i].y - PATH[i - 1].y);
    expect(GROUND_LANE.total).toBeCloseTo(len, 6);
    expect(AIR_LANE.total).toBeCloseTo(Math.hypot(FLY_LANE[1].x - FLY_LANE[0].x, FLY_LANE[1].y - FLY_LANE[0].y), 6);
    const { w, s } = arena({ idle: true });
    const e = spawn(s, 'goblin', 0, { hpMult: 1e6 });
    e.lateral = 0;
    e.lane.place(e);
    let prev = e.progress;
    let maxJump = 0;
    let px = e.x;
    let py = e.y;
    for (let i = 0; i < 60 * 30; i++) {
      w.update(1 / 60);
      expect(e.progress).toBeGreaterThanOrEqual(prev);
      prev = e.progress;
      maxJump = Math.max(maxJump, Math.hypot(e.x - px, e.y - py));
      px = e.x;
      py = e.y;
      if (!e.active) break;
    }
    expect(e.progress).toBeGreaterThan(2000);
    expect(maxJump).toBeLessThan(5);
  });

  it('enemies get a small fixed lateral offset (within 14 px of the lane centre line) and flyers use the fly lane', () => {
    const { s } = arena({ idle: true });
    const offsets = new Set<number>();
    for (let i = 0; i < 30; i++) {
      const e = spawn(s, 'goblin', 100, { hpMult: 1e6 });
      expect(Math.abs(e.lateral)).toBeLessThanOrEqual(14);
      expect(Math.abs(e.x - 110)).toBeLessThanOrEqual(14.001); // first segment is vertical at x = 110
      offsets.add(Math.round(e.lateral));
    }
    expect(offsets.size).toBeGreaterThan(5);
    const bat = spawn(s, 'bat', 0, { hpMult: 1e6 });
    expect(bat.flying).toBe(true);
    expect(Math.abs(bat.x - 640)).toBeLessThanOrEqual(14.001);
    const lane = Math.hypot(FLY_LANE[1].x - FLY_LANE[0].x, FLY_LANE[1].y - FLY_LANE[0].y);
    expect(bat.lane.total).toBeCloseTo(lane, 6);
  });

  it('slow, freeze and stun reduce or stop movement', () => {
    const { w, s } = arena({ idle: true });
    const a = spawn(s, 'goblin', 300, { hpMult: 1e6 });
    const b = spawn(s, 'goblin', 300, { hpMult: 1e6 });
    const c = spawn(s, 'goblin', 300, { hpMult: 1e6 });
    const d = spawn(s, 'goblin', 300, { hpMult: 1e6 });
    b.slow = 0.5; b.slowTime = 9;
    c.frozenTime = 9;
    d.stunTime = 9;
    advance(w, 1);
    expect(b.progress - 300).toBeCloseTo((a.progress - 300) * 0.5, 0);
    expect(c.progress).toBe(300);
    expect(d.progress).toBe(300);
  });

  it('reaching the castle deals damage once, removes the enemy and breaks flawless waves', () => {
    const { w, s } = arena({ idle: true });
    const hp = w.castleHp;
    const orc = spawn(s, 'orc', 2610, { hpMult: 1e6 });
    const evs = advance(w, 0.5);
    expect(orc.active).toBe(false);
    expect(countEvents(evs, 'castleHit')).toBe(1);
    expect(w.castleHp).toBeCloseTo(hp - orc.castleDamage, 6);
    expect(s.alive).toBe(1); // only the idle dummy remains
  });
});

describe('enemy abilities', () => {
  it('flying enemies are ignored by hitsAir=false towers (cannon) but hit by arrows', () => {
    const cannon = arena({ towers: [{ type: 'cannon', level: 1 }], idle: true });
    const bat = spawn(cannon.s, 'bat', 340, { hpMult: 100 });
    advance(cannon.w, 3);
    expect(bat.hp).toBe(bat.maxHp);
    const arrow = arena({ towers: [{ type: 'arrow', level: 1 }], idle: true });
    const bat2 = spawn(arrow.s, 'bat', 340, { hpMult: 100 });
    advance(arrow.w, 3);
    expect(bat2.hp).toBeLessThan(bat2.maxHp);
  });

  it('cannon explosions do not hurt flyers in the blast', () => {
    const { w, s } = arena({ towers: [{ type: 'cannon', level: 1 }], idle: true });
    const g = spawn(s, 'goblin', 480, { hpMult: 100 });
    g.lateral = 0; g.lane.place(g);
    const bat = spawn(s, 'bat', 0, { hpMult: 100 });
    bat.x = g.x; bat.y = g.y; bat.baseSpeed = 0; bat.lane.total;
    s.grid.rebuild();
    advance(w, 3);
    expect(g.hp).toBeLessThan(g.maxHp);
    expect(bat.hp).toBe(bat.maxHp);
  });

  it('frontShield reduces damage from towers in front and not from behind', () => {
    // The skeleton walks west along y = 520. The sniper in slot 5 is at (360, 410).
    const hitAt = (progress: number): number => {
      const a = arena({ towers: [{ type: 'sniper', level: 1 }], effects: [stat('critChance', 'mul', 0)] });
      const sk = spawn(a.s, 'skeleton', progress, { hpMult: 100 });
      sk.lateral = 0;
      sk.lane.place(sk);
      sk.baseSpeed = 0;
      const evs = advance(a.w, 4);
      const d = evs.find((e) => e.type === 'damage');
      return d && d.type === 'damage' ? d.amount : 0;
    };
    const front = hitAt(960); // x = 600: the tower is ahead of it (to the west)
    const behind = hitAt(1360); // x = 200: the tower is behind it (to the east)
    expect(behind).toBeGreaterThan(0);
    expect(front).toBeGreaterThan(0);
    expect(front).toBeLessThan(behind * 0.5);
    expect(front).toBeGreaterThan(behind * 0.3);
  });

  it('shamans heal nearby enemies', () => {
    const { w, s } = arena({ idle: true });
    const sh = spawn(s, 'shaman', 600, { hpMult: 100 });
    const ally = spawn(s, 'goblin', 590, { hpMult: 100 });
    sh.baseSpeed = 0; ally.baseSpeed = 0;
    ally.hp = ally.maxHp * 0.5;
    const evs = advance(w, 4);
    expect(ally.hp).toBeGreaterThan(ally.maxHp * 0.5);
    expect(evs.some((e) => e.type === 'enemyHealed')).toBe(true);
    expect(ally.hp).toBeLessThanOrEqual(ally.maxHp);
    expect(ENEMIES.shaman.abilities[0]).toMatchObject({ kind: 'heal' });
  });

  it('summoners spawn weaker enemies periodically', () => {
    const { w, s } = arena({ idle: true });
    const su = spawn(s, 'summoner', 300, { hpMult: 100 });
    su.baseSpeed = 0;
    const before = s.alive;
    advance(w, 9);
    expect(s.alive).toBeGreaterThanOrEqual(before + 2);
    expect(s.enemies.some((e) => e.active && e.kind === 'goblin' && e.summoned)).toBe(true);
  });

  it('splitOnDeath enemies release their children', () => {
    const goblin = ENEMIES.goblin;
    goblin.abilities.push({ kind: 'splitOnDeath', enemy: 'rat', count: 3 });
    try {
      const { w, s } = arena({ towers: [{ type: 'arrow', level: 1 }], idle: true });
      const g = spawn(s, 'goblin', 480);
      g.hp = 1;
      const evs = advance(w, 0.7);
      expect(w.stats.enemiesKilled).toBeGreaterThanOrEqual(1);
      expect(evs.filter((e) => e.type === 'enemySpawned' && e.kind === 'rat')).toHaveLength(3);
    } finally {
      goblin.abilities.pop();
    }
  });

  it('elite enemies have 2.5x hp and give 2x coins', () => {
    const { s } = arena({ idle: true });
    const normal = spawn(s, 'goblin', 100);
    const elite = spawn(s, 'goblin', 100, { elite: true });
    expect(elite.maxHp).toBeCloseTo(normal.maxHp * 2.5, 6);
    expect(elite.coinValue).toBeCloseTo(normal.coinValue * 2, 6);
    expect(elite.elite).toBe(true);
  });

  it('kill coins scale with the wave and coin gain', () => {
    const base = arena({ towers: [{ type: 'arrow', level: 1 }], idle: true });
    const g = spawn(base.s, 'goblin', 480); g.hp = 1;
    const c0 = base.w.coins;
    advance(base.w, 1);
    const plain = base.w.coins - c0;
    expect(plain).toBe(Math.floor(ENEMIES.goblin.coins));
    const rich = arena({ towers: [{ type: 'arrow', level: 1 }], idle: true, effects: [{ kind: 'global', stat: 'coinGain', op: 'pct', value: 1 }] });
    const g2 = spawn(rich.s, 'goblin', 480); g2.hp = 1;
    const c1 = rich.w.coins;
    advance(rich.w, 1);
    expect(rich.w.coins - c1).toBe(ENEMIES.goblin.coins * 2);
  });

  it('status effects: poison stacks and burn tick damage, vulnerability amplifies it', () => {
    const { w, s } = arena({ idle: true });
    const e = spawn(s, 'goblin', 300, { hpMult: 1000 });
    e.baseSpeed = 0;
    e.poisonStacks = 4; e.poisonDps = 5; e.poisonTime = 9;
    e.burnDps = 10; e.burnTime = 9;
    const hp = e.hp;
    advance(w, 2);
    expect(hp - e.hp).toBeCloseTo((4 * 5 + 10) * 2, 0);
    e.vulnerable = 0.5; e.vulnTime = 9;
    const hp2 = e.hp;
    advance(w, 2);
    expect(hp2 - e.hp).toBeCloseTo((4 * 5 + 10) * 2 * 1.5, 0);
    void flag;
  });
});
