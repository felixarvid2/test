import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyModifier, MetaUpgradeDef } from '../../src/data/types';

// Fixture content, so the tests do not depend on the live balance numbers.
const FIXTURE_META: MetaUpgradeDef[] = [
  { id: 'hp', name: 'HP', description: '', icon: 'castle', stat: 'castleHp', valuePerLevel: 10, maxLevel: 3, baseCost: 20, costGrowth: 1.5 },
  { id: 'coins', name: 'Coins', description: '', icon: 'coin', stat: 'startCoins', valuePerLevel: 15, maxLevel: 4, baseCost: 10, costGrowth: 1 },
  { id: 'dmg', name: 'Dmg', description: '', icon: 'damage', stat: 'damagePct', valuePerLevel: 0.05, maxLevel: 10, baseCost: 30, costGrowth: 1.35 },
  { id: 'rate', name: 'Rate', description: '', icon: 'speed', stat: 'fireRatePct', valuePerLevel: 0.03, maxLevel: 5, baseCost: 30, costGrowth: 1.3 },
  { id: 'disc', name: 'Disc', description: '', icon: 'merchant', stat: 'discountPct', valuePerLevel: 0.03, maxLevel: 5, baseCost: 40, costGrowth: 1.4 },
  { id: 'lvl', name: 'Lvl', description: '', icon: 'arrow', stat: 'startLevel', valuePerLevel: 1, maxLevel: 2, baseCost: 100, costGrowth: 2 },
  { id: 'slot', name: 'Slot', description: '', icon: 'slot', stat: 'extraSlot', valuePerLevel: 1, maxLevel: 3, baseCost: 100, costGrowth: 2 },
  { id: 'gain', name: 'Gain', description: '', icon: 'coin', stat: 'coinGainPct', valuePerLevel: 0.05, maxLevel: 5, baseCost: 50, costGrowth: 1.3 },
  { id: 'cd', name: 'Cd', description: '', icon: 'clock', stat: 'abilityCdPct', valuePerLevel: 0.04, maxLevel: 5, baseCost: 50, costGrowth: 1.3 },
  { id: 'rr', name: 'Rr', description: '', icon: 'star', stat: 'rerolls', valuePerLevel: 1, maxLevel: 3, baseCost: 60, costGrowth: 1.6 },
];

vi.mock('../../src/data/meta', () => ({ META_UPGRADES: FIXTURE_META }));
vi.mock('../../src/data/towers', () => ({
  TOWERS: {
    arrow: { id: 'arrow', hitsAir: true, unlock: { kind: 'start' } },
    cannon: { id: 'cannon', hitsAir: false, unlock: { kind: 'start' } },
    frost: { id: 'frost', hitsAir: true, unlock: { kind: 'start' } },
    fire: { id: 'fire', hitsAir: true, unlock: { kind: 'gems', cost: 150 } },
    lightning: { id: 'lightning', hitsAir: true, unlock: { kind: 'gems', cost: 200 } },
    poison: { id: 'poison', hitsAir: false, unlock: { kind: 'gems', cost: 250 } },
    sniper: { id: 'sniper', hitsAir: false, unlock: { kind: 'gems', cost: 350 } },
  },
}));

const {
  LOADOUT_SIZE, abilitiesFor, buildRunOptions, buyMeta, canBuyMeta, canToggleLoadout, canUnlockTower, getLoadout, isTowerUnlocked, setLoadout, toggleLoadout, metaCost, metaLevel, metaTotal,
  towerUnlockCost, unlockTower,
} = await import('../../src/core/meta');
const { SaveManager, defaultSave } = await import('../../src/save/SaveManager');
const { FakePlatform } = await import('../platform/fakePlatform');

const catalog = { metaMax: Object.fromEntries(FIXTURE_META.map((m) => [m.id, m.maxLevel])), achievementIds: [] };

async function fresh() {
  const platform = new FakePlatform(null);
  const save = new SaveManager(platform, catalog);
  await save.load();
  return { platform, save };
}

