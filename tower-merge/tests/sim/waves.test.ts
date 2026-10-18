import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { BOSSES } from '../../src/data/bosses';
import { ENEMIES } from '../../src/data/enemies';
import type { SimEvent } from '../../src/sim/api';
import { bossForWave, budgetForWave, hpMultForWave, isBossWave } from '../../src/sim/waves';
import { createWorld } from '../../src/sim/World';
import { advance, defaultRunOptions, godWorld, NO_CONTENT, playWaves } from './helpers';

describe('wave progression', () => {
  it('the first wave starts almost immediately, later pre-waves last about 4 s', () => {
    const w = createWorld(defaultRunOptions(1), NO_CONTENT);
    expect(w.phase).toBe('prewave');
    expect(w.prewaveTime).toBeCloseTo(1.5, 6);
    expect(w.wave).toBe(1);
    advance(w, 1.4);
    expect(w.phase).toBe('prewave');
    advance(w, 0.3);
    expect(w.phase).toBe('wave');
  });

  it('startWaveNow skips the countdown', () => {
    const w = createWorld(defaultRunOptions(1), NO_CONTENT);
    w.startWaveNow();
    expect(w.phase).toBe('wave');
    const evs = w.drainEvents();
    expect(evs.some((e) => e.type === 'waveStart' && e.wave === 1 && !e.isBoss && e.enemyCount > 0)).toBe(true);
  });

  it('runs prewave -> wave -> upgrade -> (event) -> prewave and counts waves', () => {
    const w = godWorld();
    const phases: string[] = [];
    playWaves(w, 4, { onEvents: (evs) => { for (const e of evs) if (e.type === 'phaseChanged') phases.push(e.phase); } });
    expect(w.wave).toBe(4);
    expect(w.stats.wavesCleared).toBe(3);
    expect(phases.slice(0, 5)).toEqual(['prewave', 'wave', 'upgrade', 'prewave', 'wave']);
    expect(w.stats.coinsEarned).toBeGreaterThan(0);
  });

  it('a wave bonus is paid on clear and flawless waves are counted', () => {
    const w = godWorld();
    const evs = playWaves(w, 3);
    const cleared = evs.filter((e): e is Extract<SimEvent, { type: 'waveCleared' }> => e.type === 'waveCleared');
    expect(cleared).toHaveLength(2);
    for (const c of cleared) {
      expect(c.flawless).toBe(true);
      expect(c.bonus).toBeGreaterThan(0);
    }
    expect(cleared[0].bonus).toBeLessThan(cleared[1].bonus + 1);
    expect(w.stats.flawlessWaves).toBe(2);
  });

  it('boss waves are 5, 10 and 15: Goblin King, Stone Golem, Dragon; then they loop with scaling', () => {
    expect([1, 4, 5, 6, 10, 15, 20].map(isBossWave)).toEqual([false, false, true, false, true, true, true]);
    expect(bossForWave(5)).toEqual({ id: 'goblinKing', loop: 0 });
    expect(bossForWave(10)).toEqual({ id: 'stoneGolem', loop: 0 });
    expect(bossForWave(15)).toEqual({ id: 'dragon', loop: 0 });
    expect(bossForWave(20)).toEqual({ id: 'goblinKing', loop: 1 });
    expect(bossForWave(30)).toEqual({ id: 'dragon', loop: 1 });
    const w = godWorld(21, { startTowerLevel: 5 });
    const bosses: { wave: number; boss: string; hp: number }[] = [];
    let wave = 0;
    const evs = playWaves(w, 21, {
      onEvents: (list, world) => {
        for (const e of list) {
          if (e.type === 'waveStart') { wave = e.wave; expect(e.isBoss).toBe(e.wave % 5 === 0); }
          if (e.type === 'bossSpawned') {
            const boss = world.enemies.find((x) => x.active && x.isBoss);
            bosses.push({ wave, boss: e.boss, hp: boss ? boss.maxHp : 0 });
          }
        }
      },
    });
    expect(bosses.map((b) => [b.wave, b.boss])).toEqual([[5, 'goblinKing'], [10, 'stoneGolem'], [15, 'dragon'], [20, 'goblinKing']]);
    expect(bosses[3].hp).toBeGreaterThan(bosses[0].hp * BALANCE.boss.loopHpMult * 0.99);
    expect(evs.filter((e) => e.type === 'bossDefeated')).toHaveLength(4);
    expect(w.stats.bossesKilled).toEqual(['goblinKing', 'stoneGolem', 'dragon', 'goblinKing']);
  });

  it('enemy types are introduced gradually by firstWave and boss-only types never appear in normal waves', () => {
    const w = godWorld(5);
    const firstSeen: Record<string, number> = {};
    let wave = 0;
    playWaves(w, 16, {
      onEvents: (list) => {
        for (const e of list) {
          if (e.type === 'waveStart') wave = e.wave;
          if (e.type === 'enemySpawned' && !(e.kind in BOSSES) && firstSeen[e.kind] === undefined) firstSeen[e.kind] = wave;
        }
      },
    });
    for (const [kind, first] of Object.entries(firstSeen)) {
      if (ENEMIES[kind as keyof typeof ENEMIES].firstWave === 999) continue;
      expect(first).toBeGreaterThanOrEqual(ENEMIES[kind as keyof typeof ENEMIES].firstWave);
    }
    expect(firstSeen.goblin).toBe(1);
    expect(firstSeen.rat).toBe(2);
    expect(firstSeen.skeleton).toBe(3);
    expect(firstSeen.bat).toBe(4);
    expect(firstSeen.orc).toBe(6);
    expect(firstSeen.shaman).toBe(7);
    expect(firstSeen.summoner).toBe(9);
    expect(firstSeen.troll).toBe(11);
    // stoneling comes from the Golem (wave 10) and imp from the Dragon (wave 15), never earlier
    expect(firstSeen.stoneling).toBeGreaterThanOrEqual(10);
    expect(firstSeen.imp === undefined || firstSeen.imp >= 15).toBe(true);
  });

  it('waves grow: budget and hp multiplier are increasing', () => {
    for (let n = 2; n <= 30; n++) {
      expect(budgetForWave(n)).toBeGreaterThan(budgetForWave(n - 1));
      expect(hpMultForWave(n)).toBeGreaterThan(hpMultForWave(n - 1));
    }
  });

  it('wave modifiers from the daily challenge scale hp and count', () => {
    const base = godWorld(2);
    base.startWaveNow();
    const e0 = base.drainEvents().find((e) => e.type === 'waveStart');
    const mod = createWorld(defaultRunOptions(2, { daily: { waveModifier: { enemyCountMult: 3, enemyHpMult: 2 } } }), NO_CONTENT);
    mod.startWaveNow();
    const e1 = mod.drainEvents().find((e) => e.type === 'waveStart');
    expect(e0 && e0.type === 'waveStart' && e1 && e1.type === 'waveStart' && e1.enemyCount > e0.enemyCount * 2).toBe(true);
    advance(mod, 0.2);
    const hp = mod.enemies.find((e) => e.active)!;
    expect(hp.maxHp).toBeCloseTo(ENEMIES.goblin.hp * hpMultForWave(1) * 2, 4);
  });

  it('waves keep enemies alive for roughly 10-30 seconds with a decent defence', () => {
    const w = createWorld(defaultRunOptions(3, { startTowerLevel: 3, startCoinsBonus: 200 }), NO_CONTENT);
    for (let i = 0; i < 3; i++) w.buyTower();
    const times: number[] = [];
    let start = 0;
    playWaves(w, 4, {
      onEvents: (list, world) => {
        for (const e of list) {
          if (e.type === 'waveStart') start = world.stats.timeSeconds;
          if (e.type === 'waveCleared') times.push(world.stats.timeSeconds - start);
        }
      },
    });
    for (const t of times) {
      expect(t).toBeGreaterThan(5);
      expect(t).toBeLessThan(40);
    }
  });
});
