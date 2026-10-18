import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { TOWER_IDS } from '../../src/data/types';
import type { Effect } from '../../src/data/types';
import { arena, flag, internals, spawn, stat } from './helpers';

/** Every flag that creates work: procs, statuses, spreads, chains. */
const HEAVY: Effect[] = [
  flag('extraProjectiles', 1), flag('multishot', 2), flag('pierce', 2), flag('splitOnImpact', 3), flag('clusterBombs', 3),
  flag('slowOnHit', 0.2), flag('freezeChance', 0.1), flag('stunChance', 0.1), flag('burnOnHit', 0.4), flag('poisonOnHit', 1),
  flag('vulnerabilityOnHit', 0.1), flag('explosionOnHit', 60), flag('everyNthExplosion', 3), flag('fireZoneOnHit', 8),
  flag('chainLightningChance', 0.3), flag('critLightning', 1), flag('randomElement', 1), flag('elementalSecondary', 1),
  flag('fireSpread', 1), flag('flameExplosionOnDeath', 60), flag('poisonSpreadOnDeath', 1), flag('poisonExplosionOnDeath', 50),
  flag('frostNova', 70), flag('burnSpreadsPoison', 1), flag('meteorOnKillChance', 0.1), flag('infiniteChain', 1),
  stat('critChance', 'flat', 0.3),
];

describe('performance', () => {
  it('120 enemies and 12 level 5 towers with many flags: well under 4 ms per update', () => {
    // enough budget for 120+ enemies; they are high-HP and slow so they stay alive and spread out
    const { w, s } = arena({
      towers: Array.from({ length: 12 }, (_, i) => ({ type: TOWER_IDS[i % TOWER_IDS.length], level: 5 })),
      effects: HEAVY,
    });
    let spawned = 0;
    for (let i = 0; spawned < 120; i++) {
      const e = spawn(s, i % 7 === 0 ? 'bat' : i % 5 === 0 ? 'orc' : 'goblin', 20 + ((i * 21) % 2300), { hpMult: 400000 });
      e.baseSpeed *= 0.05;
      spawned++;
    }
    expect(s.alive).toBe(120);
    // warm up the JIT, then measure
    for (let i = 0; i < 120; i++) w.update(1 / 60);
    w.drainEvents();
    const frames = 30 * 60;
    let total = 0;
    let worst = 0;
    let events = 0;
    for (let i = 0; i < frames; i++) {
      const t0 = performance.now();
      w.update(1 / 60);
      const dt = performance.now() - t0;
      total += dt;
      if (dt > worst) worst = dt;
      if (i % 10 === 0) events += w.drainEvents().length;
    }
    const avg = total / frames;
    // eslint-disable-next-line no-console
    console.log(`perf: ${avg.toFixed(3)} ms avg per update(1/60), worst ${worst.toFixed(2)} ms, ${s.alive} enemies alive, ${events} events sampled`);
    expect(avg).toBeLessThan(4);
    expect(s.alive).toBeGreaterThan(100);
    expect(internals(w).projectiles.length).toBe(BALANCE.caps.maxProjectiles);
  });
});
