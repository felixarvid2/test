import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../../src/data/achievements';
import { DAILY_MODIFIERS } from '../../src/data/daily';
import { EVENTS } from '../../src/data/events';
import { META_UPGRADES } from '../../src/data/meta';
import { SYNERGIES } from '../../src/data/synergies';
import { UPGRADES } from '../../src/data/upgrades';
import {
  ICON_KEYS, RARITIES, TOWER_IDS,
  type Effect, type FlagKey, type GlobalStat, type MetaStat, type TowerStat, type WaveModifier,
} from '../../src/data/types';

const TOWER_STATS: TowerStat[] = [
  'damage', 'fireRate', 'range', 'splashRadius', 'critChance', 'critMult', 'projectileSpeed',
  'statusPower', 'statusDuration', 'chainCount', 'chainRange', 'armorPen',
];
const GLOBAL_STATS: GlobalStat[] = [
  'coinGain', 'castleMaxHp', 'towerCost', 'abilityCooldown', 'abilityPower', 'bossDamage', 'waveCoinBonus',
];
const FLAGS: FlagKey[] = [
  'extraProjectiles', 'multishot', 'pierce', 'splitOnImpact', 'clusterBombs', 'slowOnHit', 'freezeChance',
  'stunChance', 'burnOnHit', 'poisonOnHit', 'vulnerabilityOnHit', 'explosionOnHit', 'everyNthExplosion',
  'fireZoneOnHit', 'chainLightningChance', 'critLightning', 'randomElement', 'elementalSecondary',
  'executeThreshold', 'frozenBonusDamage', 'burningBonusDamage', 'poisonedBonusDamage', 'adjacencyBonus',
  'fireSpread', 'flameExplosionOnDeath', 'poisonSpreadOnDeath', 'poisonExplosionOnDeath', 'frostNova',
  'burnSpreadsPoison', 'meteorOnKillChance', 'infiniteChain', 'mergeFrenzy', 'killCoinBonus', 'bossShatter',
  'castleRegen', 'thorns',
];
const INSTANT_ACTIONS = ['healCastle', 'grantCoins', 'grantTower', 'unlockSlot', 'resetCooldowns'];
const META_STATS: MetaStat[] = [
  'castleHp', 'startCoins', 'damagePct', 'fireRatePct', 'discountPct', 'startLevel', 'extraSlot',
  'coinGainPct', 'abilityCdPct', 'rerolls',
];
const AIR_TOWERS = ['arrow', 'frost', 'lightning', 'sniper', 'magic'];
const ICONS = ICON_KEYS as readonly string[];
const CAMEL = /^[a-z][a-zA-Z0-9]*$/;

function checkEffect(e: Effect, where: string): void {
  const towers = (e as { tower?: string[] }).tower;
  if (towers) {
    expect(towers.length, where).toBeGreaterThan(0);
    for (const t of towers) expect(TOWER_IDS as readonly string[], `${where} tower ${t}`).toContain(t);
  }
  expect(Number.isFinite(e.value), `${where} value`).toBe(true);
  switch (e.kind) {
    case 'stat': expect(TOWER_STATS, where).toContain(e.stat); expect(['flat', 'pct', 'mul'], where).toContain(e.op); break;
    case 'global': expect(GLOBAL_STATS, where).toContain(e.stat); expect(['flat', 'pct', 'mul'], where).toContain(e.op); break;
    case 'flag': expect(FLAGS, where).toContain(e.flag); expect(e.value, where).toBeGreaterThan(0); break;
    case 'instant': expect(INSTANT_ACTIONS, where).toContain(e.action); break;
    default: throw new Error(`${where}: unknown effect kind`);
  }
}

function checkWaveModifier(m: WaveModifier | undefined, where: string): void {
  if (!m) return;
  for (const [k, v] of Object.entries(m)) {
    expect(typeof v, `${where}.${k}`).toBe('number');
    expect(v as number, `${where}.${k}`).toBeGreaterThan(0);
  }
  if (m.eliteChance !== undefined) expect(m.eliteChance, where).toBeLessThanOrEqual(1);
}

