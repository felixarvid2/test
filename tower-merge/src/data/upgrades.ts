import type { Effect, FlagKey, GlobalStat, TowerId, TowerStat, UpgradeDef } from './types';

// Small constructors keep the table readable; they only build plain Effect objects.
const stat = (s: TowerStat, op: 'flat' | 'pct' | 'mul', value: number, tower?: TowerId[]): Effect =>
  tower ? { kind: 'stat', stat: s, op, value, tower } : { kind: 'stat', stat: s, op, value };
const glob = (s: GlobalStat, op: 'flat' | 'pct' | 'mul', value: number): Effect => ({ kind: 'global', stat: s, op, value });
const flag = (f: FlagKey, value: number, tower?: TowerId[]): Effect =>
  tower ? { kind: 'flag', flag: f, value, tower } : { kind: 'flag', flag: f, value };

/**
 * Roguelite upgrades offered after each wave. Rarity guide: common = +10..20% of one stat,
 * rare = a new mechanic for one tower type, epic = strong cross-type proc, legendary = run-defining.
 * Tower-specific cards use requires.anyTower so they are never offered without a matching tower.
 */
export const UPGRADES: UpgradeDef[] = [
  // ------------------------------------------------------------------------------- common
  {
    id: 'rapidFire', name: 'Rapid Fire', description: '+15% attack speed for all towers.',
    rarity: 'common', icon: 'speed', maxStacks: 5, effects: [stat('fireRate', 'pct', 0.15)],
  },
  {
    id: 'heavyHitters', name: 'Heavy Hitters', description: '+20% tower damage for all towers.',
    rarity: 'common', icon: 'damage', maxStacks: 5, effects: [stat('damage', 'pct', 0.2)],
  },
  {
    id: 'farSight', name: 'Far Sight', description: '+10% range for all towers.',
    rarity: 'common', icon: 'range', maxStacks: 3, effects: [stat('range', 'pct', 0.1)],
  },
  {
    id: 'plunder', name: 'Plunder', description: '+15% coins from kills.',
    rarity: 'common', icon: 'coin', maxStacks: 4, effects: [glob('coinGain', 'pct', 0.15)],
  },
  {
    id: 'fortifiedWalls', name: 'Fortified Walls', description: '+10% castle max HP and heal 10% of max HP.',
    rarity: 'common', icon: 'castle', maxStacks: 4,
    effects: [glob('castleMaxHp', 'pct', 0.1), { kind: 'instant', action: 'healCastle', value: 0.1 }],
  },
  {
    id: 'keenEye', name: 'Keen Eye', description: '+5% critical hit chance for all towers.',
    rarity: 'common', icon: 'crit', maxStacks: 4, effects: [stat('critChance', 'flat', 0.05)],
  },
  {
    id: 'hagglers', name: "Haggler's Luck", description: 'Towers cost 8% less to buy.',
    rarity: 'common', icon: 'coin', maxStacks: 3, effects: [glob('towerCost', 'pct', -0.08)],
  },
  {
    id: 'blastPowder', name: 'Blast Powder', description: '+15% splash radius for all towers.',
    rarity: 'common', icon: 'explosion', maxStacks: 3, effects: [stat('splashRadius', 'pct', 0.15)],
  },
  {
    id: 'quickRecovery', name: 'Quick Recovery', description: 'Abilities recharge 10% faster.',
    rarity: 'common', icon: 'clock', maxStacks: 3, effects: [glob('abilityCooldown', 'pct', -0.1)],
  },
  {
    id: 'warChest', name: 'War Chest', description: '+8 coins at the end of every wave.',
    rarity: 'common', icon: 'treasure', maxStacks: 4, effects: [glob('waveCoinBonus', 'flat', 8)],
  },
  {
    id: 'marksmanTraining', name: 'Marksman Training', description: '+25% damage for Arrow and Sniper towers.',
    rarity: 'common', icon: 'target', maxStacks: 3, requires: { anyTower: ['arrow', 'sniper'] },
    effects: [stat('damage', 'pct', 0.25, ['arrow', 'sniper'])],
  },
  {
    id: 'siegeEngineering', name: 'Siege Engineering', description: '+25% damage for Cannon towers.',
    rarity: 'common', icon: 'cannon', maxStacks: 3, requires: { anyTower: ['cannon'] },
    effects: [stat('damage', 'pct', 0.25, ['cannon'])],
  },
  {
    id: 'elementalAttunement', name: 'Elemental Attunement',
    description: '+20% status strength for Fire, Frost, Poison and Lightning towers.',
    rarity: 'common', icon: 'magic', maxStacks: 3, requires: { anyTower: ['fire', 'frost', 'poison', 'lightning'] },
    effects: [stat('statusPower', 'pct', 0.2, ['fire', 'frost', 'poison', 'lightning'])],
  },
  {
    id: 'bossSlayer', name: 'Boss Slayer', description: '+15% damage against bosses.',
    rarity: 'common', icon: 'crown', maxStacks: 3, requires: { minWave: 3 }, effects: [glob('bossDamage', 'pct', 0.15)],
  },
  {
    id: 'castleRegen', name: 'Mason Crew', description: 'Castle regenerates 0.5 HP per second during waves.',
    rarity: 'common', icon: 'heart', maxStacks: 4, effects: [flag('castleRegen', 0.5)],
  },
  {
    id: 'killBounty', name: 'Bounty Hunter', description: '+1 coin for every enemy defeated.',
    rarity: 'common', icon: 'skull', maxStacks: 3, effects: [flag('killCoinBonus', 1)],
  },

  // --------------------------------------------------------------------------------- rare
  {
    id: 'twinArrows', name: 'Twin Arrows', description: 'Arrow towers fire 1 additional arrow per attack.',
    rarity: 'rare', icon: 'arrow', maxStacks: 2, requires: { anyTower: ['arrow'] },
    effects: [flag('extraProjectiles', 1, ['arrow'])],
  },
  {
    id: 'bigBang', name: 'Big Bang', description: 'Cannon explosions become 30% larger.',
    rarity: 'rare', icon: 'explosion', maxStacks: 2, requires: { anyTower: ['cannon'] },
    effects: [stat('splashRadius', 'pct', 0.3, ['cannon'])],
  },
  {
    id: 'deepFreeze', name: 'Deep Freeze', description: 'Frost towers have a 15% chance to freeze enemies for 1.2 s.',
    rarity: 'rare', icon: 'freeze', maxStacks: 2, requires: { anyTower: ['frost'] },
    effects: [flag('freezeChance', 0.15, ['frost'])],
  },
  {
    id: 'wildfire', name: 'Wildfire', description: 'Fire damage spreads: burning enemies pass their burn to the nearest enemy every 1 s and on death.',
    rarity: 'rare', icon: 'fire', maxStacks: 1, requires: { anyTower: ['fire'] },
    effects: [flag('fireSpread', 1, ['fire'])],
  },
  {
    id: 'forkedBolt', name: 'Forked Bolt', description: 'Lightning attacks chain to 1 more target.',
    rarity: 'rare', icon: 'chain', maxStacks: 2, requires: { anyTower: ['lightning'] },
    effects: [stat('chainCount', 'flat', 1, ['lightning'])],
  },
  {
    id: 'concentratedVenom', name: 'Concentrated Venom', description: '+30% poison damage per stack and +1 s poison duration.',
    rarity: 'rare', icon: 'poison', maxStacks: 2, requires: { anyTower: ['poison'] },
    effects: [stat('statusPower', 'pct', 0.3, ['poison']), stat('statusDuration', 'flat', 1, ['poison'])],
  },
  {
    id: 'armorPiercers', name: 'Armor Piercers', description: 'Sniper shots ignore an extra 25% of enemy armor.',
    rarity: 'rare', icon: 'sniper', maxStacks: 2, requires: { anyTower: ['sniper'] },
    effects: [stat('armorPen', 'flat', 0.25, ['sniper'])],
  },
  {
    id: 'twinOrbs', name: 'Twin Orbs', description: 'Magic towers launch 1 extra orb at a different target.',
    rarity: 'rare', icon: 'magic', maxStacks: 2, requires: { anyTower: ['magic'] },
    effects: [flag('multishot', 1, ['magic'])],
  },
  {
    id: 'clusterMunitions', name: 'Cluster Munitions', description: 'Cannon explosions scatter 2 bomblets (35% damage each).',
    rarity: 'rare', icon: 'split', maxStacks: 1, requires: { anyTower: ['cannon'] },
    effects: [flag('clusterBombs', 2, ['cannon'])],
  },
  {
    id: 'fireArrows', name: 'Fire Arrows', description: 'Arrows ignite enemies: burn for 30% of hit damage per second for 3 s.',
    rarity: 'rare', icon: 'fire', maxStacks: 1, requires: { anyTower: ['arrow'] },
    effects: [flag('burnOnHit', 0.3, ['arrow'])],
  },
  {
    id: 'brittleIce', name: 'Brittle Ice', description: 'Frost hits make enemies take +15% damage from all sources for 3 s.',
    rarity: 'rare', icon: 'frost', maxStacks: 2, requires: { anyTower: ['frost'] },
    effects: [flag('vulnerabilityOnHit', 0.15, ['frost'])],
  },
  {
    id: 'spikedBattlements', name: 'Spiked Battlements', description: 'Enemies that hit the castle take 10 damage.',
    rarity: 'rare', icon: 'shield', maxStacks: 2, effects: [flag('thorns', 10)],
  },
  {
    id: 'veteranRecruit', name: 'Veteran Recruit', description: 'Gain a free Level 2 tower right now.',
    rarity: 'rare', icon: 'merge', maxStacks: 2, requires: { minWave: 2 },
    effects: [{ kind: 'instant', action: 'grantTower', value: 2 }],
  },

  // --------------------------------------------------------------------------------- epic
  {
    id: 'rhythmicBarrage', name: 'Rhythmic Barrage',
    description: 'Every 5th attack of each tower triggers a 60 px explosion for 150% damage.',
    rarity: 'epic', icon: 'explosion', maxStacks: 1, requires: { minWave: 3 },
    effects: [flag('everyNthExplosion', 5)],
  },
  {
    id: 'plagueBearers', name: 'Plague Bearers', description: 'Poisoned enemies explode on death in a 70 px radius for 8 damage per poison stack.',
    rarity: 'epic', icon: 'poison', maxStacks: 1, requires: { anyTower: ['poison'], minWave: 3 },
    effects: [flag('poisonExplosionOnDeath', 70)],
  },
  {
    id: 'stormCrits', name: 'Storm Crits', description: 'Critical hits fire 1 lightning bolt at a nearby enemy for 60% damage.',
    rarity: 'epic', icon: 'lightning', maxStacks: 2, requires: { minWave: 3 },
    effects: [flag('critLightning', 1)],
  },
  {
    id: 'shatterpoint', name: 'Shatterpoint', description: 'Frozen or slowed enemies take +100% damage from Cannon towers.',
    rarity: 'epic', icon: 'cannon', maxStacks: 1, requires: { anyTower: ['cannon'], minWave: 3 },
    effects: [flag('frozenBonusDamage', 1.0, ['cannon'])],
  },
  {
    id: 'combinedArms', name: 'Combined Arms', description: 'Towers deal +10% damage for each adjacent tower of a different type.',
    rarity: 'epic', icon: 'merge', maxStacks: 1, requires: { minWave: 3 },
    effects: [flag('adjacencyBonus', 0.1)],
  },
  {
    id: 'cinderBlast', name: 'Cinder Blast', description: 'Burning enemies explode on death in an 80 px radius.',
    rarity: 'epic', icon: 'fire', maxStacks: 1, requires: { anyTower: ['fire'], minWave: 3 },
    effects: [flag('flameExplosionOnDeath', 80)],
  },
  {
    id: 'cullingBlade', name: 'Culling Blade', description: 'Enemies below 6% max HP are executed instantly; bosses below that take +100% damage.',
    rarity: 'epic', icon: 'skull', maxStacks: 1, requires: { minWave: 4 },
    effects: [flag('executeThreshold', 0.06)],
  },
  {
    id: 'volatileAmmo', name: 'Volatile Ammunition', description: 'Arrow, Sniper and Magic hits also explode in a 45 px radius for 40% damage.',
    rarity: 'epic', icon: 'explosion', maxStacks: 1, requires: { anyTower: ['arrow', 'sniper', 'magic'], minWave: 3 },
    effects: [flag('explosionOnHit', 45, ['arrow', 'sniper', 'magic'])],
  },
  {
    id: 'predatorsMark', name: "Predator's Mark",
    description: 'Towers deal +25% damage to burning, poisoned and frozen or slowed enemies.',
    rarity: 'epic', icon: 'eye', maxStacks: 1, requires: { anyTower: ['fire', 'poison', 'frost'], minWave: 3 },
    effects: [flag('burningBonusDamage', 0.25), flag('poisonedBonusDamage', 0.25), flag('frozenBonusDamage', 0.25)],
  },
  {
    id: 'staticDischarge', name: 'Static Discharge', description: 'Every hit has a 12% chance to trigger a 3-jump chain lightning for 50% damage.',
    rarity: 'epic', icon: 'chain', maxStacks: 1, requires: { anyTower: ['lightning', 'magic'], minWave: 3 },
    effects: [flag('chainLightningChance', 0.12)],
  },
  {
    id: 'coldFracture', name: 'Cold Fracture', description: 'Bosses take +35% damage while slowed or frozen.',
    rarity: 'epic', icon: 'freeze', maxStacks: 1, requires: { anyTower: ['frost'], minWave: 4 },
    effects: [flag('bossShatter', 0.35)],
  },

  // ----------------------------------------------------------------------------- legendary
  {
    id: 'shatteringShots', name: 'Shattering Shots', description: 'All projectiles split into 3 shards on impact, each dealing 30% damage.',
    rarity: 'legendary', icon: 'split', maxStacks: 1, requires: { minWave: 6 },
    effects: [flag('splitOnImpact', 3)],
  },
  {
    id: 'fallingStars', name: 'Falling Stars', description: 'Every defeated enemy has a 5% chance to call a meteor.',
    rarity: 'legendary', icon: 'meteor', maxStacks: 1, requires: { minWave: 7 },
    effects: [flag('meteorOnKillChance', 0.05)],
  },
  {
    id: 'stormLord', name: 'Storm Lord',
    description: 'Lightning chains indefinitely, losing 15% damage per jump. +25% chain range.',
    rarity: 'legendary', icon: 'lightning', maxStacks: 1, requires: { anyTower: ['lightning'], minWave: 6 },
    effects: [flag('infiniteChain', 1), stat('chainRange', 'pct', 0.25, ['lightning'])],
  },
  {
    id: 'primalAttunement', name: 'Primal Attunement',
    description: 'Every 3rd attack of every tower also applies the opposite element (fire/frost, poison/lightning).',
    rarity: 'legendary', icon: 'vortex', maxStacks: 1, requires: { minWave: 6 },
    effects: [flag('elementalSecondary', 1)],
  },
  {
    id: 'mergeFrenzy', name: 'Merge Frenzy', description: 'Merging a tower grants +50% attack speed to all towers for 6 seconds.',
    rarity: 'legendary', icon: 'frenzy', maxStacks: 1, requires: { minWave: 6 },
    effects: [flag('mergeFrenzy', 6)],
  },
  {
    id: 'archmagesLegacy', name: "Archmage's Legacy",
    description: 'Abilities are 35% stronger and recharge 20% faster. All cooldowns reset now.',
    rarity: 'legendary', icon: 'clock', maxStacks: 1, requires: { minWave: 8 },
    effects: [
      glob('abilityPower', 'pct', 0.35), glob('abilityCooldown', 'pct', -0.2),
      { kind: 'instant', action: 'resetCooldowns', value: 1 },
    ],
  },
];
