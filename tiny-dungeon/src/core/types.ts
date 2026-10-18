// Shared contracts for Tiny Dungeon. Everything here is plain data with no Phaser dependency, so the
// same definitions drive the game, the headless balance simulation and the unit tests.

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type WeaponId = 'sword' | 'bow' | 'staff';
export type HeroId = 'knight' | 'ranger' | 'mage';
export type Element = 'fire' | 'frost' | 'lightning' | 'poison';
export type GameMode = 'normal' | 'daily';

export type UpgradeTag =
  | 'offense' | 'defense' | 'crit' | 'speed' | 'utility' | 'economy'
  | 'melee' | 'projectile' | 'elemental' | 'fire' | 'frost' | 'lightning' | 'poison'
  | 'orbit' | 'death' | 'weapon';

/**
 * Every upgrade, synergy, hero and permanent upgrade is expressed as modifiers on this flat stat
 * sheet. Gameplay systems only ever read stats; they never ask "does the player own upgrade X".
 * Flags are numbers too (0 = off, >= 1 = on) so they stack and cap like everything else.
 */
export interface Stats {
  // Survival
  maxHp: number;
  armor: number;            // flat damage reduction per hit (never below balance.minDamageTaken)
  regen: number;            // HP per second
  dodge: number;            // 0..1 chance to ignore a hit
  lifeOnKill: number;       // HP restored per kill
  phoenixCharges: number;   // survive a fatal hit this many times per run
  invulnTime: number;       // seconds of invulnerability after being hit

  // Movement & pickup
  moveSpeed: number;        // world px per second
  pickupRadius: number;     // world px

  // Generic offense (applies to every weapon)
  damageMult: number;       // multiplier on weapon damage
  attackSpeedMult: number;  // multiplier on attacks per second
  critChance: number;       // 0..1
  critDamage: number;       // multiplier applied on crit (e.g. 1.5)
  extraProjectiles: number; // added to every projectile weapon's count
  pierce: number;           // extra enemies a projectile passes through
  rangeMult: number;
  areaMult: number;         // size of arcs, explosions, auras
  knockbackMult: number;
  multiStrike: number;      // each attack repeats this many extra times (Double Strike)
  projectileSpeedMult: number;

  // Weapon-specific
  swordDamage: number;      // flat bonus to sword base damage
  swordArc: number;         // arc in degrees
  bowDamage: number;
  bowArrows: number;        // arrows per volley before extraProjectiles
  staffDamage: number;
  staffBounces: number;     // staff bolts bounce to this many extra targets

  // Elements & status effects (chance per hit 0..1, damage as fraction of the hit per second)
  elementPower: number;     // multiplier on all status damage
  burnChance: number;
  burnDps: number;
  burnMaxStacks: number;
  slowChance: number;
  slowAmount: number;       // 0..1 movement reduction
  freezeChance: number;     // chance a slowed enemy is frozen solid briefly
  chainChance: number;
  chainCount: number;       // jumps per chain
  chainDamage: number;      // fraction of hit damage per jump
  chainCanCrit: number;     // flag
  poisonChance: number;
  poisonDps: number;
  poisonSpread: number;     // flag: poison spreads to nearby enemies on death

  // On-kill / periodic abilities
  explodeChance: number;    // chance a killed enemy explodes
  explosionDamage: number;  // fraction of player's base hit damage
  explosionRadius: number;  // world px before areaMult
  explosionPoison: number;  // flag: explosions apply poison
  orbitBlades: number;      // number of orbiting blades
  orbitDamage: number;      // fraction of player's base hit damage per touch
  orbitFreeze: number;      // flag: blades slow/freeze (Blade Orbit + Frost synergy)
  thunderLevel: number;     // strikes per thunderstorm pulse
  thunderInterval: number;  // seconds between pulses
  meteorLevel: number;      // meteors per shower
  meteorInterval: number;
  soulHarvest: number;      // damage fraction gained per kill (run-permanent, capped)
  chaosLevel: number;       // chance per hit to trigger a random element
  burnExplode: number;      // flag: burning enemies explode on death (Fire + Explosive Death)
  frostShatter: number;     // flag: frozen enemies take bonus crit damage