describe('upgrades', () => {
  it('has enough cards with every rarity', () => {
    expect(UPGRADES.length).toBeGreaterThanOrEqual(40);
    for (const r of RARITIES) expect(UPGRADES.filter((u) => u.rarity === r).length, r).toBeGreaterThanOrEqual(5);
  });

  it('has unique camelCase ids, valid icons and numeric descriptions', () => {
    const ids = UPGRADES.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const u of UPGRADES) {
      expect(u.id, u.id).toMatch(CAMEL);
      expect(ICONS, u.id).toContain(u.icon);
      expect(u.description, u.id).toMatch(/\d/);
      expect(u.name.length, u.id).toBeGreaterThan(0);
      expect(u.effects.length, u.id).toBeGreaterThan(0);
      u.effects.forEach((e, i) => checkEffect(e, `${u.id}.effects[${i}]`));
    }
  });

  it('uses sensible stack limits, references and gating', () => {
    for (const u of UPGRADES) {
      expect(Number.isInteger(u.maxStacks) && u.maxStacks >= 1, u.id).toBe(true);
      if (u.rarity === 'common') expect(u.maxStacks, u.id).toBeGreaterThanOrEqual(3);
      if (u.rarity === 'common') expect(u.maxStacks, u.id).toBeLessThanOrEqual(5);
      if (u.rarity === 'rare') expect(u.maxStacks, u.id).toBeLessThanOrEqual(2);
      if (u.rarity === 'epic') expect(u.maxStacks, u.id).toBeLessThanOrEqual(2);
      if (u.rarity === 'legendary') {
        expect(u.maxStacks, u.id).toBe(1);
        expect(u.requires?.minWave ?? 0, u.id).toBeGreaterThanOrEqual(6);
      }
      for (const req of u.requires?.upgrades ?? []) expect(UPGRADES.map((x) => x.id), u.id).toContain(req);
      for (const t of u.requires?.anyTower ?? []) expect(TOWER_IDS as readonly string[], u.id).toContain(t);
    }
  });

  it('scopes tower-specific effects with a matching requires.anyTower', () => {
    for (const u of UPGRADES) {
      const scoped = new Set<string>();
      for (const e of u.effects) {
        const t = (e as { tower?: string[] }).tower;
        if (t) t.forEach((x) => scoped.add(x));
      }
      if (scoped.size === 0) continue;
      const any = u.requires?.anyTower ?? [];
      expect(any.length, `${u.id} needs requires.anyTower`).toBeGreaterThan(0);
      for (const t of any) expect(scoped.has(t), `${u.id} requires ${t} but does not scope it`).toBe(true);
    }
  });

  it('includes the required headline cards', () => {
    const flagOf = (id: string) => UPGRADES.find((u) => u.id === id)?.effects.flatMap((e) => (e.kind === 'flag' ? [e] : []));
    expect(flagOf('rhythmicBarrage')?.[0]).toMatchObject({ flag: 'everyNthExplosion', value: 5 });
    expect(flagOf('shatterpoint')?.[0]).toMatchObject({ flag: 'frozenBonusDamage', value: 1, tower: ['cannon'] });
    expect(flagOf('fallingStars')?.[0]).toMatchObject({ flag: 'meteorOnKillChance' });
    expect(flagOf('stormLord')?.some((e) => e.flag === 'infiniteChain')).toBe(true);
    expect(UPGRADES.find((u) => u.id === 'stormLord')?.requires?.anyTower).toEqual(['lightning']);
    const hp = UPGRADES.find((u) => u.id === 'fortifiedWalls')!;
    expect(hp.effects.some((e) => e.kind === 'instant' && e.action === 'healCastle')).toBe(true);
  });
});

describe('synergies', () => {
  const upgradeIds = UPGRADES.map((u) => u.id);

  it('has enough synergies with unique ids, icons and numeric descriptions', () => {
    expect(SYNERGIES.length).toBeGreaterThanOrEqual(16);
    expect(new Set(SYNERGIES.map((s) => s.id)).size).toBe(SYNERGIES.length);
    for (const s of SYNERGIES) {
      expect(s.id, s.id).toMatch(CAMEL);
      expect(ICONS, s.id).toContain(s.icon);
      expect(s.description, s.id).toMatch(/\d/);
      expect(s.effects.length, s.id).toBeGreaterThan(0);
      s.effects.forEach((e, i) => checkEffect(e, `${s.id}.effects[${i}]`));
    }
  });

  it('has valid, non-empty requirements', () => {
    for (const s of SYNERGIES) {
      const r = s.requires;
      expect(!!(r.towers?.length || r.flags?.length || r.upgrades?.length || r.towerLevel), s.id).toBe(true);
      for (const t of r.towers ?? []) expect(TOWER_IDS as readonly string[], s.id).toContain(t);
      for (const f of r.flags ?? []) expect(FLAGS, s.id).toContain(f.flag);
      for (const u of r.upgrades ?? []) expect(upgradeIds, `${s.id} upgrade ${u}`).toContain(u);
      if (r.towerLevel) {
        expect(TOWER_IDS as readonly string[], s.id).toContain(r.towerLevel.tower);
        expect(r.towerLevel.level, s.id).toBeGreaterThanOrEqual(2);
        expect(r.towerLevel.level, s.id).toBeLessThanOrEqual(5);
      }
    }
  });

  it('includes the required named synergies with the specified effects', () => {
    const by = (id: string) => SYNERGIES.find((s) => s.id === id)!;
    const has = (id: string, flag: FlagKey, tower?: string[]) =>
      by(id).effects.some((e) => e.kind === 'flag' && e.flag === flag && (!tower || JSON.stringify(e.tower) === JSON.stringify(tower)));
    expect(by('toxicInferno').requires.towers).toEqual(['fire', 'poison']);
    expect(has('toxicInferno', 'burnSpreadsPoison')).toBe(true);
    expect(has('shatter', 'frozenBonusDamage', ['cannon'])).toBe(true);
    expect(has('thunderstorm', 'critLightning')).toBe(true);
    expect(has('venomBarrage', 'poisonOnHit', ['arrow'])).toBe(true);
    expect(has('napalm', 'fireZoneOnHit', ['cannon'])).toBe(true);
    expect(has('deathMark', 'executeThreshold', ['sniper'])).toBe(true);
    expect(has('arcaneStorm', 'chainLightningChance', ['magic'])).toBe(true);
    expect(by('fortress').requires.towers!.length).toBeGreaterThanOrEqual(4);
  });
});

