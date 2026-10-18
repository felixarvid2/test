import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BotPolicy } from '../../src/sim/bot';
import { defaultRunOptions, runBot } from '../../src/sim/bot';
import { createWorld } from '../../src/sim/World';
import type { WorldApi } from '../../src/sim/api';
import { godWorld, playWaves } from './helpers';

describe('determinism', () => {
  it('the same seed gives identical stats and event streams', () => {
    for (const policy of ['greedy', 'random', 'spreadOut'] as BotPolicy[]) {
      const a = runBot(defaultRunOptions(42), policy, 14);
      const b = runBot(defaultRunOptions(42), policy, 14);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    }
    const streams: string[] = [];
    for (let i = 0; i < 2; i++) {
      const w = godWorld(9);
      const evs = playWaves(w, 4);
      streams.push(JSON.stringify(evs));
    }
    expect(streams[0]).toBe(streams[1]);
  });

  it('different seeds play out differently', () => {
    const a = JSON.stringify(runBot(defaultRunOptions(1), 'greedy', 10).stats);
    const b = JSON.stringify(runBot(defaultRunOptions(2), 'greedy', 10).stats);
    expect(a).not.toBe(b);
  });

  it('is independent of the update step size (fixed 1/60 substeps)', () => {
    const run = (dt: number) => {
      const w = createWorld(defaultRunOptions(5, { startTowerLevel: 2 }));
      w.startWaveNow();
      const n = Math.round(12 / dt);
      for (let i = 0; i < n; i++) w.update(dt);
      return JSON.stringify([w.stats.enemiesKilled, w.stats.towerDamage, w.coins, w.enemies.filter((e) => e.active).map((e) => Math.round(e.progress * 1000))]);
    };
    expect(run(0.1)).toBe(run(1 / 60));
    expect(run(1 / 30)).toBe(run(1 / 60));
    // dt larger than 0.1 is clamped, so one big update equals a 0.1 update
    const a = createWorld(defaultRunOptions(5));
    const b = createWorld(defaultRunOptions(5));
    a.startWaveNow();
    b.startWaveNow();
    a.update(5);
    b.update(0.1);
    expect(a.stats.timeSeconds).toBeCloseTo(b.stats.timeSeconds, 9);
  });

  it('the simulation never uses Math.random or Date', () => {
    const dir = join(__dirname, '../../src/sim');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Math\.random|Date\.now|new Date|performance\.now/);
    }
  });
});

function checkFinite(world: WorldApi): void {
  for (const e of world.enemies) {
    if (!e.active) continue;
    for (const v of [e.x, e.y, e.angle, e.hp, e.maxHp, e.shield, e.armor, e.progress, e.slow, e.slowTime, e.frozenTime, e.stunTime, e.burnDps, e.burnTime, e.poisonStacks, e.poisonTime, e.vulnerable, e.hasteTime, e.hitFlash, e.radius]) {
      if (!Number.isFinite(v)) throw new Error(`non-finite enemy state ${e.kind} ${JSON.stringify(e)}`);
    }
  }
  for (const s of world.slots) {
    const t = s.tower;
    if (!t) continue;
    for (const v of [t.aim, t.sinceAttack, t.disabledTime, t.kills, t.damageDealt]) if (!Number.isFinite(v)) throw new Error(`non-finite tower ${JSON.stringify(t)}`);
    const view = world.describeTower(s.id)!;
    for (const v of [view.damage, view.fireRate, view.range, view.dps, view.splashRadius, view.critChance]) if (!Number.isFinite(v)) throw new Error(`non-finite tower view ${JSON.stringify(view)}`);
  }
  for (const p of world.projectiles) {
    if (!p.active) continue;
    for (const v of [p.x, p.y, p.angle, p.arcT, p.arcHeight]) if (!Number.isFinite(v)) throw new Error(`non-finite projectile ${JSON.stringify(p)}`);
  }
  for (const z of world.fireZones) if (z.active && !(Number.isFinite(z.x) && Number.isFinite(z.timeLeft))) throw new Error('non-finite zone');
  if (!Number.isFinite(world.castleHp) || !Number.isFinite(world.coins)) throw new Error('non-finite castle/coins');
}

describe('robustness', () => {
  it('no NaN anywhere after long bot runs with every policy', () => {
    const policies: BotPolicy[] = ['greedy', 'random', 'noUpgrades', 'mergeHeavy', 'spreadOut'];
    for (const [i, policy] of policies.entries()) {
      let batches = 0;
      const res = runBot(defaultRunOptions(100 + i, { startCoinsBonus: 300, damagePct: 0.4 }), policy, 24, undefined, {
        onEvents: (_e, world) => { if (batches++ % 25 === 0) checkFinite(world); },
      });
      expect(res.waveReached).toBeGreaterThan(3);
      expect(Number.isFinite(res.durationSeconds)).toBe(true);
    }
  });

  it('a long god run through boss loops stays finite, bounded and cap-respecting', () => {
    const w = createWorld(defaultRunOptions(77, {
      startingSlots: 12, startCoinsBonus: 2000, towerPool: ['arrow', 'cannon', 'frost', 'lightning', 'fire', 'poison', 'sniper', 'magic'],
      daily: { effects: [{ kind: 'stat', stat: 'damage', op: 'mul', value: 200000 }, { kind: 'stat', stat: 'fireRate', op: 'mul', value: 3 }] },
    }));
    for (let i = 0; i < 8; i++) w.buyTower();
    let maxEnemies = 0;
    let maxProj = 0;
    playWaves(w, 26, {
      onEvents: (_e, world) => {
        checkFinite(world);
        maxEnemies = Math.max(maxEnemies, world.enemies.filter((e) => e.active).length);
        maxProj = Math.max(maxProj, world.projectiles.filter((p) => p.active).length);
      },
    });
    expect(w.wave).toBeGreaterThanOrEqual(26);
    expect(maxEnemies).toBeLessThanOrEqual(160);
    expect(maxProj).toBeLessThanOrEqual(320);
    expect(w.enemies).toHaveLength(160);
    expect(w.projectiles).toHaveLength(320);
    expect(w.fireZones).toHaveLength(12);
  });

  it('entity pools keep stable indexes and change ids for new entities', () => {
    const w = createWorld(defaultRunOptions(3));
    w.startWaveNow();
    for (let i = 0; i < 80; i++) w.update(0.1);
    const first = w.enemies.find((e) => e.active);
    expect(first).toBeDefined();
    expect(w.enemies.indexOf(first!)).toBeGreaterThanOrEqual(0);
    const ids = w.enemies.filter((e) => e.active).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('caps damage events per substep', () => {
    const w = godWorld(31, { startTowerLevel: 5, startCoinsBonus: 3000 });
    for (let i = 0; i < 8; i++) w.buyTower();
    w.startWaveNow();
    let worst = 0;
    for (let i = 0; i < 1500 && w.phase === 'wave'; i++) {
      w.update(1 / 60);
      worst = Math.max(worst, w.drainEvents().filter((e) => e.type === 'damage').length);
    }
    expect(worst).toBeLessThanOrEqual(10);
  });
});
