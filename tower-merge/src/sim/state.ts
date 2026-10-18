import { BALANCE } from '../data/balance';
import type { BossDef, EnemyDef, EnemyId, BossId, RandomEventDef, SynergyDef, TowerId, UpgradeDef, Effect, WaveModifier, BossAbility } from '../data/types';
import { TOWER_IDS } from '../data/types';
import type {
  AbilityState, EnemyState, FireZoneState, PendingEvent, ProjectileKind, ProjectileState, RunOptions, RunPhase,
  RunStats, SimEvent, SlotState, TowerState,
} from './api';
import { SpatialGrid } from './grid';
import { GlobalMods, ModSet, NFLAGS } from './modifiers';
import type { Lane } from './path';
import { GROUND_LANE } from './path';
import { Rng } from './rng';

// ---------------------------------------------------------------------------------------------
// Pooled entities. They implement the public snapshot interfaces and carry internal fields.
// ---------------------------------------------------------------------------------------------

export class TStats {
  damage = 0;
  fireRate = 1;
  range = 100;
  splash = 0;
  critChance = 0;
  critMult = 2;
  projSpeed = 0;
  statusPower = 1;
  statusDuration = 1;
  chainCount = 0;
  chainRange = 0;
  armorPen = 0;
  /** statusPower / the tower's base statusPower: scales on-hit status strengths. */
  spRel = 1;
  /** statusDuration / the tower's base statusDuration. */
  durRel = 1;
  /** damage / base damage of the tower type: scales stack-based damage over time. */
  dotScale = 1;
  readonly flags = new Float64Array(NFLAGS);
}

export class TowerInst implements TowerState {
  uid = 0;
  slot = 0;
  type: TowerId = 'arrow';
  level = 1;
  aim = -Math.PI / 2;
  sinceAttack = 99;
  disabledTime = 0;
  kills = 0;
  damageDealt = 0;
  // internal
  cooldown = 0;
  attackCount = 0;
  /** Coins invested (for the sell refund). */
  invested = 0;
  temp = false;
  readonly stats = new TStats();
}

export class Enemy implements EnemyState {
  active = false;
  id = 0;
  kind: EnemyId | BossId = 'goblin';
  isBoss = false;
  elite = false;
  flying = false;
  x = 0;
  y = 0;
  angle = 0;
  radius = 10;
  hp = 0;
  maxHp = 1;
  shield = 0;
  armor = 0;
  progress = 0;
  slow = 0;
  slowTime = 0;
  frozenTime = 0;
  stunTime = 0;
  burnDps = 0;
  burnTime = 0;
  poisonStacks = 0;
  poisonTime = 0;
  vulnerable = 0;
  hasteTime = 0;
  phase = 0;
  charging = false;
  hitFlash = 99;
  // internal
  seg = 0;
  lateral = 0;
  lane: Lane = GROUND_LANE;
  def: EnemyDef | null = null;
  bossDef: BossDef | null = null;
  baseArmor = 0;
  baseSpeed = 0;
  /** Effective speed in px/s this tick (for target prediction). */
  vel = 0;
  coinValue = 0;
  castleDamage = 0;
  hasteMult = 1;
  vulnTime = 0;
  poisonDps = 0;
  burnSrc: TowerInst | null = null;
  poisonSrc: TowerInst | null = null;
  freezeImmune = 0;
  stunImmune = 0;
  armorBonus = 0;
  armorBonusTime = 0;
  dotAcc = 0;
  dotEventTimer = 0;
  spreadTimer = 0;
  abilityTimer = 0;
  // boss
  readonly bossTimers = new Float64Array(8);
  busyTime = 0;
  busyAb: BossAbility | null = null;
  busyTx = 0;
  busyTy = 0;
  busySlot = -1;
  chargeTime = 0;
  chargeMult = 1;
  spawnMilestone = 0;
  bossLoop = 0;
  /** Escort/summoned/split-spawned: true for enemies that did not come from the wave plan. */
  summoned = false;
}