describe('metaCost', () => {
  it('is round(baseCost * growth^(level-1))', () => {
    const hp = FIXTURE_META[0];
    expect(metaCost(hp, 1)).toBe(20);
    expect(metaCost(hp, 2)).toBe(30);
    expect(metaCost(hp, 3)).toBe(45);
    expect(metaCost(FIXTURE_META[1], 4)).toBe(10); // growth 1: flat
    expect(metaCost(FIXTURE_META[5], 3)).toBe(400);
  });
});

describe('buying meta upgrades', () => {
  beforeEach(() => vi.useRealTimers());

  it('spends gems, raises the level and persists', async () => {
    const { save, platform } = await fresh();
    save.data.gems = 100;
    expect(canBuyMeta(save, 'hp')).toBe(true);
    expect(buyMeta(save, 'hp')).toBe(true);
    expect(save.data.gems).toBe(80);
    expect(metaLevel(save, 'hp')).toBe(1);
    expect(buyMeta(save, 'hp')).toBe(true);
    expect(save.data.gems).toBe(50);
    await save.flush();
    expect(JSON.parse(platform.stored!).metaLevels).toEqual({ hp: 2 });
  });

  it('refuses when poor, at max level, or for unknown ids, and changes nothing', async () => {
    const { save } = await fresh();
    expect(buyMeta(save, 'hp')).toBe(false);
    save.data.gems = 10_000;
    expect(buyMeta(save, 'nope')).toBe(false);
    for (let i = 0; i < 3; i++) expect(buyMeta(save, 'hp')).toBe(true);
    const gems = save.data.gems;
    expect(canBuyMeta(save, 'hp')).toBe(false);
    expect(buyMeta(save, 'hp')).toBe(false);
    expect(save.data.gems).toBe(gems);
    expect(metaLevel(save, 'hp')).toBe(3);
    await save.flush();
  });

  it('metaLevel accepts save data and the manager, and caps at max level', async () => {
    const { save } = await fresh();
    save.data.metaLevels.hp = 9;
    expect(metaLevel(save, 'hp')).toBe(3);
    expect(metaLevel(save.data, 'hp')).toBe(3);
    expect(metaLevel(save, 'unknown')).toBe(0);
  });
});

describe('metaTotal', () => {
  it('sums valuePerLevel * level for a stat, free of float noise', async () => {
    const { save } = await fresh();
    save.data.metaLevels = { hp: 2, dmg: 3, coins: 1 };
    expect(metaTotal(save, 'castleHp')).toBe(20);
    expect(metaTotal(save, 'damagePct')).toBe(0.15);
    expect(metaTotal(save, 'startCoins')).toBe(15);
    expect(metaTotal(save, 'rerolls')).toBe(0);
  });
});

describe('tower unlocks', () => {
  it('prices come from the tower data', () => {
    expect(towerUnlockCost('arrow')).toBe(0);
    expect(towerUnlockCost('fire')).toBe(150);
    expect(towerUnlockCost('magic')).toBe(Infinity); // not in the fixture
  });

  it('unlockTower spends gems once and adds the tower', async () => {
    const { save } = await fresh();
    expect(isTowerUnlocked(save, 'fire')).toBe(false);
    expect(unlockTower(save, 'fire')).toBe(false); // no gems
    save.data.gems = 400;
    expect(canUnlockTower(save, 'fire')).toBe(true);
    expect(unlockTower(save, 'fire')).toBe(true);
    expect(save.data.gems).toBe(250);
    expect(save.data.unlockedTowers).toEqual(['arrow', 'cannon', 'frost', 'fire']);
    expect(save.data.loadout).toEqual(['arrow', 'cannon', 'frost', 'fire']); // room in the loadout: auto-added
    expect(unlockTower(save, 'fire')).toBe(false);
    expect(unlockTower(save, 'arrow')).toBe(false); // already owned
    expect(unlockTower(save, 'magic')).toBe(false); // unknown price
    expect(save.data.gems).toBe(250);
    await save.flush();
  });

  it('does not add the new tower to a full loadout', async () => {
    const { save } = await fresh();
    save.data.gems = 1000;
    unlockTower(save, 'fire');
    unlockTower(save, 'lightning');
    expect(save.data.unlockedTowers).toContain('lightning');
    expect(save.data.loadout).toEqual(['arrow', 'cannon', 'frost', 'fire']);
    expect(LOADOUT_SIZE).toBe(4);
    await save.flush();
  });
});