  // Economy
  goldMult: number;
  xpMult: number;
  luck: number;             // shifts rarity weights toward rarer upgrades
}

export type StatKey = keyof Stats;

/** Adds first, then percentage bonuses are summed per stat, then multipliers are multiplied. */
export interface StatEffect {
  stat: StatKey;
  add?: number;
  pct?: number;   // +0.2 = +20%, summed with other pct effects on the same stat
  mul?: number;   // multiplied in after pct (use sparingly, e.g. Infinite Blades)
}

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;               // shown on the card; keep under ~70 chars
  rarity: Rarity;
  icon: string;               // key into ICONS (src/game/assets.ts)
  maxLevel: number;
  tags: UpgradeTag[];
  effects: StatEffect[];      // applied once per level owned
  requiresWeapon?: WeaponId;  // only offered while that weapon is owned
  grantsWeapon?: WeaponId;    // picking it adds the weapon (weapon cards)
  unlock?: string;            // meta unlock id required before it can appear
  /** Instant effect when picked (Healing Potion, Gold Pouch). Such cards are only offered as filler. */
  onPick?: { healFraction?: number; gold?: number };
}

export interface SynergyDef {
  id: string;
  name: string;
  desc: string;
  requires: string[];         // upgrade ids, each owned at level >= 1
  effects: StatEffect[];
  evolution?: boolean;        // evolved abilities get a bigger banner
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  kind: 'melee' | 'projectile' | 'magic';
  baseDamage: number;
  cooldown: number;           // seconds between attacks before attackSpeedMult
  range: number;              // world px targeting range before rangeMult
  projectileSpeed?: number;
  knockback: number;
  icon: string;
}

export type EnemyBehavior = 'chase' | 'erratic' | 'lunge' | 'ranged' | 'tank' | 'summoner';

export interface EnemyDef {
  id: string;
  name: string;
  frame: string;              // texture frame key (see src/game/assets.ts)
  tint?: number;
  scale?: number;
  behavior: EnemyBehavior;
  hp: number;
  damage: number;             // contact or attack damage before scaling
  speed: number;              // world px per second
  radius: number;             // collision radius in world px
  armor?: number;
  knockbackResist?: number;   // 0..1
  xp: number;
  gold: number;
  cost: number;               // spawn budget cost
  minRoom: number;            // first room it may appear in
  // behavior parameters (only the ones the behavior uses)
  attackRange?: number;
  attackCooldown?: number;
  windup?: number;            // telegraph seconds before an attack lands
  projectileSpeed?: number;
  summon?: string;            // enemy id summoned
  summonCount?: number;
  unlock?: string;            // variants only spawn once unlocked
}

export type BossAttackId =
  | 'slimeJump' | 'slimeSplit' | 'slimeBurst'
  | 'kingSweep' | 'kingSummon' | 'kingCharge'
  | 'dragonBreath' | 'dragonMeteors' | 'dragonRing' | 'dragonTailSwipe';

export interface BossPhase {
  hpBelow: number;            // phase is active while hp fraction <= this (first phase uses 1)
  attacks: BossAttackId[];
  speedMult: number;
  attackDelay: number;        // seconds between attacks
}

export interface BossDef {
  id: string;
  name: string;
  title: string;              // banner subtitle
  frame: string;
  tint?: number;
  scale: number;
  hp: number;
  damage: number;
  speed: number;
  radius: number;
  room: number;               // first appearance; repeats every bossCycle rooms with scaling
  phases: BossPhase[];
  gold: number;
  xp: number;
}

export interface HeroDef {
  id: HeroId;
  name: string;
  desc: string;
  frame: string;
  weapon: WeaponId;
  base: Partial<Stats>;       // overrides on top of balance.baseStats
  passive: { name: string; desc: string; effects: StatEffect[] };
  favoredTags: UpgradeTag[];  // these tags get balance.heroTagWeight in the upgrade roll
  unlockCost: number;         // 0 = available from the start
}

