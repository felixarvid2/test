/**
 * Shared data contracts. Every gameplay system (simulation, content data, UI, meta progression)
 * agrees on these types. Gameplay content is plain data built from them; behaviour lives in the
 * simulation, which interprets Effects, flags and ability kinds generically.
 */

// ---------------------------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------------------------

export const TOWER_IDS = ['arrow', 'cannon', 'frost', 'lightning', 'fire', 'poison', 'sniper', 'magic'] as const;
export type TowerId = (typeof TOWER_IDS)[number];

export const ENEMY_IDS = ['goblin', 'rat', 'orc', 'skeleton', 'bat', 'shaman', 'summoner', 'troll', 'stoneling', 'imp'] as const;
/** stoneling (Golem spawn) and imp (Dragon's flyers) only appear through bosses. */
export type EnemyId = (typeof ENEMY_IDS)[number];

export const BOSS_IDS = ['goblinKing', 'stoneGolem', 'dragon'] as const;
export type BossId = (typeof BOSS_IDS)[number];

export const ABILITY_IDS = ['meteor', 'freeze', 'repair', 'frenzy'] as const;
export type AbilityId = (typeof ABILITY_IDS)[number];

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/** Max tower level reachable by merging. */
export const MAX_TOWER_LEVEL = 5;

/**
 * Icon texture keys. Art produces one `icon_<key>` texture per entry; content data (upgrades,
 * synergies, achievements, meta upgrades, events) must only reference these.
 */
export const ICON_KEYS = [
  'damage', 'speed', 'range', 'coin', 'heart', 'shield', 'crit', 'chain', 'explosion', 'split',
  'arrow', 'cannon', 'frost', 'lightning', 'fire', 'poison', 'sniper', 'magic',
  'meteor', 'freeze', 'repair', 'frenzy', 'skull', 'star', 'clock', 'merge', 'vortex', 'gem',
  'chest', 'merchant', 'curse', 'treasure', 'elite', 'trophy', 'lock', 'slot', 'crown', 'dragon',
  'golem', 'eye', 'target', 'castle',
] as const;
export type IconKey = (typeof ICON_KEYS)[number];

// ---------------------------------------------------------------------------------------------
// Effects: the composable unit behind tower level perks, upgrades and synergies
// ---------------------------------------------------------------------------------------------

/** Per-tower stats. Effective value = (base + sum(flat)) * (1 + sum(pct)) * product(mul). */
export type TowerStat =
  | 'damage'
  | 'fireRate'        // attacks per second
  | 'range'           // px
  | 'splashRadius'    // px, 0 = single target
  | 'critChance'      // 0..1
  | 'critMult'        // damage multiplier on crit (base 2)
  | 'projectileSpeed' // px/s
  | 'statusPower'     // strength of the tower's status: slow fraction, burn dps, poison dps per stack
  | 'statusDuration'  // seconds
  | 'chainCount'      // extra enemies a chain/bolt jumps to
  | 'chainRange'      // px between chain jumps
  | 'armorPen';       // 0..1, fraction of enemy armor ignored

/** Run-wide stats (no tower scope). Same formula as TowerStat. */
export type GlobalStat =
  | 'coinGain'        // multiplier on coins from kills (base 1)
  | 'castleMaxHp'     // base from balance
  | 'towerCost'       // multiplier on buy price (base 1)
  | 'abilityCooldown' // multiplier on ability cooldowns (base 1)
  | 'abilityPower'    // multiplier on ability damage/heal/duration (base 1)
  | 'bossDamage'      // multiplier on damage dealt to bosses (base 1)
  | 'waveCoinBonus';  // flat coins granted at each wave clear (base 0)

/**
 * Numeric flags. They stack additively across sources. Chances are 0..1 (summed, capped at 1 by
 * the simulation), counts are integers, booleans are 1/0. Scoped flags apply to the tower types in
 * Effect.tower (or all towers when omitted). The simulation implements every flag listed here.
 */