describe('loadout', () => {
  async function withTowers(unlock: ('fire' | 'lightning' | 'poison' | 'sniper')[]) {
    const f = await fresh();
    for (const id of unlock) f.save.data.unlockedTowers.push(id);
    f.save.data.loadout = ['arrow', 'cannon', 'frost'];
    return f;
  }

  it('starts as the three start towers', async () => {
    const { save } = await fresh();
    expect(getLoadout(save)).toEqual(['arrow', 'cannon', 'frost']);
    expect(getLoadout(save.data)).toEqual(['arrow', 'cannon', 'frost']);
    getLoadout(save).push('fire');
    expect(save.data.loadout).toEqual(['arrow', 'cannon', 'frost']);
  });

  it('adds until full, then reports full; locked towers cannot be added', async () => {
    const { save } = await withTowers(['fire', 'lightning']);
    expect(canToggleLoadout(save, 'sniper')).toEqual({ ok: false, reason: 'locked' });
    expect(toggleLoadout(save, 'sniper')).toBe(false);
    expect(canToggleLoadout(save, 'fire')).toEqual({ ok: true });
    expect(toggleLoadout(save, 'fire')).toBe(true);
    expect(save.data.loadout).toEqual(['arrow', 'cannon', 'frost', 'fire']);
    expect(canToggleLoadout(save, 'lightning')).toEqual({ ok: false, reason: 'full' });
    expect(toggleLoadout(save, 'lightning')).toBe(false);
    expect(save.data.loadout).toHaveLength(4);
  });

  it('removes down to the minimum of 3, never below', async () => {
    const { save } = await withTowers(['fire']);
    toggleLoadout(save, 'fire');
    expect(toggleLoadout(save, 'cannon')).toBe(true);
    expect(save.data.loadout).toEqual(['arrow', 'frost', 'fire']);
    expect(canToggleLoadout(save, 'frost')).toEqual({ ok: false, reason: 'minimum' });
    expect(toggleLoadout(save, 'frost')).toBe(false);
    expect(save.data.loadout).toEqual(['arrow', 'frost', 'fire']);
  });

  it('the minimum is the unlocked count when fewer than 3 are unlocked', async () => {
    const { save } = await fresh();
    save.data.unlockedTowers = ['arrow', 'cannon'];
    save.data.loadout = ['arrow', 'cannon'];
    expect(canToggleLoadout(save, 'cannon')).toEqual({ ok: false, reason: 'minimum' });
  });

  it('blocks removing the last tower that hits air', async () => {
    const { save } = await fresh();
    save.data.unlockedTowers = ['arrow', 'cannon', 'frost', 'poison', 'sniper'];
    save.data.loadout = ['arrow', 'cannon', 'poison', 'sniper']; // arrow is the only flyer-capable one
    expect(canToggleLoadout(save, 'arrow')).toEqual({ ok: false, reason: 'noAir' });
    expect(toggleLoadout(save, 'arrow')).toBe(false);
    expect(save.data.loadout).toEqual(['arrow', 'cannon', 'poison', 'sniper']);
    expect(canToggleLoadout(save, 'sniper')).toEqual({ ok: true });
  });

  it('removing keeps the choice at 3 towers (no automatic refill)', async () => {
    const { save } = await withTowers(['fire']);
    toggleLoadout(save, 'fire');
    toggleLoadout(save, 'cannon');
    expect(getLoadout(save)).toEqual(['arrow', 'frost', 'fire']);
  });

  it('setLoadout validates and replaces', async () => {
    const { save } = await withTowers(['fire', 'lightning']);
    expect(setLoadout(save, ['arrow', 'fire', 'lightning'])).toBe(true);
    expect(save.data.loadout).toEqual(['arrow', 'fire', 'lightning']);
    expect(setLoadout(save, ['arrow', 'arrow', 'fire'])).toBe(false); // duplicate
    expect(setLoadout(save, ['arrow', 'fire', 'sniper'])).toBe(false); // locked
    expect(setLoadout(save, ['arrow', 'fire'])).toBe(false); // below the minimum
    expect(setLoadout(save, ['arrow', 'fire', 'lightning', 'frost', 'cannon'])).toBe(false); // too many
    expect(setLoadout(save, ['cannon', 'arrow', 'frost', 'fire'])).toBe(true);
    expect(save.data.loadout).toEqual(['cannon', 'arrow', 'frost', 'fire']);
    save.data.unlockedTowers = ['cannon', 'arrow', 'frost'];
    expect(setLoadout(save, [])).toBe(false);
    await save.flush();
  });

  it('setLoadout refuses a loadout with no air-capable tower', async () => {
    const { save } = await fresh();
    save.data.unlockedTowers = ['cannon', 'arrow', 'frost'];
    expect(setLoadout(save, ['cannon'])).toBe(false);
  });

  it('getLoadout repairs a stale loadout against the unlocked towers', async () => {
    const { save } = await fresh();
    save.data.loadout = ['fire']; // not unlocked
    expect(getLoadout(save)).toEqual(['arrow', 'cannon', 'frost']);
  });

  it('persists toggles', async () => {
    const { save, platform } = await withTowers(['fire']);
    toggleLoadout(save, 'fire');
    await save.flush();
    expect(JSON.parse(platform.stored!).loadout).toEqual(['arrow', 'cannon', 'frost', 'fire']);
  });
});

