import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { BOSSES } from '../../src/data/bosses';
import { MAX_TOWER_LEVEL, TOWER_IDS } from '../../src/data/types';
import { defaultRunOptions } from '../../src/sim/bot';
import { createWorld } from '../../src/sim/World';
import { runBench } from '../../tools/balance/towerBench';

const NO_CONTENT = { upgrades: [], synergies: [], events: [] };

/** Sustained single-target dps of a tower of the given level (the tooltip estimate: volley, crits, burn and poison included). */
function staticDps(type: (typeof TOWER_IDS)[number], level: number): number {
  const w = createWorld(defaultRunOptions(1, { startingSlots: 12, towerPool: [...TOWER_IDS] }), NO_CONTENT);
  w.sellTower(5);
  w.grantTower(type, level);
  return (w.describeTower(5) as { dps: number }).dps;
}

describe('tower balance', () => {
  it('level 2 deals 2.0x to 2.8x the dps of level 1 for every tower, and every later level 1.5x to 3x', () => {
    for (const t of TOWER_IDS) {
      const dps = Array.from({ length: MAX_TOWER_LEVEL }, (_, i) => staticDps(t, i + 1));
      expect(dps[1] / dps[0], `${t} L2/L1`).toBeGreaterThanOrEqual(2.0);
      expect(dps[1] / dps[0], `${t} L2/L1`).toBeLessThanOrEqual(2.8);
      for (let l = 2; l < MAX_TOWER_LEVEL; l++) {
        expect(dps[l] / dps[l - 1], `${t} L${l + 1}/L${l}`).toBeGreaterThanOrEqual(1.5);
        expect(dps[l] / dps[l - 1], `${t} L${l + 1}/L${l}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('no tower is useless or dominant at equal level in the controlled benchmark (frost is a slow tower and exempt from the floor)', () => {
    const b = runBench();
    for (let l = 0; l < MAX_TOWER_LEVEL; l++) {
      const avg = TOWER_IDS.reduce((a, t) => a + b.mixed[t][l], 0) / TOWER_IDS.length;
      for (const t of TOWER_IDS) {
        const ratio = b.mixed[t][l] / avg;
        expect(ratio, `${t} L${l + 1} vs average`).toBeLessThanOrEqual(2.4);
        if (t !== 'frost') expect(ratio, `${t} L${l + 1} vs average`).toBeGreaterThanOrEqual(0.35);
        expect(Number.isFinite(b.mixed[t][l])).toBe(true);
      }
    }
  }, 60_000);
});

describe('boss mechanics', () => {
  it('the Dragon cannot delete the castle or lock the board', () => {
    const phases = BOSSES.dragon.phases;
    for (const ph of phases) {
      for (const ab of ph.abilities) {
        if (ab.kind === 'fireBreath') {
          expect(ab.castleDamage).toBeLessThanOrEqual(BALANCE.castle.hp * 0.2);
          expect(ab.telegraph).toBeGreaterThanOrEqual(1);
          expect(ab.interval * ph.intervalMult).toBeGreaterThanOrEqual(6);
        }
        if (ab.kind === 'disableTower') {
          expect(ab.duration).toBeLessThanOrEqual(6);
          expect(ab.telegraph).toBeGreaterThanOrEqual(1);
          // one tower at a time (the sim only picks enabled towers) and a gap after it recovers, so even a lone tower is never locked for good
          expect(ab.interval * ph.intervalMult).toBeGreaterThanOrEqual(ab.duration * 1.25);
        }
      }
    }
  });

  it('bosses carry real hit points and appear on the documented waves', () => {
    expect(BOSSES.goblinKing.wave).toBe(BALANCE.waves.bossEveryNWaves);
    expect(BOSSES.stoneGolem.hp).toBeGreaterThan(BOSSES.goblinKing.hp);
    expect(BOSSES.dragon.hp).toBeGreaterThan(BOSSES.stoneGolem.hp);
  });
});
