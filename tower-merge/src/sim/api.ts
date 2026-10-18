/**
 * Public surface of the headless simulation. The simulation is pure TypeScript (no Phaser): the
 * GameScene renders it and forwards player input, and tools/simulate.ts runs it with bots for
 * balance testing. Time is in seconds, distances in world pixels (see data/map.ts).
 *
 * Rendering contract: entity arrays are fixed-size pools. Renderers mirror them by index and show
 * an entity only while `active` is true; a change of `id` at the same index means a new entity.
 * One-off happenings (shots, hits, deaths, merges...) arrive through drainEvents().
 */
import type {
  AbilityId, BossId, Effect, EnemyId, EventOption, RandomEventId, Rarity, TowerId, UpgradeDef, WaveModifier,
} from '../data/types';

// ---------------------------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------------------------

/** Everything a run needs from outside: meta progression bonuses, unlocks, daily modifiers. */
export interface RunOptions {
  seed: number;
  /** Tower types the Buy button can roll (unlocked in the collection, or the daily pool). */
  towerPool: TowerId[];
  abilities: AbilityId[];
  castleHpBonus: number;
  startCoinsBonus: number;
  /** Fractions, e.g. 0.1 = +10%. */
  damagePct: number;
  fireRatePct: number;
  discountPct: number;
  coinGainPct: number;
  abilityCdPct: number;
  /** Level of the starting arrow tower (1 + meta). */
  startTowerLevel: number;
  /** Unlocked slots at start: 4 + meta. */
  startingSlots: number;
  freeRerolls: number;
  /** Daily challenge: extra modifiers applied to every wave and effects applied at start. */
  daily?: { waveModifier?: WaveModifier; effects?: Effect[]; startCoins?: number };
}

// ---------------------------------------------------------------------------------------------
// Entity snapshots (read-only for renderers)
// ---------------------------------------------------------------------------------------------

export interface EnemyState {
  active: boolean;
  /** Unique per spawn; renderers reset their sprite when it changes. */
  id: number;
  kind: EnemyId | BossId;
  isBoss: boolean;
  elite: boolean;
  flying: boolean;
  x: number;
  y: number;
  /** Movement direction in radians (0 = +x), for facing/flip. */
  angle: number;
  radius: number;
  hp: number;
  maxHp: number;
  /** Temporary shield HP (Stone Golem) absorbed before hp. */
  shield: number;
  armor: number;
  /** Distance travelled along its lane; higher = closer to the castle. */
  progress: number;
  /** Status timers in seconds (0 = none) and strengths. */
  slow: number;        // current slow fraction 0..0.7
  slowTime: number;
  frozenTime: number;
  stunTime: number;
  burnDps: number;
  burnTime: number;
  poisonStacks: number;
  poisonTime: number;
  vulnerable: number;
  hasteTime: number;
  /** Boss: current phase index; charging/telegraphing flags for animation. */
  phase: number;
  charging: boolean;
  /** Seconds since the last hit, for hit-flash rendering. */
  hitFlash: number;
}

export interface TowerState {
  /** Unique per tower instance (new uid after a merge). */
  uid: number;
  slot: number;
  type: TowerId;
  level: number;
  /** Radians, current aim (for turret rotation / attack animation). */
  aim: number;
  /** Seconds since last attack (attack animation timing). */
  sinceAttack: number;
  /** Remaining disable time (Dragon), 0 = active. */
  disabledTime: number;
  kills: number;
  damageDealt: number;
}

export type ProjectileKind =
  | 'arrow' | 'cannonball' | 'frostShard' | 'fireball' | 'poisonGlob' | 'magicOrb' | 'shard' | 'bomblet' | 'meteor';

export interface ProjectileState {
  active: boolean;
  id: number;
  kind: ProjectileKind;
  towerType: TowerId | null;
  x: number;
  y: number;
  angle: number;
  /** Lobbed projectiles: 0..1 flight progress and peak height in px, for arc rendering. */
  arcT: number;
  arcHeight: number;
}