export type FlagKey =
  // --- projectile shaping ---
  | 'extraProjectiles'     // count: extra projectiles per attack at the same target (volley)
  | 'multishot'            // count: extra simultaneous attacks at *different* targets in range
  | 'pierce'               // count: projectile passes through this many extra enemies
  | 'splitOnImpact'        // count: on impact, projectile splits into N shards (30% dmg, no further split)
  | 'clusterBombs'         // count: explosion scatters N bomblets (35% dmg, 50% radius)
  // --- on-hit statuses ---
  | 'slowOnHit'            // fraction: hits slow by this much for 1.5 s (max slow 70%)
  | 'freezeChance'         // chance: hit freezes target 1.2 s (bosses: 0.3 s, then 3 s immunity)
  | 'stunChance'           // chance: hit stuns target 0.6 s
  | 'burnOnHit'            // fraction: hit applies burn of (fraction * hit damage) dps for 3 s
  | 'poisonOnHit'          // count: hit adds N poison stacks (5 dps per stack, 4 s, refreshes)
  | 'vulnerabilityOnHit'   // fraction: target takes +X damage from all sources for 3 s (max 50%)
  // --- on-hit / on-attack procs ---
  | 'explosionOnHit'       // px radius: every hit also explodes for 40% damage in radius
  | 'everyNthExplosion'    // n: every Nth attack of each tower triggers a 60px explosion of 150% damage (lowest non-zero N wins)
  | 'fireZoneOnHit'        // dps: hits leave a burning ground patch (50px, 2.5 s, max 12 zones)
  | 'chainLightningChance' // chance: hit triggers a 3-jump chain lightning of 50% damage
  | 'critLightning'        // count: critical hits fire N lightning bolts at nearby enemies (60% damage)
  | 'randomElement'        // 1: each hit applies one random element: burn, slow, poison or stun
  | 'elementalSecondary'   // 1: every 3rd attack also applies the tower's opposite element (fire<->frost, poison<->lightning, others: arcane burst)
  // --- conditional damage ---
  | 'executeThreshold'     // fraction: non-boss targets below X max HP die instantly; bosses take +100% instead
  | 'frozenBonusDamage'    // fraction: +X damage against frozen or slowed targets
  | 'burningBonusDamage'   // fraction: +X damage against burning targets
  | 'poisonedBonusDamage'  // fraction: +X damage against poisoned targets
  | 'adjacencyBonus'       // fraction: +X damage per adjacent tower (slot neighbour) of a different type
  // --- on-death ---
  | 'fireSpread'           // 1: burning enemies spread their burn to the nearest enemy every 1 s and on death
  | 'flameExplosionOnDeath'// px radius: burning enemies explode on death (50% of their max burn dps * 4)
  | 'poisonSpreadOnDeath'  // 1: poisoned enemies pass their stacks to up to 2 enemies within 90px on death
  | 'poisonExplosionOnDeath' // px radius: poisoned enemies explode on death for 8 dmg per stack
  | 'frostNova'            // px radius: freezing an enemy releases a nova that slows 40% for 2 s and deals 50% hit damage
  | 'burnSpreadsPoison'    // count: burning enemies apply N poison stacks to enemies within 80px on death
  // --- global (scope ignored) ---
  | 'meteorOnKillChance'   // chance: each kill calls a meteor (90px, 150 + 25*wave dmg), max 1 per 0.5 s
  | 'infiniteChain'        // 1: chains keep jumping with 15% decay per jump until damage < 5% (hard cap 25 jumps)
  | 'mergeFrenzy'          // seconds: each merge grants +50% attack speed to all towers for N seconds
  | 'killCoinBonus'        // flat coins per kill
  | 'bossShatter'          // fraction: bosses take +X damage while slowed/frozen
  | 'castleRegen'          // HP per second regenerated during waves
  | 'thorns';              // damage dealt to every enemy that hits the castle (they still deal damage)

export interface StatEffect {
  kind: 'stat';
  stat: TowerStat;
  op: 'flat' | 'pct' | 'mul';
  value: number;
  /** Tower types affected; omitted = all towers. */
  tower?: TowerId[];
}

export interface GlobalStatEffect {
  kind: 'global';
  stat: GlobalStat;
  op: 'flat' | 'pct' | 'mul';
  value: number;
}

export interface FlagEffect {
  kind: 'flag';
  flag: FlagKey;
  value: number;
  /** Tower types affected; omitted = all towers. Ignored for global flags. */
  tower?: TowerId[];
}

/** One-shot effects applied the moment an upgrade is picked (not stored as modifiers). */
export interface InstantEffect {
  kind: 'instant';
  action: 'healCastle' | 'grantCoins' | 'grantTower' | 'unlockSlot' | 'resetCooldowns';
  /** healCastle: fraction of max HP; grantCoins: coins; grantTower: tower level (random unlocked type unless `tower` given). */
  value: number;
  tower?: TowerId[];
}

export type Effect = StatEffect | GlobalStatEffect | FlagEffect | InstantEffect;

// ---------------------------------------------------------------------------------------------
// Towers
// ---------------------------------------------------------------------------------------------

export type AttackKind =
  | 'projectile' // travelling projectile hits one target (or splashes when splashRadius > 0)
  | 'lobbed'     // arcing projectile to the target's predicted position, always splashes, ground only
  | 'chain'      // instant bolt that jumps chainCount times
  | 'beam'       // instant hitscan (sniper)
  | 'cone';      // short-range spray applying statuses to all enemies in a 50° cone (fire)