describe('events', () => {
  it('covers every event id once with a free last option', () => {
    expect(EVENTS.map((e) => e.id).sort()).toEqual(['chest', 'cursed', 'elite', 'merchant', 'treasure']);
    for (const ev of EVENTS) {
      expect(ICONS, ev.id).toContain(ev.icon);
      expect(ev.weight, ev.id).toBeGreaterThan(0);
      expect(ev.minWave, ev.id).toBeGreaterThanOrEqual(1);
      expect(ev.options.length, ev.id).toBeGreaterThanOrEqual(2);
      const ids = ev.options.map((o) => o.id);
      expect(new Set(ids).size, ev.id).toBe(ids.length);
      const last = ev.options[ev.options.length - 1];
      expect(last.cost, `${ev.id} last option`).toBeUndefined();
      expect(last.waveModifier, `${ev.id} last option`).toBeUndefined();
      expect(last.effects, `${ev.id} last option`).toBeUndefined();
      expect(last.upgradeRarity, `${ev.id} last option`).toBeUndefined();
      for (const o of ev.options) {
        o.effects?.forEach((e, i) => checkEffect(e, `${ev.id}.${o.id}.effects[${i}]`));
        checkWaveModifier(o.waveModifier, `${ev.id}.${o.id}`);
        if (o.cost !== undefined) expect(o.cost, o.id).toBeGreaterThan(0);
        if (o.upgradeRarity) expect(RARITIES, o.id).toContain(o.upgradeRarity);
      }
    }
  });

  it('matches the specified shape of each event', () => {
    const ev = (id: string) => EVENTS.find((e) => e.id === id)!;
    expect(ev('treasure').options.some((o) => (o.waveModifier?.coinMult ?? 0) > 1)).toBe(true);
    expect(ev('elite').options.some((o) => (o.waveModifier?.eliteChance ?? 0) > 0 && (o.waveModifier?.coinMult ?? 0) > 1)).toBe(true);
    const m = ev('merchant').options;
    expect(m.some((o) => o.cost && o.effects?.some((e) => e.kind === 'instant' && e.action === 'grantTower'))).toBe(true);
    expect(m.some((o) => o.cost && o.upgradeRarity === 'rare')).toBe(true);
    expect(m.some((o) => o.cost && o.effects?.some((e) => e.kind === 'instant' && e.action === 'healCastle'))).toBe(true);
    const chest = ev('chest').options;
    expect(chest.length - 1).toBeGreaterThanOrEqual(5);
    expect(chest.some((o) => o.effects?.some((e) => e.kind === 'instant' && e.action === 'unlockSlot'))).toBe(true);
    expect(chest.some((o) => o.upgradeRarity === 'epic')).toBe(true);
    const cursed = ev('cursed').options[0];
    expect(cursed.waveModifier?.enemyHpMult).toBeGreaterThan(1);
    expect(cursed.waveModifier?.enemySpeedMult).toBeGreaterThan(1);
    expect(cursed.waveModifier?.coinMult).toBeGreaterThanOrEqual(2);
    expect(cursed.upgradeRarity).toBe('epic');
  });
});