export class Projectile implements ProjectileState {
  active = false;
  id = 0;
  kind: ProjectileKind = 'arrow';
  towerType: TowerId | null = null;
  x = 0;
  y = 0;
  angle = 0;
  arcT = 0;
  arcHeight = 0;
  // internal
  /** 0 = homing, 1 = straight (pierce), 2 = lobbed (ground target, explodes on landing). */
  mode = 0;
  tower: TowerInst | null = null;
  speed = 0;
  vx = 0;
  vy = 0;
  targetIdx = -1;
  targetId = 0;
  dmg = 0;
  crit = false;
  splash = 0;
  pierceLeft = 0;
  readonly hitIds = new Int32Array(10);
  hitCount = 0;
  sx = 0;
  sy = 0;
  tx = 0;
  ty = 0;
  t = 0;
  flight = 1;
  life = 0;
  /** Proc projectiles (shards, bomblets, meteors) deal plain damage and never trigger procs. */
  isProc = false;
  secondary = false;
  groundOnly = false;
  element: 'fire' | 'frost' | 'poison' | 'arcane' | 'physical' | 'lightning' = 'physical';
  armorPen = 0;
}

export class FireZone implements FireZoneState {
  active = false;
  id = 0;
  x = 0;
  y = 0;
  radius = 50;
  timeLeft = 0;
  dps = 0;
  tick = 0;
  tower: TowerInst | null = null;
}

export class DeathRec {
  x = 0;
  y = 0;
  depth = 0;
  isBoss = false;
  burning = false;
  burnDps = 0;
  burnSrc: TowerInst | null = null;
  poisonStacks = 0;
  poisonDps = 0;
  poisonTime = 0;
  poisonSrc: TowerInst | null = null;
  splitEnemy: EnemyId | null = null;
  splitCount = 0;
  progress = 0;
  flying = false;
  hpMult = 1;
}

export interface SlotRec extends SlotState {
  tower: TowerInst | null;
}

/** A queued enemy spawn of the current wave plan. */
export interface PlanEntry {
  time: number;
  kind: EnemyId | BossId;
  elite: boolean;
}

export interface WavePlan {
  entries: PlanEntry[];
  isBoss: boolean;
  hpMult: number;
  speedMult: number;
  coinMult: number;
  next: number;
  elapsed: number;
}

export interface Content {
  upgrades: UpgradeDef[];
  synergies: SynergyDef[];
  events: RandomEventDef[];
}

export class SimState {
  // construction inputs
  readonly opts: RunOptions;
  readonly content: Content;
  readonly rngC: Rng;
  readonly rngW: Rng;
  readonly rngM: Rng;

  // run state
  time = 0;
  phase: RunPhase = 'prewave';
  wave = 1;
  prewaveTime = BALANCE.waves.firstPrewave;
  coins = 0;
  coinFrac = 0;
  castleHp = 0;
  castleMaxHp = 0;
  alive = 0;
  nextEnemyId = 1;
  nextProjId = 1;
  nextZoneId = 1;
  nextTowerUid = 1;
  buyCount = 0;
  unlockCount = 0;
  revived = false;
  freeRerolls = 0;
  paidRerollUsed = false;
  flawless = true;
  nextWaveMod: WaveModifier | null = null;
  activeWaveMod: WaveModifier | null = null;
  plan: WavePlan | null = null;
  upgradeChoices: UpgradeDef[] = [];
  pendingEvent: PendingEvent | null = null;
  activeSynergies: string[] = [];
  readonly taken = new Map<string, number>();
  readonly eventEffects: Effect[] = [];
  readonly metaEffects: Effect[] = [];

  // entities
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly zones: FireZone[] = [];
  readonly slots: SlotRec[] = [];
  readonly abilities: AbilityState[] = [];
  readonly grid: SpatialGrid<Enemy>;
  readonly deaths: DeathRec[] = [];
  deathHead = 0;
  deathTail = 0;
  /** Current kill-cascade depth (see combat.killEnemy). */
  depth = 0;
  /** Scratch index buffers for spatial queries, borrowed in a stack discipline (no allocation per query). */
  private readonly bufs: Int32Array[] = Array.from({ length: 12 }, () => new Int32Array(BALANCE.caps.maxEnemies + 16));
  private bufTop = 0;
  bossGems = 0;
  regenAcc = 0;
  // cached aggregated globals (set by refresh)
  coinGainMult = 1;
  bossDamageMult = 1;
  abilityPowerMult = 1;
  abilityCdMult = 1;
  towerCostMult = 1;

