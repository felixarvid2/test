import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import type { UpgradeDef } from '../../src/data/types';
import { createWorld } from '../../src/sim/World';
import type { World } from '../../src/sim/World';
import { advance, defaultRunOptions, GODLIKE, godWorld, internals, stat, upgradeDef } from './helpers';

/** Plays wave 1 and returns when the upgrade screen is open. */
function toUpgrade(w: World): void {
  w.startWaveNow();
  for (let i = 0; i < 4000 && w.phase === 'wave'; i++) w.update(0.1);
  expect(w.phase).toBe('upgrade');
}

const fixture: UpgradeDef[] = [
  upgradeDef('A', { maxStacks: 1, effects: [stat('damage', 'pct', 0.1)] }),
  upgradeDef('B', { maxStacks: 2, rarity: 'rare', requires: { anyTower: ['sniper'] } }),
  upgradeDef('C', { maxStacks: 1, rarity: 'epic', requires: { upgrades: ['A'] } }),
  upgradeDef('D', { maxStacks: 3, requires: { minWave: 5 } }),
  upgradeDef('E', { maxStacks: 3 }),
  upgradeDef('F', { maxStacks: 1, rarity: 'rare' }),
  upgradeDef('G', { maxStacks: 1, rarity: 'legendary' }),
];

const opts = (seed: number, over = {}) => defaultRunOptions(seed, { daily: { effects: GODLIKE }, ...over });