describe('meta upgrades', () => {
  it('has exactly one per MetaStat with sane numbers', () => {
    expect(META_UPGRADES.map((m) => m.stat).sort()).toEqual([...META_STATS].sort());
    expect(new Set(META_UPGRADES.map((m) => m.id)).size).toBe(META_UPGRADES.length);
    for (const m of META_UPGRADES) {
      expect(ICONS, m.id).toContain(m.icon);
      expect(m.description, m.id).toContain('{value}');
      expect(m.valuePerLevel, m.id).toBeGreaterThan(0);
      expect(Number.isInteger(m.maxLevel) && m.maxLevel > 0, m.id).toBe(true);
      expect(m.baseCost, m.id).toBeGreaterThan(0);
      expect(m.costGrowth, m.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('matches the specified caps', () => {
    const by = (s: MetaStat) => META_UPGRADES.find((m) => m.stat === s)!;
    const spec: Record<MetaStat, [number, number]> = {
      castleHp: [15, 10], startCoins: [15, 8], damagePct: [0.09, 10], fireRatePct: [0.07, 10], discountPct: [0.03, 5],
      startLevel: [1, 2], extraSlot: [1, 2], coinGainPct: [0.05, 8], abilityCdPct: [0.05, 5], rerolls: [1, 3],
    };
    for (const s of META_STATS) expect([by(s).valuePerLevel, by(s).maxLevel], s).toEqual(spec[s]);
  });

  it('prices the first levels cheaply and the expensive ones dearly', () => {
    const cost = (m: (typeof META_UPGRADES)[number], n: number) => Math.round(m.baseCost * m.costGrowth ** (n - 1));
    const cheap = META_UPGRADES.filter((m) => !['startLevel', 'extraSlot'].includes(m.stat));
    for (const m of cheap) expect(cost(m, 1), m.id).toBeLessThanOrEqual(60);
    // ~40-120 gems per run buys 1-3 cheap levels early.
    expect(cheap.filter((m) => cost(m, 1) <= 40).length).toBeGreaterThanOrEqual(5);
    for (const s of ['startLevel', 'extraSlot'] as const) {
      const m = META_UPGRADES.find((x) => x.stat === s)!;
      expect(cost(m, 1)).toBeGreaterThanOrEqual(200);
    }
  });
});

describe('achievements', () => {
  it('has enough valid achievements', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(22);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    const numericStats = [
      'runs', 'wavesSurvived', 'bestWave', 'enemiesKilled', 'bossesKilled', 'goblinKingKills', 'golemKills',
      'dragonKills', 'towersMerged', 'towersBought', 'highestTowerLevel', 'chainLightnings', 'meteorsCalled',
      'abilitiesUsed', 'flawlessWaves', 'synergiesActivated', 'legendariesPicked', 'gemsEarned', 'coinsEarned', 'dailyRuns',
    ];
    for (const a of ACHIEVEMENTS) {
      expect(a.id, a.id).toMatch(CAMEL);
      expect(ICONS, a.id).toContain(a.icon);
      expect(numericStats, a.id).toContain(a.stat);
      expect(a.description, a.id).toBeTruthy();
      expect(a.target, a.id).toBeGreaterThan(0);
      expect(a.reward, a.id).toBeGreaterThanOrEqual(10);
      expect(a.reward, a.id).toBeLessThanOrEqual(100);
    }
  });

  it('includes the required headline achievements', () => {
    const find = (stat: string, target: number) => ACHIEVEMENTS.some((a) => a.stat === stat && a.target === target);
    expect(find('towersMerged', 100)).toBe(true);
    expect(find('bestWave', 10)).toBe(true);
    expect(find('dragonKills', 1)).toBe(true);
    expect(find('flawlessWaves', 1)).toBe(true);
    expect(find('highestTowerLevel', 5)).toBe(true);
    expect(find('chainLightnings', 100)).toBe(true);
    expect(find('meteorsCalled', 50)).toBe(true);
    expect(find('synergiesActivated', 25)).toBe(true);
    expect(find('legendariesPicked', 5)).toBe(true);
    expect(find('enemiesKilled', 1000)).toBe(true);
    expect(find('runs', 10)).toBe(true);
  });
});

describe('daily modifiers', () => {
  it('has enough valid modifiers', () => {
    expect(DAILY_MODIFIERS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(DAILY_MODIFIERS.map((m) => m.id)).size).toBe(DAILY_MODIFIERS.length);
    for (const m of DAILY_MODIFIERS) {
      expect(m.id, m.id).toMatch(CAMEL);
      expect(m.description, m.id).toMatch(/\d|Only/);
      m.effects?.forEach((e, i) => checkEffect(e, `${m.id}.effects[${i}]`));
      checkWaveModifier(m.waveModifier, m.id);
      expect(!!(m.towerPool || m.waveModifier || m.effects?.length || m.startCoins), m.id).toBe(true);
      if (m.towerPool) {
        expect(new Set(m.towerPool).size, m.id).toBe(m.towerPool.length);
        expect(m.towerPool.length, m.id).toBeGreaterThanOrEqual(3);
        for (const t of m.towerPool) expect(TOWER_IDS as readonly string[], m.id).toContain(t);
        expect(m.towerPool.some((t) => AIR_TOWERS.includes(t)), `${m.id} needs an anti-air tower`).toBe(true);
      }
    }
  });
});