  // temporary buffs (seconds)
  frenzyTime = 0;
  mergeFrenzyTime = 0;
  doubleDamage = false;
  pendingDoubleDamage = false;
  pendingFreezeStart = false;
  freezeStartLeft = 0;
  tempTowerUid = 0;
  tempTowerRelock = -1;
  meteorKillCd = 0;
  /** Per-substep counters for caps. */
  damageEvents = 0;
  hitEvents = 0;
  procBudget = 0;
  /** Set when board/upgrades/buffs changed: stats are recomputed at the next tick (or immediately by API calls). */
  dirty = true;

  // modifiers
  readonly typeMods: ModSet[] = [];
  /** [typeIndex][level]: baseEffects + cumulative perks. */
  readonly ownMods: ModSet[][] = [];
  readonly gm = new GlobalMods();
  buffFireRatePct = 0;
  buffDamageMul = 1;

  // output
  events: SimEvent[] = [];
  readonly stats: RunStats;

  constructor(opts: RunOptions, content: Content) {
    this.opts = opts;
    this.content = content;
    this.rngC = new Rng(opts.seed ^ 0x1234abcd);
    this.rngW = new Rng(opts.seed ^ 0x7f4a7c15);
    this.rngM = new Rng(opts.seed ^ 0x2545f491);
    for (let i = 0; i < BALANCE.caps.maxEnemies; i++) {
      const e = new Enemy();
      this.enemies.push(e);
    }
    for (let i = 0; i < BALANCE.caps.maxProjectiles; i++) this.projectiles.push(new Projectile());
    for (let i = 0; i < BALANCE.caps.maxFireZones; i++) this.zones.push(new FireZone());
    for (let i = 0; i < BALANCE.caps.maxDeaths; i++) this.deaths.push(new DeathRec());
    this.grid = new SpatialGrid<Enemy>(this.enemies);
    for (let i = 0; i < TOWER_IDS.length; i++) this.typeMods.push(new ModSet());
    this.stats = {
      wave: 1, wavesCleared: 0, enemiesKilled: 0, bossesKilled: [], towersMerged: 0, towersBought: 0,
      highestTowerLevel: 0, coinsEarned: 0, gemsEarned: 0, chainLightnings: 0, meteorsCalled: 0,
      abilitiesUsed: 0, flawlessWaves: 0, synergiesActivated: [], legendariesPicked: 0, upgradesTaken: [],
      towerKills: {}, towerDamage: {}, timeSeconds: 0,
    };
  }

  borrow(): Int32Array {
    return this.bufs[this.bufTop++];
  }

  release(): void {
    this.bufTop--;
  }

  /** Queues an event; cosmetic events are dropped when nobody drains the queue. */
  emit(ev: SimEvent): void {
    if (this.events.length > BALANCE.caps.maxQueuedEvents) {
      switch (ev.type) {
        case 'shot': case 'beam': case 'chain': case 'cone': case 'hit': case 'damage': case 'explosion':
        case 'status': case 'coins': case 'enemySpawned': case 'enemyHealed':
          return;
        default:
      }
    }
    this.events.push(ev);
  }

  /** Adds (or removes, if negative) coins; fractional gains are carried so rounding never loses coins. Only gains emit 'coins' events. */
  addCoins(amount: number, x?: number, y?: number, earned = true): number {
    if (amount === 0) return 0;
    this.coinFrac += amount;
    const whole = Math.trunc(this.coinFrac);
    this.coinFrac -= whole;
    if (whole === 0) return 0;
    this.coins += whole;
    if (whole > 0) {
      if (earned) this.stats.coinsEarned += whole;
      this.emit({ type: 'coins', amount: whole, total: this.coins, x, y });
    }
    return whole;
  }
}