describe('upgrade offers', () => {
  it('offers three distinct upgrades', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const w = createWorld(opts(seed), { upgrades: fixture, synergies: [], events: [] });
      toUpgrade(w);
      const ids = w.upgradeChoices.map((u) => u.id);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
    }
  });

  it('respects requires: anyTower, upgrades and minWave', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const w = createWorld(opts(seed), { upgrades: fixture, synergies: [], events: [] });
      toUpgrade(w);
      for (const u of w.upgradeChoices) seen.add(u.id);
    }
    // wave 1: no sniper in the pool, A not taken, wave < 5
    expect(seen.has('B')).toBe(false);
    expect(seen.has('C')).toBe(false);
    expect(seen.has('D')).toBe(false);
    expect(seen.has('A') && seen.has('E') && seen.has('F')).toBe(true);
  });

  it('anyTower accepts towers in the buy pool and towers on the board', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const w = createWorld(opts(seed, { towerPool: ['arrow', 'sniper'] }), { upgrades: fixture, synergies: [], events: [] });
      toUpgrade(w);
      for (const u of w.upgradeChoices) seen.add(u.id);
    }
    expect(seen.has('B')).toBe(true);
    // board only: grant a sniper
    const w = createWorld(opts(3), { upgrades: [upgradeDef('S', { requires: { anyTower: ['sniper'] } })], synergies: [], events: [] });
    expect(w.grantTower('sniper', 1)).toBe(true);
    toUpgrade(w);
    expect(w.upgradeChoices.some((u) => u.id === 'S')).toBe(true);
  });

  it('a required upgrade unlocks follow-ups and minWave opens up later', () => {
    const w = createWorld(opts(3), { upgrades: [upgradeDef('A'), upgradeDef('C', { requires: { upgrades: ['A'] }, maxStacks: 1 }), upgradeDef('D', { requires: { minWave: 3 } })], synergies: [], events: [] });
    toUpgrade(w);
    expect(w.upgradeChoices.map((u) => u.id)).not.toContain('C');
    expect(w.upgradeChoices.map((u) => u.id)).not.toContain('D'); // offered after wave 1: upcoming wave 2 < 3
    expect(w.chooseUpgrade('A')).toBe(true);
    let guard = 0;
    while (w.phase !== 'upgrade' && guard++ < 5000) {
      if (w.phase === 'event') w.resolveEvent(w.pendingEvent!.options.slice(-1)[0].id);
      else w.update(0.1);
    }
    expect(w.phase).toBe('upgrade');
    const ids = w.upgradeChoices.map((u) => u.id);
    expect(ids).toContain('C');
    expect(ids).toContain('D');
    expect(ids).not.toContain('A'); // unique, already taken
  });

  it('respects maxStacks', () => {
    const w = createWorld(opts(4), { upgrades: [upgradeDef('X', { maxStacks: 2, effects: [stat('damage', 'pct', 0.1)] })], synergies: [], events: [] });
    let takenX = 0;
    for (let round = 0; round < 4; round++) {
      let guard = 0;
      while (w.phase !== 'upgrade' && guard++ < 8000) {
        if (w.phase === 'event') w.resolveEvent(w.pendingEvent!.options.slice(-1)[0].id);
        else w.update(0.1);
      }
      const hasX = w.upgradeChoices.some((u) => u.id === 'X');
      if (hasX) {
        takenX++;
        w.chooseUpgrade('X');
      } else {
        w.chooseUpgrade(w.upgradeChoices[0].id);
      }
    }
    expect(takenX).toBe(2);
    expect(w.stats.upgradesTaken.filter((u) => u === 'X')).toHaveLength(2);
  });

  it('falls back to generic cards when the pool is small and still offers three', () => {
    const w = createWorld(opts(5), { upgrades: [upgradeDef('only')], synergies: [], events: [] });
    toUpgrade(w);
    expect(w.upgradeChoices).toHaveLength(3);
    expect(w.upgradeChoices.map((u) => u.id)).toContain('only');
    const empty = createWorld(opts(5), { upgrades: [], synergies: [], events: [] });
    toUpgrade(empty);
    expect(empty.upgradeChoices).toHaveLength(3);
    const coins = empty.coins;
    const hp = empty.castleHp;
    expect(empty.chooseUpgrade(empty.upgradeChoices[0].id)).toBe(true);
    expect(empty.coins + (hp - empty.castleHp)).toBeGreaterThanOrEqual(coins);
  });

  it('weights rarity by wave band: no legendary in the first waves, legendary possible later', () => {
    let early = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const w = createWorld(opts(seed), { upgrades: fixture, synergies: [], events: [] });
      toUpgrade(w);
      if (w.upgradeChoices.some((u) => u.rarity === 'legendary')) early++;
    }
    expect(BALANCE.rarity[0].weights.legendary).toBe(0);
    expect(early).toBe(0);
    // later band: draw directly many times through rerolls
    const w = createWorld(opts(9, { freeRerolls: 400 }), { upgrades: fixture, synergies: [], events: [] });
    toUpgrade(w);
    internals(w).wave = 12;
    let legendary = 0;
    let commonOnly = 0;
    for (let i = 0; i < 300; i++) {
      w.rerollUpgrades();
      if (w.upgradeChoices.some((u) => u.rarity === 'legendary')) legendary++;
      if (w.upgradeChoices.every((u) => u.rarity === 'common')) commonOnly++;
    }
    expect(legendary).toBeGreaterThan(20);
    expect(commonOnly).toBeLessThan(250);
  });

  it('counts legendary picks and records upgrades taken', () => {
    const w = createWorld(opts(2), { upgrades: [upgradeDef('L', { rarity: 'legendary', maxStacks: 1 })], synergies: [], events: [] });
    toUpgrade(w);
    expect(w.upgradeChoices.map((u) => u.id)).toContain('L');
    w.chooseUpgrade('L');
    expect(w.stats.legendariesPicked).toBe(1);
    expect(w.stats.upgradesTaken).toEqual(['L']);
    expect(w.drainEvents().some((e) => e.type === 'upgradePicked' && e.id === 'L' && e.rarity === 'legendary')).toBe(true);
  });

  it('applies instant effects on pick', () => {
    const instants = [
      upgradeDef('heal', { effects: [{ kind: 'instant', action: 'healCastle', value: 0.5 }] }),
      upgradeDef('coins', { effects: [{ kind: 'instant', action: 'grantCoins', value: 321 }] }),
      upgradeDef('tower', { effects: [{ kind: 'instant', action: 'grantTower', value: 3, tower: ['frost'] }] }),
      upgradeDef('slot', { effects: [{ kind: 'instant', action: 'unlockSlot', value: 1 }] }),
      upgradeDef('cd', { effects: [{ kind: 'instant', action: 'resetCooldowns', value: 0 }] }),
    ];
    for (const id of ['heal', 'coins', 'tower', 'slot', 'cd']) {
      const w = createWorld(opts(6), { upgrades: instants.filter((u) => u.id === id), synergies: [], events: [] });
      toUpgrade(w);
      internals(w).castleHp = 40;
      const coins = w.coins;
      const unlocked = w.slots.filter((s) => s.unlocked).length;
      const towers = w.slots.filter((s) => s.tower).length;
      expect(w.abilities.some((a) => a.cooldown > 0)).toBe(true);
      expect(w.chooseUpgrade(id)).toBe(true);
      if (id === 'heal') expect(w.castleHp).toBeCloseTo(40 + w.castleMaxHp * 0.5, 6);
      if (id === 'coins') expect(w.coins).toBe(coins + 321);
      if (id === 'tower') {
        expect(w.slots.filter((s) => s.tower)).toHaveLength(towers + 1);
        expect(w.slots.some((s) => s.tower && s.tower.type === 'frost' && s.tower.level === 3)).toBe(true);
      }
      if (id === 'slot') expect(w.slots.filter((s) => s.unlocked)).toHaveLength(unlocked + 1);
      if (id === 'cd') expect(w.abilities.every((a) => a.cooldown === 0)).toBe(true);
    }
  });

  it('chooseUpgrade only works on the upgrade screen with an offered id', () => {
    const w = createWorld(opts(3), { upgrades: fixture, synergies: [], events: [] });
    expect(w.chooseUpgrade('A')).toBe(false);
    toUpgrade(w);
    expect(w.chooseUpgrade('not-offered')).toBe(false);
    expect(w.phase).toBe('upgrade');
  });
});

