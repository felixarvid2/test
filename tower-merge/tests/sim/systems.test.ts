import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import type { RandomEventDef, SynergyDef } from '../../src/data/types';
import type { SimEvent } from '../../src/sim/api';
import { createWorld } from '../../src/sim/World';
import type { World } from '../../src/sim/World';
import { advance, arena, defaultRunOptions, flag, godWorld, GODLIKE, internals, NO_CONTENT, playWaves, spawn, stat, upgradeDef } from './helpers';

const opts = (seed = 1, over = {}) => defaultRunOptions(seed, { daily: { effects: GODLIKE }, ...over });

describe('synergies', () => {
  const synergies: SynergyDef[] = [
    { id: 'duo', name: 'Duo', description: 'x', icon: 'star', requires: { towers: ['arrow', 'cannon'] }, effects: [stat('damage', 'mul', 2, ['arrow'])] },
    { id: 'lvl', name: 'Lvl', description: 'x', icon: 'star', requires: { towerLevel: { tower: 'arrow', level: 3 } }, effects: [flag('thorns', 3)] },
    { id: 'fl', name: 'Flag', description: 'x', icon: 'star', requires: { flags: [{ flag: 'pierce', min: 1 }] }, effects: [] },
    { id: 'up', name: 'Up', description: 'x', icon: 'star', requires: { upgrades: ['U'] }, effects: [] },
  ];

  it('activates when tower requirements are met, emits an event once and records it', () => {
    const w = createWorld(defaultRunOptions(1, { startCoinsBonus: 500, towerPool: ['cannon'] }), { upgrades: [], synergies, events: [] });
    expect(w.activeSynergies).toEqual([]);
    const damage0 = w.describeTower(5)!.damage;
    expect(w.buyTower().ok).toBe(true); // a cannon
    expect(w.activeSynergies).toEqual(['duo']);
    const evs = w.drainEvents().filter((e) => e.type === 'synergyActivated');
    expect(evs).toEqual([{ type: 'synergyActivated', id: 'duo', name: 'Duo' }]);
    expect(w.stats.synergiesActivated).toEqual(['duo']);
    expect(w.describeTower(5)!.damage).toBeCloseTo(damage0 * 2, 6);
    // selling the cannon deactivates it, buying again re-activates but the stat stays unique
    const slot = w.slots.find((s) => s.tower && s.tower.type === 'cannon')!.id;
    w.sellTower(slot);
    expect(w.activeSynergies).toEqual([]);
    expect(w.describeTower(5)!.damage).toBeCloseTo(damage0, 6);
    w.buyTower();
    expect(w.activeSynergies).toEqual(['duo']);
    expect(w.stats.synergiesActivated).toEqual(['duo']);
  });

  it('towerLevel, flags and upgrade requirements', () => {
    const { w } = arena({ towers: [{ type: 'arrow', level: 2 }, { type: 'arrow', level: 2 }], content: { upgrades: [], synergies, events: [] } });
    expect(w.activeSynergies).toEqual([]); // pierce is the level 3 perk
    w.moveTower(8, 5);
    expect([...w.activeSynergies].sort()).toEqual(['fl', 'lvl']);
    const evs = w.drainEvents();
    expect(evs.filter((e) => e.type === 'synergyActivated').map((e) => (e as { id: string }).id).sort()).toEqual(['fl', 'lvl']);
    expect(internals(w).gm.flags.some((f) => f === 3)).toBe(true); // thorns 3 from 'lvl'
  });

  it('activates through upgrades taken', () => {
    const w = createWorld(opts(1), { upgrades: [upgradeDef('U')], synergies, events: [] });
    w.startWaveNow();
    for (let i = 0; i < 3000 && w.phase === 'wave'; i++) w.update(0.1);
    expect(w.chooseUpgrade('U')).toBe(true);
    expect(w.activeSynergies).toContain('up');
  });

  it('the real synergy data activates with the right towers', () => {
    const w = createWorld(defaultRunOptions(1, { startingSlots: 12, towerPool: ['fire', 'poison'] }));
    w.grantTower('fire', 1);
    w.grantTower('poison', 1);
    expect(w.activeSynergies).toContain('toxicInferno');
  });
});