export interface MetaUpgradeDef {
  id: string;
  name: string;
  desc: string;               // e.g. "+10 starting HP per level"
  icon: string;
  maxLevel: number;
  baseCost: number;
  costGrowth: number;         // cost(level) = round(baseCost * costGrowth^level)
  effects: StatEffect[];      // per level, applied to every run
  special?: 'extraChoice' | 'reroll' | 'unlockBow' | 'unlockStaff';
}

export type AchievementCheck =
  | { kind: 'totalKills'; value: number }
  | { kind: 'bestRoom'; value: number }
  | { kind: 'bossDefeated'; boss: string }
  | { kind: 'noDamageRoom'; value: number }      // reach room N in a run without taking damage
  | { kind: 'legendariesTotal'; value: number }
  | { kind: 'runs'; value: number }
  | { kind: 'goldTotal'; value: number }
  | { kind: 'synergiesInRun'; value: number }
  | { kind: 'killsInRun'; value: number }
  | { kind: 'heroRoom'; hero: HeroId; value: number }
  | { kind: 'dailyCompleted'; value: number }
  | { kind: 'levelInRun'; value: number };

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  check: AchievementCheck;
  reward?: { gold?: number; unlock?: string; tokens?: number };
}

// ---------------------------------------------------------------------------------------------
// Rooms

export type RoomType = 'combat' | 'elite' | 'treasure' | 'boss' | 'shrine';

export interface SpawnEntry {
  at: number;        // seconds after the room starts
  enemy: string;     // EnemyDef id
  count: number;
  elite?: boolean;
}

export interface RoomPlan {
  index: number;     // 1-based room number
  type: RoomType;
  spawns: SpawnEntry[];
  bossId?: string;
  hpMult: number;
  dmgMult: number;
  goldMult: number;
}

// ---------------------------------------------------------------------------------------------
// Run state (pure data, owned by the run; Phaser objects hold references only)

export interface RunState {
  seed: number;
  mode: GameMode;
  hero: HeroId;
  room: number;                 // current room number (1-based)
  upgrades: Record<string, number>;   // upgrade id -> level
  weapons: WeaponId[];
  synergies: string[];          // active synergy ids
  stats: Stats;                 // derived; recompute with recomputeStats()
  hp: number;
  gold: number;
  xp: number;
  level: number;
  kills: number;
  soulStacks: number;           // Soul Harvest kills counted this run
  damageTaken: number;
  roomsWithoutDamage: number;   // consecutive rooms cleared without taking damage from room 1
  phoenixUsed: number;
  revived: boolean;             // rewarded revive used
  legendariesPicked: number;
  bossesDefeated: string[];
  rerollsLeft: number;
  elapsed: number;              // seconds of gameplay
  runId: string;                // unique id for idempotent reward claims
  meta: Record<string, number>; // permanent upgrade levels captured at run start
  buffs: ActiveBuff[];          // temporary buffs / companions (Mystery Egg, shrines)
  levelBonuses: number;         // level-ups applied (each adds balance.levelUpEffects)
  // --- optional additions (core/run.ts fills them; absent on states built elsewhere) ---
  unlocks?: string[];            // unlock ids captured at run start (gates upgrade offers)
  modifiers?: StatEffect[];      // run-wide modifiers (daily challenge)
  damageThisRoom?: number;       // damage taken since the current room started
  nextChoice?: { minRarity?: Rarity };  // set by shrines; shapes the next upgrade offer, cleared by applyUpgrade
  curseRooms?: number;           // rooms left with +enemy HP (Cursed Chest)
}

export interface BuffDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  effects: StatEffect[];
  companion?: string;           // EXTRA frame of a companion that follows the hero and fights
}

export interface ActiveBuff {
  id: string;                   // BuffDef id
  roomsLeft: number;            // counts down when a room is cleared; removed at 0
}

export interface UpgradeChoice {
  def: UpgradeDef;
  nextLevel: number;
  synergyHints: string[];       // names of synergies this pick would complete or advance
}

export interface RunSummary {
  runId: string;
  mode: GameMode;
  hero: HeroId;
  roomsCleared: number;
  kills: number;
  gold: number;
  level: number;
  bossesDefeated: string[];
  synergies: string[];
  durationSec: number;
  noDamageRooms: number;
  legendaries: number;
}
