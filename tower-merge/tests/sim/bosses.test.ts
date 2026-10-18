import { describe, expect, it } from 'vitest';
import { BOSSES } from '../../src/data/bosses';
import { CASTLE, SLOTS } from '../../src/data/map';
import type { SimEvent } from '../../src/sim/api';
import { advance, arena, spawn } from './helpers';

const timeOf = (evs: { t: number; e: SimEvent }[], pred: (e: SimEvent) => boolean): number => {
  const f = evs.find((x) => pred(x.e));
  return f ? f.t : -1;
};

/** advance() with timestamps (seconds since the call). */
function timed(w: ReturnType<typeof arena>['w'], seconds: number): { t: number; e: SimEvent }[] {
  const out: { t: number; e: SimEvent }[] = [];
  const dt = 1 / 60;
  let t = 0;
  while (t < seconds && (w.phase === 'wave' || w.phase === 'prewave')) {
    w.update(dt);
    t += dt;
    for (const e of w.drainEvents()) out.push({ t, e });
  }
  return out;
}

describe('boss definitions', () => {
  it('have 2-3 phases with announce text, descending hp thresholds and a first phase at 1', () => {
    for (const def of Object.values(BOSSES)) {
      expect(def.phases.length).toBeGreaterThanOrEqual(2);
      expect(def.phases.length).toBeLessThanOrEqual(3);
      expect(def.phases[0].hpBelow).toBe(1);
      for (let i = 1; i < def.phases.length; i++) expect(def.phases[i].hpBelow).toBeLessThan(def.phases[i - 1].hpBelow);
      for (const p of def.phases) expect(p.announce && p.announce.length).toBeGreaterThan(5);
    }
    expect(BOSSES.dragon.flying).toBe(true);
    expect(BOSSES.goblinKing.wave).toBe(5);
    expect(BOSSES.stoneGolem.wave).toBe(10);
    expect(BOSSES.dragon.wave).toBe(15);
  });
});

describe('Goblin King', () => {
  it('announces phases, summons goblins, hastes and telegraphs its charge before charging', () => {
    const { w, s } = arena();
    const boss = spawn(s, 'goblinKing', 100, { hpMult: 100000 });
    const evs: { t: number; e: SimEvent }[] = [];
    evs.push(...timed(w, 8));
    expect(evs.some((x) => x.e.type === 'bossSpawned')).toBe(true);
    expect(evs.some((x) => x.e.type === 'bossPhase' && x.e.phase === 0 && !!x.e.announce)).toBe(true);
    expect(evs.some((x) => x.e.type === 'bossAbility' && x.e.ability === 'summon')).toBe(true);
    expect(s.enemies.filter((e) => e.active && !e.isBoss && e.kind === 'goblin').length).toBeGreaterThanOrEqual(3);
    expect(evs.some((x) => x.e.type === 'bossAbility' && x.e.ability === 'haste')).toBe(true);
    expect(s.enemies.some((e) => e.active && !e.isBoss && e.hasteTime > 0)).toBe(true);

    boss.hp = boss.maxHp * 0.5; // phase 1: charge
    const speedBefore = boss.vel;
    const later = timed(w, 14);
    expect(later.some((x) => x.e.type === 'bossPhase' && x.e.phase === 1 && !!x.e.announce)).toBe(true);
    const tele = timeOf(later, (e) => e.type === 'bossTelegraph' && e.ability === 'charge');
    expect(tele).toBeGreaterThan(0);
    const teleEvent = later.find((x) => x.e.type === 'bossTelegraph')!.e;
    expect(teleEvent.type === 'bossTelegraph' && teleEvent.duration).toBeGreaterThan(0.5);
    const go = timeOf(later, (e) => e.type === 'bossAbility' && e.ability === 'charge');
    expect(go).toBeGreaterThan(tele + 0.5);
    expect(speedBefore).toBeGreaterThanOrEqual(0);
  });

  it('stands still while telegraphing and then runs faster', () => {
    const { w, s } = arena();
    const boss = spawn(s, 'goblinKing', 100, { hpMult: 100000 });
    boss.hp = boss.maxHp * 0.5;
    let telegraphAt = -1;
    let posAtTelegraph = 0;
    let maxCharge = 0;
    for (let i = 0; i < 60 * 25; i++) {
      w.update(1 / 60);
      for (const e of w.drainEvents()) {
        if (e.type === 'bossTelegraph' && e.ability === 'charge' && telegraphAt < 0) { telegraphAt = i; posAtTelegraph = boss.progress; }
      }
      if (telegraphAt >= 0 && i < telegraphAt + 60) expect(boss.progress).toBeCloseTo(posAtTelegraph, 6);
      if (boss.chargeTime > 0) maxCharge = Math.max(maxCharge, boss.vel);
    }
    expect(telegraphAt).toBeGreaterThan(0);
    expect(maxCharge).toBeGreaterThan(boss.baseSpeed * 2);
  });
});