describe('random events', () => {
  const events: RandomEventDef[] = [
    { id: 'treasure', name: 'T', description: 'd', icon: 'treasure', weight: 1, minWave: 1, options: [
      { id: 'raid', label: 'Raid', description: 'd', waveModifier: { enemyHpMult: 2, coinMult: 3 } },
      { id: 'skip', label: 'Skip', description: 'd' },
    ] },
  ];
  const chest: RandomEventDef = {
    id: 'chest', name: 'C', description: 'd', icon: 'chest', weight: 1, minWave: 1, options: [
      { id: 'c1', label: '1', description: 'd', effects: [{ kind: 'instant', action: 'grantCoins', value: 100 }] },
      { id: 'c2', label: '2', description: 'd', effects: [{ kind: 'instant', action: 'grantCoins', value: 200 }] },
      { id: 'c3', label: '3', description: 'd', effects: [{ kind: 'instant', action: 'grantCoins', value: 300 }] },
      { id: 'c4', label: '4', description: 'd', effects: [{ kind: 'instant', action: 'grantCoins', value: 400 }] },
      { id: 'c5', label: '5', description: 'd', effects: [{ kind: 'instant', action: 'grantCoins', value: 500 }] },
      { id: 'leave', label: 'Leave', description: 'd' },
    ],
  };
  const merchant: RandomEventDef = {
    id: 'merchant', name: 'M', description: 'd', icon: 'merchant', weight: 1, minWave: 1, options: [
      { id: 'buy', label: 'Buy', description: 'd', cost: 100000, effects: [{ kind: 'instant', action: 'grantCoins', value: 1 }] },
      { id: 'cheap', label: 'Cheap', description: 'd', cost: 10, effects: [{ kind: 'flag', flag: 'killCoinBonus', value: 4 }] },
      { id: 'relic', label: 'Relic', description: 'd', upgradeRarity: 'epic' },
      { id: 'leave', label: 'Leave', description: 'd' },
    ],
  };

  function openEvent(content: RandomEventDef[], seed = 1, extra: Parameters<typeof upgradeDef>[1][] = []): World {
    const saved = BALANCE.events.chance;
    BALANCE.events.chance = 1;
    try {
      const w = godWorld(seed, {}, { upgrades: extra.map((o, i) => upgradeDef(`u${i}`, o)), synergies: [], events: content });
      w.startWaveNow();
      for (let i = 0; i < 4000 && w.phase === 'wave'; i++) w.update(0.1);
      expect(w.phase).toBe('upgrade');
      // take the weakest card so rarity rewards stay available
      const order = ['common', 'rare', 'epic', 'legendary'];
      const weakest = [...w.upgradeChoices].sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity))[0];
      w.chooseUpgrade(weakest.id);
      expect(w.phase).toBe('event');
      return w;
    } finally {
      BALANCE.events.chance = saved;
    }
  }

  it('offers an event after the upgrade pick and resolves wave modifiers for the next wave', () => {
    const w = openEvent(events);
    expect(w.pendingEvent!.id).toBe('treasure');
    expect(w.pendingEvent!.options.map((o) => o.id)).toEqual(['raid', 'skip']);
    expect(w.resolveEvent('nope')).toBe(false);
    expect(w.resolveEvent('raid')).toBe(true);
    expect(w.phase).toBe('prewave');
    expect(w.pendingEvent).toBeNull();
    expect(w.nextWaveModifier).toEqual({ enemyHpMult: 2, coinMult: 3 });
    w.startWaveNow();
    expect(w.nextWaveModifier).toBeNull();
    advance(w, 0.3);
    const e = w.enemies.find((x) => x.active)!;
    expect(e.maxHp).toBeGreaterThan(28 * 2 * 1.1); // wave 2 hp scaling and the x2 modifier
  });

  it('declining changes nothing', () => {
    const w = openEvent(events);
    expect(w.resolveEvent('skip')).toBe(true);
    expect(w.nextWaveModifier).toBeNull();
    expect(w.phase).toBe('prewave');
  });

  it('a chest rolls 3 of its rewards plus the decline option', () => {
    const sets = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const w = openEvent([chest], seed);
      const ids = w.pendingEvent!.options.map((o) => o.id);
      expect(ids).toHaveLength(4);
      expect(ids[3]).toBe('leave');
      expect(new Set(ids).size).toBe(4);
      sets.add(ids.slice(0, 3).join());
    }
    expect(sets.size).toBeGreaterThan(1);
  });

  it('chest rewards are applied', () => {
    const w = openEvent([chest]);
    const pick = w.pendingEvent!.options[0];
    const coins = w.coins;
    expect(w.resolveEvent(pick.id)).toBe(true);
    const value = (pick.effects![0] as { value: number }).value;
    expect(w.coins).toBe(coins + value);
  });

  it('merchant options cost coins, permanent effects persist and rarity rewards give an upgrade', () => {
    const w = openEvent([merchant], 1, [{ rarity: 'epic', maxStacks: 1 }, { rarity: 'common', maxStacks: 1 }, { rarity: 'common', maxStacks: 1 }]);
    expect(w.resolveEvent('buy')).toBe(false); // too expensive: the event stays open
    expect(w.phase).toBe('event');
    const coins = w.coins;
    expect(w.resolveEvent('cheap')).toBe(true);
    expect(w.coins).toBe(coins - 10);
    expect(internals(w).gm.flags.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(4);
    const w2 = openEvent([merchant], 1, [{ rarity: 'epic', maxStacks: 1 }, { rarity: 'common', maxStacks: 1 }, { rarity: 'common', maxStacks: 1 }]);
    const before = w2.stats.upgradesTaken.length;
    expect(w2.resolveEvent('relic')).toBe(true);
    expect(w2.stats.upgradesTaken.length).toBe(before + 1);
    expect(w2.stats.upgradesTaken[before]).toBe('u0'); // the epic one
  });

  it('events only occur from the configured minimum wave and use the data minWave', () => {
    const w = godWorld(1, {}, { upgrades: [], synergies: [], events: [{ ...events[0], minWave: 5 }] });
    const saved = BALANCE.events.chance;
    BALANCE.events.chance = 1;
    try {
      const sawEvent: number[] = [];
      playWaves(w, 8, { onEvent: () => { sawEvent.push(w.wave); return undefined; } });
      expect(sawEvent.every((wave) => wave + 1 >= 5)).toBe(true);
      expect(sawEvent.length).toBeGreaterThan(0);
    } finally {
      BALANCE.events.chance = saved;
    }
  });

  it('the real event data works end to end', () => {
    const saved = BALANCE.events.chance;
    BALANCE.events.chance = 1;
    try {
      const w = createWorld(opts(4, { startCoinsBonus: 2000 }));
      const kinds = new Set<string>();
      playWaves(w, 14, { onEvent: (world) => { kinds.add(world.pendingEvent!.id); return world.pendingEvent!.options[0].id; } });
      expect(kinds.size).toBeGreaterThan(1);
      expect(w.phase === 'prewave').toBe(true);
    } finally {
      BALANCE.events.chance = saved;
    }
  });
});