describe('rerolls', () => {
  it('free rerolls come from RunOptions and are consumed; one paid reroll per screen', () => {
    const w = createWorld(opts(8, { freeRerolls: 2 }), { upgrades: fixture, synergies: [], events: [] });
    toUpgrade(w);
    expect(w.freeRerolls).toBe(2);
    const before = w.upgradeChoices.map((u) => u.id).join();
    expect(w.rerollUpgrades()).toBe(true);
    expect(w.freeRerolls).toBe(1);
    expect(w.rerollUpgrades()).toBe(true);
    expect(w.freeRerolls).toBe(0);
    expect(w.rerollUpgrades()).toBe(false);
    expect(w.rerollUpgrades(true)).toBe(true);
    expect(w.rerollUpgrades(true)).toBe(false);
    expect(w.upgradeChoices).toHaveLength(3);
    expect(typeof before).toBe('string');
  });

  it('a reroll avoids the previous cards when the pool is big enough', () => {
    const many = Array.from({ length: 12 }, (_, i) => upgradeDef(`u${i}`, { maxStacks: 1 }));
    const w = createWorld(opts(8, { freeRerolls: 5 }), { upgrades: many, synergies: [], events: [] });
    toUpgrade(w);
    const prev = w.upgradeChoices.map((u) => u.id);
    w.rerollUpgrades();
    for (const u of w.upgradeChoices) expect(prev).not.toContain(u.id);
  });

  it('the paid reroll counter resets on the next screen and rerolls fail outside the screen', () => {
    const w = godWorld(3, {}, { upgrades: fixture, synergies: [], events: [] });
    expect(w.rerollUpgrades(true)).toBe(false);
    toUpgrade(w);
    expect(w.rerollUpgrades(true)).toBe(true);
    w.chooseUpgrade(w.upgradeChoices[0].id);
    let guard = 0;
    while (w.phase !== 'upgrade' && guard++ < 5000) {
      if (w.phase === 'event') w.resolveEvent(w.pendingEvent!.options.slice(-1)[0].id);
      else w.update(0.1);
    }
    expect(w.rerollUpgrades(true)).toBe(true);
    advance(w, 0.1);
  });
});