export interface TowerLevelDef {
  /** Multipliers on the tower's base damage / fireRate and flat range bonus at this level. */
  damageMult: number;
  fireRateMult: number;
  rangeBonus: number;
  /** Short perk name shown in UI, e.g. "Double Arrows". Level 1 has none. */
  perkName?: string;
  perkDesc?: string;
  /** Perk effects; apply only to this tower instance, cumulative with lower levels. */
  perks: Effect[];
}

export interface TowerDef {
  id: TowerId;
  name: string;
  /** One-line role shown on cards and the collection screen. */
  role: string;
  attack: AttackKind;
  /** Base stats at level 1. */
  damage: number;
  fireRate: number;
  range: number;
  splashRadius: number;
  projectileSpeed: number;
  critChance: number;
  critMult: number;
  statusPower: number;
  statusDuration: number;
  chainCount: number;
  chainRange: number;
  armorPen: number;
  /** Whether the tower can target flying enemies. */
  hitsAir: boolean;
  /** Effects every instance has from level 1 (e.g. frost: slowOnHit). */
  baseEffects: Effect[];
  /** Index 0 = level 1 ... index 4 = level 5. */
  levels: TowerLevelDef[];
  /** Theme colour (0xRRGGBB) for projectiles, particles and UI accents. */
  color: number;
  /** Starting availability: 'start' towers are unlocked on a fresh save, others cost meta gems. */
  unlock: { kind: 'start' } | { kind: 'gems'; cost: number };
  /** Relative weight in the random "Buy Tower" roll. */
  buyWeight: number;
}

// ---------------------------------------------------------------------------------------------
// Enemies and bosses
// ---------------------------------------------------------------------------------------------

export type EnemyAbility =
  | { kind: 'heal'; radius: number; amount: number; interval: number }            // heals others nearby (fraction of their max HP)
  | { kind: 'summon'; enemy: EnemyId; count: number; interval: number }
  | { kind: 'frontShield'; reduction: number }                                     // reduces damage from towers in front (within 90° of facing)
  | { kind: 'splitOnDeath'; enemy: EnemyId; count: number };

export interface EnemyDef {
  id: EnemyId;
  name: string;
  hp: number;
  /** px per second along the path. */
  speed: number;
  /** 0..0.8 fraction of damage blocked. */
  armor: number;
  coins: number;
  castleDamage: number;
  flying: boolean;
  /** Collision/visual radius in px. */
  radius: number;
  abilities: EnemyAbility[];
  /** First wave this enemy can appear in regular waves (999 = boss-only). */
  firstWave: number;
  /** Relative spawn weight once available. */
  weight: number;
  /** Budget points this enemy costs in wave generation. */
  threat: number;
  description: string;
}

export type BossAbility =
  | { kind: 'summon'; enemy: EnemyId; count: number; interval: number }
  | { kind: 'haste'; radius: number; speedMult: number; duration: number; interval: number }
  | { kind: 'charge'; speedMult: number; duration: number; telegraph: number; interval: number }
  | { kind: 'shieldAllies'; radius: number; shieldHp: number; interval: number }
  | { kind: 'spawnOnDamage'; enemy: EnemyId; everyFraction: number; count: number }
  | { kind: 'fireBreath'; length: number; width: number; telegraph: number; interval: number; castleDamage: number }
  | { kind: 'disableTower'; telegraph: number; duration: number; interval: number }
  | { kind: 'armorUp'; armor: number; duration: number; interval: number };

export interface BossPhase {
  /** Phase starts when HP fraction drops to or below this (first phase uses 1). */
  hpBelow: number;
  speedMult: number;
  /** Ability cooldown multiplier for this phase (lower = more frequent). */
  intervalMult: number;
  abilities: BossAbility[];
  /** Banner text when the phase starts, e.g. "The King is enraged!". */
  announce?: string;
}

export interface BossDef {
  id: BossId;
  name: string;
  title: string;
  wave: number;
  hp: number;
  speed: number;
  armor: number;
  coins: number;
  gems: number;
  castleDamage: number;
  flying: boolean;
  radius: number;
  phases: BossPhase[];
}

// ---------------------------------------------------------------------------------------------
// Upgrades, synergies, events
// ---------------------------------------------------------------------------------------------