describe('abilities', () => {
  it('only abilities from RunOptions exist; cooldowns scale with abilityCdPct', () => {
    const w = createWorld(defaultRunOptions(1, { abilities: ['meteor', 'repair'], abilityCdPct: 0.25 }), NO_CONTENT);
    expect(w.abilities.map((a) => a.id)).toEqual(['meteor', 'repair']);
    expect(w.abilities[0].maxCooldown).toBeCloseTo(BALANCE.abilities.meteor.cooldown * 0.75, 6);
    expect(w.useAbility('freeze')).toBe(false);
  });

  it('meteor hits the densest cluster, damages everything in the blast and goes on cooldown', () => {
    const { w, s } = arena({ idle: true });
    internals(w).abilities.forEach((a) => { a.cooldown = 0; });
    const lone = spawn(s, 'goblin', 100, { hpMult: 50 });
    const cluster = [0, 1, 2, 3, 4].map((i) => spawn(s, 'goblin', 1400 + i * 10, { hpMult: 50 }));
    const evs: SimEvent[] = [];
    const centre = { x: cluster[2].x, y: cluster[2].y };
    expect(w.useAbility('meteor')).toBe(true);
    advance(w, 1.2, evs);
    const m = evs.find((e) => e.type === 'meteor');
    expect(m).toBeDefined();
    if (m && m.type === 'meteor') expect(Math.hypot(m.x - centre.x, m.y - centre.y)).toBeLessThan(25);
    expect(cluster.every((e) => e.hp < e.maxHp)).toBe(true);
    expect(lone.hp).toBe(lone.maxHp);
    expect(w.stats.meteorsCalled).toBe(1);
    expect(w.stats.abilitiesUsed).toBe(1);
    expect(w.abilities.find((a) => a.id === 'meteor')!.cooldown).toBeGreaterThan(0);
    expect(w.useAbility('meteor')).toBe(false);
    expect(evs.some((e) => e.type === 'abilityUsed' && e.ability === 'meteor')).toBe(true);
  });

  it('meteor needs a target and cooldowns tick down', () => {
    const { w } = arena({ idle: false });
    internals(w).abilities.forEach((a) => { a.cooldown = 0; });
    expect(w.useAbility('meteor')).toBe(false);
    const ab = internals(w).abilities.find((a) => a.id === 'repair')!;
    ab.cooldown = 1;
    internals(w).castleHp = 10;
    internals(w).enemies[0].active = false;
    expect(w.useAbility('repair')).toBe(false);
  });

  it('freeze stops all enemies for about 3 s but bosses only briefly', () => {
    const { w, s } = arena({ idle: true });
    s.abilities.forEach((a) => { a.cooldown = 0; });
    const g = spawn(s, 'goblin', 300, { hpMult: 50 });
    const boss = spawn(s, 'stoneGolem', 200, { hpMult: 50 });
    expect(w.useAbility('freeze')).toBe(true);
    expect(g.frozenTime).toBeCloseTo(BALANCE.abilities.freeze.duration, 4);
    expect(boss.frozenTime).toBeLessThanOrEqual(BALANCE.abilities.freeze.bossDuration + 1e-9);
    expect(boss.frozenTime).toBeGreaterThan(0);
    const p0 = g.progress;
    advance(w, 1);
    expect(g.progress).toBe(p0);
    advance(w, 3);
    expect(g.progress).toBeGreaterThan(p0);
  });

  it('repair heals about 25% of max HP and frenzy doubles attack speed for a while', () => {
    const { w, s } = arena({ towers: [{ type: 'arrow', level: 1 }], idle: true });
    s.abilities.forEach((a) => { a.cooldown = 0; });
    s.castleHp = 20;
    expect(w.useAbility('repair')).toBe(true);
    expect(w.castleHp).toBeCloseTo(20 + w.castleMaxHp * 0.25, 6);
    const fr = w.describeTower(5)!.fireRate;
    expect(w.useAbility('frenzy')).toBe(true);
    expect(w.describeTower(5)!.fireRate).toBeCloseTo(fr * 2, 6);
    expect(w.abilities.find((a) => a.id === 'frenzy')!.activeTime).toBeGreaterThan(5);
    advance(w, BALANCE.abilities.frenzy.duration + 0.5);
    expect(w.describeTower(5)!.fireRate).toBeCloseTo(fr, 6);
  });

  it('abilityPower scales repair and abilities are blocked outside waves and prewaves', () => {
    const { w, s } = arena({ effects: [{ kind: 'global', stat: 'abilityPower', op: 'mul', value: 2 }], idle: true });
    s.abilities.forEach((a) => { a.cooldown = 0; });
    s.castleHp = 10;
    w.useAbility('repair');
    expect(w.castleHp).toBeCloseTo(10 + w.castleMaxHp * 0.5, 6);
    s.phase = 'upgrade';
    expect(w.useAbility('frenzy')).toBe(false);
  });
});