describe('Stone Golem', () => {
  it('shields nearby enemies and releases stonelings every 10% of lost HP', () => {
    const { w, s } = arena();
    const boss = spawn(s, 'stoneGolem', 300, { hpMult: 100000 });
    const ally = spawn(s, 'goblin', 290, { hpMult: 1000 });
    advance(w, 9);
    expect(ally.shield).toBeGreaterThan(0);
    const count = () => s.enemies.filter((e) => e.active && e.kind === 'stoneling').length;
    expect(count()).toBe(0);
    boss.hp = boss.maxHp * 0.74;
    advance(w, 0.2);
    expect(count()).toBe(2 * 2); // lost 26%: two milestones at 2 stonelings each
    boss.hp = boss.maxHp * 0.3;
    advance(w, 0.2);
    expect(count()).toBeGreaterThan(4);
    expect(boss.armor).toBeGreaterThanOrEqual(boss.baseArmor);
  });

  it('armorUp temporarily raises armor in phase 2', () => {
    const { w, s } = arena();
    const boss = spawn(s, 'stoneGolem', 300, { hpMult: 100000 });
    boss.hp = boss.maxHp * 0.45;
    let peak = 0;
    for (let i = 0; i < 60 * 14; i++) {
      w.update(1 / 60);
      peak = Math.max(peak, boss.armor);
    }
    expect(peak).toBeGreaterThan(boss.baseArmor + 0.1);
    expect(peak).toBeLessThanOrEqual(0.9);
  });
});