describe('abilitiesFor', () => {
  it('introduces abilities progressively by best wave', () => {
    const d = defaultSave();
    expect(abilitiesFor(d)).toEqual(['meteor', 'repair']);
    d.stats.bestWave = 4;
    expect(abilitiesFor(d)).toEqual(['meteor', 'repair']);
    d.stats.bestWave = 5;
    expect(abilitiesFor(d)).toEqual(['meteor', 'repair', 'freeze']);
    d.stats.bestWave = 9;
    expect(abilitiesFor(d)).toEqual(['meteor', 'repair', 'freeze']);
    d.stats.bestWave = 10;
    expect(abilitiesFor(d)).toEqual(['meteor', 'repair', 'freeze', 'frenzy']);
  });
});

describe('buildRunOptions', () => {
  it('a fresh save gives the base options', () => {
    const o = buildRunOptions(defaultSave(), { seed: 42 });
    expect(o).toEqual({
      seed: 42,
      towerPool: ['arrow', 'cannon', 'frost'],
      abilities: ['meteor', 'repair'],
      castleHpBonus: 0, startCoinsBonus: 0, damagePct: 0, fireRatePct: 0, discountPct: 0, coinGainPct: 0, abilityCdPct: 0,
      startTowerLevel: 1, startingSlots: 4, freeRerolls: 0,
    });
    expect('daily' in o).toBe(false);
  });

  it('applies every meta stat', () => {
    const d = defaultSave();
    d.unlockedTowers.push('fire');
    d.loadout.push('fire');
    d.stats.bestWave = 12;
    d.metaLevels = { hp: 3, coins: 2, dmg: 4, rate: 2, disc: 1, lvl: 2, slot: 3, gain: 1, cd: 2, rr: 3 };
    const o = buildRunOptions(d, { seed: 7 });
    expect(o).toMatchObject({
      towerPool: ['arrow', 'cannon', 'frost', 'fire'],
      abilities: ['meteor', 'repair', 'freeze', 'frenzy'],
      castleHpBonus: 30, startCoinsBonus: 30, damagePct: 0.2, fireRatePct: 0.06, discountPct: 0.03,
      coinGainPct: 0.05, abilityCdPct: 0.08, startTowerLevel: 3, startingSlots: 7, freeRerolls: 3,
    });
  });

  it('caps the starting tower level and slots at what the game has', () => {
    const d = defaultSave();
    d.metaLevels = { lvl: 2, slot: 3 };
    FIXTURE_META[5].valuePerLevel = 10;
    FIXTURE_META[6].valuePerLevel = 20;
    try {
      const o = buildRunOptions(d, { seed: 1 });
      expect(o.startTowerLevel).toBe(5);
      expect(o.startingSlots).toBe(12);
    } finally {
      FIXTURE_META[5].valuePerLevel = 1;
      FIXTURE_META[6].valuePerLevel = 1;
    }
  });

  it('the Buy pool is the loadout, not every unlocked tower', () => {
    const d = defaultSave();
    d.unlockedTowers.push('fire', 'lightning', 'poison');
    d.loadout = ['arrow', 'fire', 'lightning'];
    expect(buildRunOptions(d, { seed: 1 }).towerPool).toEqual(['arrow', 'fire', 'lightning']);
  });

  it('does not alias the save arrays', () => {
    const d = defaultSave();
    const o = buildRunOptions(d, { seed: 1 });
    o.towerPool.push('fire');
    expect(d.unlockedTowers).toEqual(['arrow', 'cannon', 'frost']);
  });

  it('daily: uses the daily pool (even locked towers) and merges modifiers', () => {
    const mods: DailyModifier[] = [
      {
        id: 'm1', name: '', description: '', towerPool: ['fire', 'lightning', 'arrow'],
        waveModifier: { enemyHpMult: 1.5, coinMult: 2, eliteChance: 0.1 }, startCoins: 50,
        effects: [{ kind: 'global', stat: 'coinGain', op: 'pct', value: 0.1 }],
      },
      {
        id: 'm2', name: '', description: '', towerPool: ['fire', 'cannon'],
        waveModifier: { enemyHpMult: 2, enemySpeedMult: 0.9, eliteChance: 0.05 }, startCoins: 25,
        effects: [{ kind: 'flag', flag: 'thorns', value: 3 }],
      },
      { id: 'm3', name: '', description: '' },
    ];
    const o = buildRunOptions(defaultSave(), { seed: 9, daily: { modifiers: mods } });
    expect(o.towerPool).toEqual(['fire']); // intersection
    expect(o.daily?.startCoins).toBe(75);
    expect(o.daily?.effects).toHaveLength(2);
    expect(o.daily?.waveModifier).toMatchObject({ enemyHpMult: 3, coinMult: 2, enemySpeedMult: 0.9 });
    expect(o.daily?.waveModifier?.eliteChance).toBeCloseTo(0.15);
  });

  it('daily: disjoint pools fall back to the first, no pool keeps the unlocked towers', () => {
    const disjoint: DailyModifier[] = [
      { id: 'a', name: '', description: '', towerPool: ['fire'] },
      { id: 'b', name: '', description: '', towerPool: ['lightning'] },
    ];
    expect(buildRunOptions(defaultSave(), { seed: 1, daily: { modifiers: disjoint } }).towerPool).toEqual(['fire']);
    const none: DailyModifier[] = [{ id: 'c', name: '', description: '', startCoins: 10 }];
    const o = buildRunOptions(defaultSave(), { seed: 1, daily: { modifiers: none } });
    expect(o.towerPool).toEqual(['arrow', 'cannon', 'frost']);
    expect(o.daily).toEqual({ startCoins: 10 });
    expect(buildRunOptions(defaultSave(), { seed: 1, daily: { modifiers: [] } }).daily).toEqual({});
  });
});