export interface FireZoneState {
  active: boolean;
  id: number;
  x: number;
  y: number;
  radius: number;
  timeLeft: number;
}

export interface SlotState {
  id: number;
  unlocked: boolean;
  tower: TowerState | null;
}

// ---------------------------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------------------------

export type SimEvent =
  | { type: 'shot'; towerUid: number; slot: number; tower: TowerId; level: number; x: number; y: number; tx: number; ty: number }
  | { type: 'beam'; tower: TowerId; x: number; y: number; tx: number; ty: number; crit: boolean }
  | { type: 'chain'; points: { x: number; y: number }[]; source: TowerId | 'proc' }
  | { type: 'cone'; x: number; y: number; angle: number; range: number }
  | { type: 'hit'; x: number; y: number; kind: ProjectileKind | 'beam' | 'chain' | 'cone'; tower: TowerId | null }
  | { type: 'damage'; x: number; y: number; amount: number; crit: boolean; enemyId: number }
  | { type: 'explosion'; x: number; y: number; radius: number; element: 'fire' | 'frost' | 'poison' | 'arcane' | 'physical' | 'lightning' }
  | { type: 'status'; enemyId: number; status: 'freeze' | 'stun' | 'burn' | 'poison' | 'slow' | 'execute' }
  | { type: 'enemySpawned'; enemyId: number; kind: EnemyId | BossId; x: number; y: number }
  | { type: 'enemyDied'; enemyId: number; kind: EnemyId | BossId; x: number; y: number; coins: number; isBoss: boolean; elite: boolean }
  | { type: 'enemyHealed'; enemyId: number; x: number; y: number; amount: number }
  | { type: 'castleHit'; damage: number; hp: number; maxHp: number }
  | { type: 'castleHealed'; amount: number; hp: number }
  | { type: 'coins'; amount: number; total: number; x?: number; y?: number }
  | { type: 'towerPlaced'; slot: number; tower: TowerId; level: number }
  | { type: 'merged'; slot: number; fromSlot: number; tower: TowerId; level: number }
  | { type: 'towerSold'; slot: number; refund: number }
  | { type: 'slotUnlocked'; slot: number }
  | { type: 'towerDisabled'; slot: number; duration: number }
  | { type: 'waveStart'; wave: number; isBoss: boolean; enemyCount: number }
  | { type: 'waveCleared'; wave: number; flawless: boolean; bonus: number }
  | { type: 'bossSpawned'; boss: BossId; name: string; title: string }
  | { type: 'bossPhase'; boss: BossId; phase: number; announce?: string }
  | { type: 'bossTelegraph'; boss: BossId; ability: 'charge' | 'fireBreath' | 'disableTower' | 'summon' | 'haste' | 'shieldAllies' | 'armorUp'; x: number; y: number; tx?: number; ty?: number; slot?: number; duration: number; width?: number; length?: number }
  | { type: 'bossAbility'; boss: BossId; ability: string; x: number; y: number }
  | { type: 'bossDefeated'; boss: BossId; x: number; y: number; coins: number; gems: number }
  | { type: 'synergyActivated'; id: string; name: string }
  | { type: 'abilityUsed'; ability: AbilityId; x?: number; y?: number; radius?: number }
  | { type: 'meteor'; x: number; y: number; radius: number }
  | { type: 'upgradePicked'; id: string; rarity: Rarity }
  | { type: 'phaseChanged'; phase: RunPhase }
  | { type: 'gameOver'; wave: number };

// ---------------------------------------------------------------------------------------------
// Run state
// ---------------------------------------------------------------------------------------------

/**
 * 'wave'       enemies spawning/alive; towers fire.
 * 'upgrade'    wave cleared; waiting for chooseUpgrade(). Simulation frozen.
 * 'event'      a random event is offered; waiting for resolveEvent(). Simulation frozen.
 * 'prewave'    short countdown before the next wave (player may buy/merge); auto-advances.
 * 'defeated'   castle at 0 HP; a revive may still be offered. Simulation frozen.
 * 'over'       run finished (no revive taken).
 */
export type RunPhase = 'prewave' | 'wave' | 'upgrade' | 'event' | 'defeated' | 'over';