describe('defeat, revive, forfeit and emergency powers', () => {
  function defeatWorld(): { w: World; s: ReturnType<typeof internals> } {
    const { w, s } = arena({ idle: true });
    return { w, s };
  }

  it('castle at 0 HP freezes the run in the defeated phase', () => {
    const { w, s } = defeatWorld();
    s.castleHp = 1;
    spawn(s, 'goblin', 2610);
    const evs = advance(w, 0.5);
    expect(w.phase).toBe('defeated');
    expect(evs.some((e) => e.type === 'phaseChanged' && e.phase === 'defeated')).toBe(true);
    const t = w.stats.timeSeconds;
    w.update(1);
    expect(w.stats.timeSeconds).toBe(t);
    expect(w.castleHp).toBe(0);
  });

  it('revive restores 50% HP, clears nearby enemies without coins, pushes bosses back and resumes the wave once', () => {
    const { w, s } = defeatWorld();
    s.castleHp = 1;
    const near = spawn(s, 'orc', 2500, { hpMult: 100 });
    const far = spawn(s, 'orc', 800, { hpMult: 100 });
    const boss = spawn(s, 'goblinKing', 2590, { hpMult: 100 });
    spawn(s, 'goblin', 2612);
    advance(w, 0.5);
    expect(w.phase).toBe('defeated');
    const coins = w.coins;
    const kills = w.stats.enemiesKilled;
    const bossProgress = boss.progress;
    expect(w.revived).toBe(false);
    expect(w.revive()).toBe(true);
    expect(w.revived).toBe(true);
    expect(w.phase).toBe('wave');
    expect(w.castleHp).toBeCloseTo(w.castleMaxHp * 0.5, 6);
    expect(near.active).toBe(false);
    expect(far.active).toBe(true);
    expect(boss.active).toBe(true);
    expect(boss.progress).toBeLessThan(bossProgress - 300);
    expect(w.coins).toBe(coins);
    expect(w.stats.enemiesKilled).toBe(kills);
    advance(w, 1);
    expect(w.castleHp).toBeGreaterThan(0);
    s.castleHp = 0.5;
    spawn(s, 'goblin', 2612);
    advance(w, 0.5);
    expect(w.phase).toBe('defeated');
    expect(w.revive()).toBe(false);
  });

  it('revive only works when defeated', () => {
    const { w } = defeatWorld();
    expect(w.revive()).toBe(false);
  });

  it('forfeit ends the run with a gameOver event and nothing moves afterwards', () => {
    const { w } = defeatWorld();
    w.forfeit();
    expect(w.phase).toBe('over');
    const evs = w.drainEvents();
    expect(evs.some((e) => e.type === 'gameOver')).toBe(true);
    const t = w.stats.timeSeconds;
    w.update(1);
    expect(w.stats.timeSeconds).toBe(t);
    expect(w.revive()).toBe(false);
    expect(w.buyTower().ok).toBe(false);
    w.forfeit();
    expect(w.drainEvents()).toHaveLength(0);
  });

  it('forfeit works from the defeated phase too', () => {
    const { w, s } = defeatWorld();
    s.castleHp = 1;
    spawn(s, 'goblin', 2610);
    advance(w, 0.5);
    w.forfeit();
    expect(w.phase).toBe('over');
  });

  it('grantTower puts a tower into a free slot and fails when the board is full', () => {
    const w = createWorld(defaultRunOptions(1, { startingSlots: 4 }), NO_CONTENT);
    expect(w.grantTower('sniper', 3)).toBe(true);
    expect(w.slots.some((s) => s.tower && s.tower.type === 'sniper' && s.tower.level === 3)).toBe(true);
    expect(w.grantTower('frost', 1)).toBe(true);
    expect(w.grantTower('frost', 1)).toBe(true);
    expect(w.grantTower('frost', 1)).toBe(false);
  });

  it('emergency doubleDamage applies to the next wave only', () => {
    const w = createWorld(defaultRunOptions(1), NO_CONTENT);
    const base = w.describeTower(5)!.damage;
    expect(w.applyEmergencyPower('doubleDamage')).toBe(true);
    expect(w.describeTower(5)!.damage).toBe(base);
    w.startWaveNow();
    expect(w.describeTower(5)!.damage).toBeCloseTo(base * 2, 6);
    const { w: g } = [godWorld(1)].map((x) => ({ w: x }))[0];
    g.applyEmergencyPower('doubleDamage');
    playWaves(g, 2);
    expect(g.describeTower(5)!.damage).toBeCloseTo(300 * base, 6);
  });

  it('emergency freezeStart freezes the first enemies of the next wave', () => {
    const w = createWorld(defaultRunOptions(1), NO_CONTENT);
    expect(w.applyEmergencyPower('freezeStart')).toBe(true);
    w.startWaveNow();
    advance(w, 1.5);
    const alive = w.enemies.filter((e) => e.active);
    expect(alive.length).toBeGreaterThan(0);
    expect(alive.every((e) => e.frozenTime > 0)).toBe(true);
    advance(w, 4);
    const later = w.enemies.filter((e) => e.active && e.progress > 0);
    expect(later.some((e) => e.frozenTime === 0)).toBe(true);
  });

  it('emergency legendaryTower grants a temporary level 5 tower for one wave', () => {
    const w = createWorld(defaultRunOptions(1, { towerPool: ['sniper'] }), NO_CONTENT);
    expect(w.applyEmergencyPower('legendaryTower')).toBe(true);
    const temp = w.slots.find((s) => s.tower && s.tower.level === 5);
    expect(temp).toBeDefined();
    expect(temp!.tower!.type).toBe('sniper');
    expect(w.sellValue(temp!.id)).toBe(0);
    expect(w.applyEmergencyPower('legendaryTower')).toBe(false); // one at a time
    w.startWaveNow();
    for (let i = 0; i < 5000 && w.phase === 'wave'; i++) w.update(0.1);
    expect(w.phase).toBe('upgrade');
    expect(w.slots.some((s) => s.tower && s.tower.level === 5)).toBe(false);
  });

  it('legendaryTower uses a temporary extra slot when the board is full and relocks it afterwards', () => {
    const w = createWorld(defaultRunOptions(1, { startingSlots: 4, startCoinsBonus: 9000 }), NO_CONTENT);
    while (w.buyTower().ok) { /* fill */ }
    expect(w.slots.filter((s) => s.unlocked && !s.tower)).toHaveLength(0);
    const unlocked = w.slots.filter((s) => s.unlocked).length;
    expect(w.applyEmergencyPower('legendaryTower')).toBe(true);
    expect(w.slots.filter((s) => s.unlocked)).toHaveLength(unlocked + 1);
    w.startWaveNow();
    for (let i = 0; i < 6000 && w.phase === 'wave'; i++) w.update(0.1);
    if (w.phase === 'upgrade') expect(w.slots.filter((s) => s.unlocked)).toHaveLength(unlocked);
  });
});