export interface UpgradeDef {
  id: string;
  name: string;
  /** Exact numbers, e.g. "+15% attack speed for all towers." */
  description: string;
  rarity: Rarity;
  icon: IconKey;
  effects: Effect[];
  /** How many times it can be taken in one run (1 = unique). */
  maxStacks: number;
  /** Only offered when these conditions hold. */
  requires?: {
    /** At least one of these tower types is on the board or unlocked in this run's pool. */
    anyTower?: TowerId[];
    /** All these upgrades already taken. */
    upgrades?: string[];
    minWave?: number;
  };
}

export interface SynergyDef {
  id: string;
  name: string;
  description: string;
  icon: IconKey;
  /** Active while all conditions hold (re-evaluated when the board or upgrades change). */
  requires: {
    /** All these tower types are on the board. */
    towers?: TowerId[];
    /** Each flag's total (global + any tower) is at least min. */
    flags?: { flag: FlagKey; min: number }[];
    /** All these upgrades taken. */
    upgrades?: string[];
    /** At least one tower of this type at or above this level. */
    towerLevel?: { tower: TowerId; level: number };
  };
  effects: Effect[];
}

export type RandomEventId = 'treasure' | 'elite' | 'merchant' | 'chest' | 'cursed';

/** Modifiers an event applies to the next wave. */
export interface WaveModifier {
  enemyHpMult?: number;
  enemySpeedMult?: number;
  enemyCountMult?: number;
  coinMult?: number;
  /** Chance a regular enemy spawns as an elite (x2.5 HP, x2 coins, golden tint). */
  eliteChance?: number;
}

export interface EventOption {
  id: string;
  label: string;
  description: string;
  /** Run coins the option costs (merchant). */
  cost?: number;
  /** Applied to the next wave if chosen. */
  waveModifier?: WaveModifier;
  /** Applied immediately if chosen. */
  effects?: Effect[];
  /** Gives a random upgrade of at least this rarity. */
  upgradeRarity?: Rarity;
}

export interface RandomEventDef {
  id: RandomEventId;
  name: string;
  description: string;
  icon: IconKey;
  /** Relative chance once events can occur. */
  weight: number;
  minWave: number;
  /** Options shown; the last one is always a free "skip/decline" option. Chest options are rolled from these. */
  options: EventOption[];
}

// ---------------------------------------------------------------------------------------------
// Meta progression, achievements, daily challenge
// ---------------------------------------------------------------------------------------------

export type MetaStat =
  | 'castleHp'       // +value castle HP per level
  | 'startCoins'     // +value starting coins per level
  | 'damagePct'      // +value (fraction) tower damage per level
  | 'fireRatePct'    // +value (fraction) tower attack speed per level
  | 'discountPct'    // -value (fraction) tower buy price per level
  | 'startLevel'     // starting arrow tower level +value per level
  | 'extraSlot'      // +value unlocked slots at start per level
  | 'coinGainPct'    // +value (fraction) coin gain per level
  | 'abilityCdPct'   // -value (fraction) ability cooldown per level
  | 'rerolls';       // +value free upgrade rerolls per run per level

export interface MetaUpgradeDef {
  id: string;
  name: string;
  description: string; // may contain {value} replaced by the total at the current level
  icon: IconKey;
  stat: MetaStat;
  valuePerLevel: number;
  maxLevel: number;
  /** Cost of level n (1-based) = round(baseCost * costGrowth^(n-1)). */
  baseCost: number;
  costGrowth: number;
}

/** Lifetime statistics tracked in the save; achievements read these. */
export interface LifetimeStats {
  runs: number;
  wavesSurvived: number;
  bestWave: number;
  enemiesKilled: number;
  bossesKilled: number;
  goblinKingKills: number;
  golemKills: number;
  dragonKills: number;
  towersMerged: number;
  towersBought: number;
  highestTowerLevel: number;
  chainLightnings: number;
  meteorsCalled: number;
  abilitiesUsed: number;
  flawlessWaves: number;
  synergiesActivated: number;
  legendariesPicked: number;
  gemsEarned: number;
  coinsEarned: number;
  dailyRuns: number;
  /** Per tower type: kills credited. */
  towerKills: Partial<Record<TowerId, number>>;
  /** Synergy id -> times activated. */
  synergyCounts: Record<string, number>;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: IconKey;
  /** Which numeric lifetime stat to compare; towerKills/synergyCounts are not allowed here. */
  stat: Exclude<keyof LifetimeStats, 'towerKills' | 'synergyCounts'>;
  target: number;
  /** Gems awarded once on unlock. */
  reward: number;
}

export interface DailyModifier {
  id: string;
  name: string;
  description: string;
  /** Restrict the buy pool to these towers (if set). */
  towerPool?: TowerId[];
  waveModifier?: WaveModifier;
  /** Effects applied at run start. */
  effects?: Effect[];
  startCoins?: number;
}