export interface PendingEvent {
  id: RandomEventId;
  name: string;
  description: string;
  options: EventOption[];
}

export interface RunStats {
  wave: number;
  wavesCleared: number;
  enemiesKilled: number;
  bossesKilled: BossId[];
  towersMerged: number;
  towersBought: number;
  highestTowerLevel: number;
  coinsEarned: number;
  /** Meta currency earned this run (before any doubling). */
  gemsEarned: number;
  chainLightnings: number;
  meteorsCalled: number;
  abilitiesUsed: number;
  flawlessWaves: number;
  synergiesActivated: string[];
  legendariesPicked: number;
  upgradesTaken: string[];
  towerKills: Partial<Record<TowerId, number>>;
  towerDamage: Partial<Record<TowerId, number>>;
  timeSeconds: number;
}

export type MoveResult = 'moved' | 'swapped' | 'merged' | 'invalid';

export interface AbilityState {
  id: AbilityId;
  cooldown: number;     // seconds remaining
  maxCooldown: number;
  activeTime: number;   // seconds remaining of the ability's effect (freeze/frenzy)
}

/** Temporary rewards (Emergency Power). */
export type EmergencyPower = 'doubleDamage' | 'freezeStart' | 'legendaryTower';

export interface WorldApi {
  readonly options: RunOptions;
  readonly phase: RunPhase;
  readonly wave: number;
  readonly isBossWave: boolean;
  /** Seconds left in 'prewave'. */
  readonly prewaveTime: number;
  readonly coins: number;
  readonly castleHp: number;
  readonly castleMaxHp: number;
  readonly enemies: readonly EnemyState[];
  readonly projectiles: readonly ProjectileState[];
  readonly fireZones: readonly FireZoneState[];
  readonly slots: readonly SlotState[];
  readonly abilities: readonly AbilityState[];
  readonly stats: RunStats;
  readonly activeSynergies: readonly string[];
  readonly upgradeChoices: readonly UpgradeDef[];
  readonly pendingEvent: PendingEvent | null;
  /** Remaining free rerolls this run. */
  readonly freeRerolls: number;
  /** Revive already used this run. */
  readonly revived: boolean;
  /** Next wave modifiers (from events), for HUD badges. */
  readonly nextWaveModifier: WaveModifier | null;

  /** Advance the simulation; dt is clamped and sub-stepped internally. Speed multiplier for fast-forward. */
  update(dt: number): void;
  drainEvents(): SimEvent[];

  // --- player actions (all return false/'invalid' when not allowed) ---
  buyCost(): number;
  /** Buys a random tower from the pool into the first free unlocked slot. */
  buyTower(): { ok: boolean; slot?: number; tower?: TowerId };
  /** Drag a tower from one slot to another: merge if identical and below max level, else move/swap. */
  moveTower(from: number, to: number): MoveResult;
  canMerge(from: number, to: number): boolean;
  sellValue(slot: number): number;
  sellTower(slot: number): boolean;
  unlockSlotCost(): number;
  unlockSlot(slot: number): boolean;
  useAbility(id: AbilityId): boolean;
  chooseUpgrade(id: string): boolean;
  /** Uses a free reroll if available unless `paid` (reward/ad), which always works once per screen. */
  rerollUpgrades(paid?: boolean): boolean;
  resolveEvent(optionId: string): boolean;
  /** Skip the pre-wave countdown. */
  startWaveNow(): void;

  // --- reward hooks (called only after a confirmed reward) ---
  revive(): boolean;
  grantTower(type: TowerId, level: number): boolean;
  applyEmergencyPower(power: EmergencyPower): boolean;
  /** Effective stats of a tower for UI (tooltips/collection). */
  describeTower(slot: number): TowerStatsView | null;
  /** End the run now (quit from pause menu). */
  forfeit(): void;
}

export interface TowerStatsView {
  type: TowerId;
  level: number;
  damage: number;
  fireRate: number;
  range: number;
  dps: number;
  splashRadius: number;
  critChance: number;
  perks: string[];
}