describe('Dragon', () => {
  it('flies, summons imps and telegraphs the fire breath before scorching towers and the castle', () => {
    const { w, s } = arena({ towers: [{ type: 'arrow', level: 1 }, { type: 'arrow', level: 1 }, { type: 'arrow', level: 1 }, { type: 'arrow', level: 1 }, { type: 'arrow', level: 1 }, { type: 'arrow', level: 1 }, { type: 'arrow', level: 1 }, { type: 'arrow', level: 1 }, { type: 'arrow', level: 1 }, { type: 'arrow', level: 1 }, { type: 'arrow', level: 1 }, { type: 'arrow', level: 1 }] });
    const boss = spawn(s, 'dragon', 20, { hpMult: 1e7 });
    boss.baseSpeed = 20;
    expect(boss.flying).toBe(true);
    const evs = timed(w, 25);
    const tele = evs.find((x) => x.e.type === 'bossTelegraph' && x.e.ability === 'fireBreath');
    expect(tele).toBeDefined();
    if (!tele || tele.e.type !== 'bossTelegraph') return;
    expect(tele.e.width).toBeGreaterThan(0);
    expect(tele.e.length).toBeGreaterThan(0);
    expect(tele.e.tx).toBeDefined();
    const breath = evs.find((x) => x.e.type === 'bossAbility' && x.e.ability === 'fireBreath')!;
    expect(breath.t).toBeGreaterThanOrEqual(tele.t + tele.e.duration - 0.05);
    const disabled = evs.filter((x) => x.e.type === 'towerDisabled');
    expect(disabled.length).toBeGreaterThan(0);
    for (const d of disabled) expect(d.t).toBeGreaterThanOrEqual(tele.t + tele.e.duration - 0.05);
    expect(evs.some((x) => x.e.type === 'bossAbility' && x.e.ability === 'summon')).toBe(true);
    expect(evs.some((x) => x.e.type === 'enemySpawned' && x.e.kind === 'imp')).toBe(true);
    // the beam is aimed at the densest tower group: the line contains at least 2 towers
    const dx = tele.e.tx! - tele.e.x;
    const dy = tele.e.ty! - tele.e.y;
    const dl = Math.hypot(dx, dy);
    let inLine = 0;
    for (const slot of SLOTS) {
      const px = slot.x - tele.e.x;
      const py = slot.y - tele.e.y;
      const along = (px * dx + py * dy) / dl;
      const perp = Math.abs(px * dy - py * dx) / dl;
      if (along > -20 && along < tele.e.length! && perp < tele.e.width! / 2 + 34) inLine++;
    }
    expect(inLine).toBeGreaterThanOrEqual(2);
  });

  it('a disabled tower stops shooting for the duration', () => {
    const { w, s } = arena({ towers: [{ type: 'arrow', level: 1 }] });
    const boss = spawn(s, 'dragon', 20, { hpMult: 1e7 });
    boss.baseSpeed = 20;
    boss.hp = boss.maxHp * 0.5; // phase 1 has disableTower
    const evs = timed(w, 20);
    const tele = evs.find((x) => x.e.type === 'bossTelegraph' && x.e.ability === 'disableTower');
    expect(tele).toBeDefined();
    if (!tele || tele.e.type !== 'bossTelegraph') return;
    expect(tele.e.slot).toBe(5);
    const dis = evs.find((x) => x.e.type === 'towerDisabled' && x.e.slot === 5 && x.t > tele.t + 1)!;
    expect(dis).toBeDefined();
    expect(dis.t).toBeGreaterThanOrEqual(tele.t + tele.e.duration - 0.05);
  });

  it('the fire breath damages the castle when it is inside the line', () => {
    const { w, s } = arena();
    // no towers on the board: the breath falls back to aiming at the castle
    const boss = spawn(s, 'dragon', 20, { hpMult: 1e7 });
    boss.baseSpeed = 25;
    boss.hp = boss.maxHp * 0.2;
    const tele = timed(w, 40);
    const breath = tele.find((x) => x.e.type === 'bossAbility' && x.e.ability === 'fireBreath');
    expect(breath).toBeDefined();
    const hit = tele.find((x) => x.e.type === 'castleHit' && x.t >= breath!.t - 0.02 && x.t <= breath!.t + 0.02);
    // aimed at the castle from the middle of the lane: inside the line (length 480 >= distance)
    const t = tele.find((x) => x.e.type === 'bossTelegraph' && x.e.ability === 'fireBreath')!.e;
    if (t.type === 'bossTelegraph') {
      const dist = Math.hypot(CASTLE.x - t.x, CASTLE.y - t.y);
      expect(Boolean(hit)).toBe(dist <= (t.length ?? 0) + CASTLE.height / 2);
    }
  });
});

describe('boss status rules', () => {
  it('freeze on bosses lasts 0.3 s and then grants 3 s immunity', () => {
    const { w, s } = arena({ idle: true });
    const boss = spawn(s, 'goblinKing', 300, { hpMult: 1e6 });
    s.abilities.length = 0;
    w.useAbility('freeze');
    const { applyFreeze } = require_statuses();
    expect(applyFreeze(s, boss, 5, null)).toBe(true);
    expect(boss.frozenTime).toBeLessThanOrEqual(0.3 + 1e-9);
    advance(w, 0.4);
    expect(boss.frozenTime).toBe(0);
    expect(applyFreeze(s, boss, 5, null)).toBe(false);
    advance(w, 3.2);
    expect(applyFreeze(s, boss, 5, null)).toBe(true);
  });
});

import * as statuses from '../../src/sim/statuses';
function require_statuses(): typeof statuses {
  return statuses;
}
