// Every tunable number of Tiny Dungeon's rules lives here. Gameplay code, the headless simulation
// (tools/simulate.ts) and the tests all read this one object. Rewarded-ad / platform settings live in
// src/rewards/config.ts, not here.
import type { BossAttackId, Element, Rarity, StatEffect, Stats } from '../core/types';

/** Starting stat sheet of every hero (HeroDef.base overrides single keys). */
const baseStats: Stats = {
  // Survival
  maxHp: 100,
  armor: 0,
  regen: 0,
  dodge: 0,
  lifeOnKill: 0,
  phoenixCharges: 0,
  invulnTime: 0.5,
  // Movement & pickup (world is 720 px wide)
  moveSpeed: 190,
  pickupRadius: 70,
  // Generic offense
  damageMult: 1,
  attackSpeedMult: 1,
  critChance: 0.05,
  critDamage: 1.5,
  extraProjectiles: 0,
  pierce: 0,
  rangeMult: 1,
  areaMult: 1,
  knockbackMult: 1,
  multiStrike: 0,
  projectileSpeedMult: 1,
  // Weapon-specific. swordArc / bowArrows / staffBounces are weapon baselines, not bonuses.
  swordDamage: 0,
  swordArc: 110,
  bowDamage: 0,
  bowArrows: 1,
  staffDamage: 0,
  staffBounces: 1,
  // Elements. chainDamage / explosionDamage / explosionRadius / orbitDamage are per-use strengths that
  // only matter once the matching ability exists (chainCount, explodeChance, orbitBlades > 0).
  elementPower: 1,
  burnChance: 0,
  burnDps: 0,
  burnMaxStacks: 3,
  slowChance: 0,
  slowAmount: 0,
  freezeChance: 0,
  chainChance: 0,
  chainCount: 0,
  chainDamage: 0.5,
  chainCanCrit: 0,
  poisonChance: 0,
  poisonDps: 0,
  poisonSpread: 0,
  // On-kill / periodic
  explodeChance: 0,
  explosionDamage: 1,
  explosionRadius: 80,
  explosionPoison: 0,
  orbitBlades: 0,
  orbitDamage: 0.4,
  orbitFreeze: 0,
  thunderLevel: 0,
  thunderInterval: 4,
  meteorLevel: 0,
  meteorInterval: 7,
  soulHarvest: 0,
  chaosLevel: 0,
  burnExplode: 0,
  frostShatter: 0,
  // Economy
  goldMult: 1,
  xpMult: 1,
  luck: 0,
};

/** Per boss attack: damage PER HIT as a multiple of the boss's scaled damage, optional adds it spawns. */
export interface BossAttackTuning {
  damage: number;                              // 0 = no direct damage (pure summon)
  windup: number;                              // telegraph seconds
  summon?: { enemy: string; count: number };   // adds spawned (scaled like normal enemies)
  hitsPerUse: number;                          // separate hits one use can land (bursts, rings, meteors)
}

export const BALANCE = {
  baseStats,

  /**
   * Hard limits applied after all bonuses. Stats not listed have min 0 and no max.
   * Flags are capped at 1 (any value >= 1 means "on").
   */
  caps: {
    max: {
      maxHp: 3000,
      armor: 14,
      regen: 25,
      dodge: 0.5,
      lifeOnKill: 12,
      phoenixCharges: 3,
      invulnTime: 2,
      moveSpeed: 400,
      pickupRadius: 500,
      damageMult: 20,
      attackSpeedMult: 4,
      critChance: 0.75,
      critDamage: 6,
      extraProjectiles: 6,
      pierce: 5,
      rangeMult: 2.5,
      areaMult: 3,
      knockbackMult: 4,
      multiStrike: 3,
      projectileSpeedMult: 3,
      swordArc: 360,
      bowArrows: 4,
      staffBounces: 6,
      elementPower: 5,
      burnChance: 1,
      burnDps: 3,
      burnMaxStacks: 10,
      slowChance: 1,
      slowAmount: 0.7,
      freezeChance: 0.5,
      chainChance: 1,
      chainCount: 6,
      chainDamage: 1.5,
      chainCanCrit: 1,
      poisonChance: 1,
      poisonDps: 3,
      poisonSpread: 1,
      explodeChance: 0.75,
      explosionDamage: 4,
      explosionRadius: 220,
      explosionPoison: 1,
      orbitBlades: 8,
      orbitDamage: 2,
      orbitFreeze: 1,
      thunderLevel: 8,
      meteorLevel: 8,
      soulHarvest: 0.02,
      chaosLevel: 0.6,
      burnExplode: 1,
      frostShatter: 1,
      goldMult: 10,
      xpMult: 10,
      luck: 2,
    } as Partial<Stats>,
    min: {
      maxHp: 1,
      invulnTime: 0.15,
      moveSpeed: 80,
      damageMult: 0.1,
      attackSpeedMult: 0.25,
      critDamage: 1,
      rangeMult: 0.3,
      areaMult: 0.3,
      projectileSpeedMult: 0.3,
      burnMaxStacks: 1,
      thunderInterval: 1.2,
      meteorInterval: 2.5,
    } as Partial<Stats>,
  },

  /** Every hit that lands does at least this much (armor can never fully negate damage). */
  minDamageTaken: 1,

  // ---- Upgrade offers -------------------------------------------------------------------------
  rarity: {
    weights: { common: 60, rare: 28, epic: 10, legendary: 2 } as Record<Rarity, number>,
    /** weight *= exp(luck * luckExponent[rarity]): luck shifts offers toward rarer cards. */
    luckExponent: { common: 0, rare: 0.5, epic: 1.2, legendary: 2 } as Record<Rarity, number>,
    /** First room a rarity may be offered (keeps the opening humble). */
    minRoom: { common: 1, rare: 2, epic: 4, legendary: 7 } as Record<Rarity, number>,
  },
  /** Cards sharing a tag with the hero's favoured tags are this much more likely. */
  heroTagWeight: 1.6,
  /** Cards that advance a synergy the run is building are this much more likely. */
  synergyWeight: 1.4,
  choices: {
    count: 3,
    /** Chance (while hurt) that the last card slot becomes a Healing Potion. */
    potionLowHpThreshold: 0.4,
    potionLowHpChance: 0.3,
  },
  rerollsPerRun: 0,

  // ---- Progression within a run ---------------------------------------------------------------
  /** xpToNext(level) = base + linear*(level-1) + quadratic*(level-1)^2 */
  xp: { base: 24, linear: 12, quadratic: 1.5 },
  /** Applied once per level gained (and then scaled by levelBonuses in recomputeStats). */
  levelUpEffects: [
    { stat: 'damageMult', pct: 0.03 },
    { stat: 'maxHp', add: 4 },
  ] as StatEffect[],
  levelUpHealFraction: 0.1,
  /** Soul Harvest can add at most this much damage (fraction) in total. */
  soulHarvestMaxBonus: 1.0,

  // ---- Rooms ----------------------------------------------------------------------------------
  rooms: {
    bossEvery: 5,
    /** Seconds over which a combat room's waves spawn. */
    spawnDuration: 15,
    waveCountMin: 5,
    waveCountMax: 7,
    /** Largest single group of one enemy type in a wave. */
    maxGroupSize: 5,
    /** Past this many planned enemies only costly ones (cost >= 3) are added; elites are exempt. */
    enemyCountSoftCap: 40,
    /** Absolute ceiling of planned non-elite enemies per room (kept below limits.maxEnemiesAlive). */
    enemyCountHardCap: 50,
    /** Fraction of max HP restored when a room is cleared. */
    clearHealFraction: 0.1,
    /** Door generation. */
    minSpecialRoom: 3,
    secondDoorChance: 0.6,
    singleDoorSpecialChance: 0.12,
    specialWeights: { elite: 40, treasure: 30, shrine: 30 } as Record<'elite' | 'treasure' | 'shrine', number>,
    /** Elite / treasure room rewards. */
    eliteRoomGoldMult: 1.6,
    eliteRoomMinRarity: 'rare' as Rarity,
    treasureGoldBase: 10,
    treasureGoldPerRoom: 2,
    treasureMinRarity: 'rare' as Rarity,
    /** Wall-clock seconds a typical room lasts (used by the simulation for run duration). */
    uiSecondsPerRoom: 6,
  },

  // ---- Difficulty scaling ---------------------------------------------------------------------
  difficulty: {
    /**
     * Smooth scaling per room i' = i - 1: hp = (1 + hpLinear*i') * hpGrowth^i', same for damage. The
     * exponential tail is what finally stops any capped build (endless mode needs a soft wall).
     */
    hpLinear: 0.16,
    hpGrowth: 1.05,
    dmgLinear: 0.07,
    dmgGrowth: 1.045,
    goldLinear: 0.04,
    /** Spawn budget: budgetBase + budgetLinear*(i-1) (+ budgetQuad*(i-1)^2). Enemy costs are in EnemyDef.cost. */
    budgetBase: 14,
    budgetLinear: 3.0,
    budgetQuad: 0.02,
    /** Elite chance per spawned enemy: min(eliteMax, eliteBase + eliteLinear*(i-1)). */
    eliteBase: 0.02,
    eliteLinear: 0.006,
    eliteMax: 0.14,
    eliteCostMult: 3,
    eliteHpMult: 3,
    eliteDmgMult: 1.35,
    eliteRewardMult: 3,
    /** Extra boss HP per full 30-room cycle already completed (loops get harder than the curve alone). */
    bossLoopHp: 0.65,
    bossLoopDmg: 0.25,
    /** XP per kill grows like gold does. */
    xpLinear: 0.06,
  },
  bossCycle: 30,

  // ---- Economy --------------------------------------------------------------------------------
  economy: {
    /** Banked per cleared room on top of the gold collected (so a bad run still pays a little). */
    roomBonusGold: 2,
    /** Multiplier on every enemy's and boss's gold drop (before room scaling and goldMult). */
    enemyGoldScale: 0.4,
    /** Gold card (fallback when nothing else can be offered). */
    goldPouchBase: 12,
    goldPouchPerRoom: 4,
    potionHealFraction: 0.4,
  },

  // ---- Weapons & combat maths -----------------------------------------------------------------
  weapons: {
    /** Each weapon-specific upgrade level adds this much damage (weapon level = 1 + such levels). */
    levelDamageBonus: 0.06,
    /** Damage dealt by a Double Strike repeat, relative to the first hit. */
    multiStrikeDamage: 0.45,
    /** Weapons picked up later deal this fraction of their normal damage (the hero's own weapon is the main one). */
    extraWeaponDamage: 0.55,
    minCooldown: 0.12,
    swordBaseArc: 110,
    /** Pick up to this many weapons per run. */
    maxWeapons: 3,
  },
  combat: {
    /** Thunder / meteor / orbit / explosion strengths are multiples of the player's base hit. */
    thunderDamage: 1.3,
    thunderRadius: 60,
    meteorDamage: 1.4,
    meteorRadius: 95,
    /** Orbit blades revolve this far from the hero and touch each enemy at most every orbitTouchInterval s. */
    orbitRadius: 70,
    orbitTouchInterval: 0.45,
    orbitSpeed: 3.2,
    /** Chance bonus to crit against frozen enemies with Shatter. */
    shatterCritBonus: 0.5,
    shatterDamageBonus: 0.35,
    /** Knockback distance in px = weapon knockback * knockbackMult * (1 - enemy resist). */
    knockbackScale: 1,
  },
  status: {
    burnDuration: 3,
    poisonDuration: 4,
    slowDuration: 2,
    freezeDuration: 1,
    /** Spread poison on death reaches enemies within this radius (px). */
    poisonSpreadRadius: 110,
    /** Chaos Engine triggers a random element at this base strength. */
    chaosBurnDps: 0.3,
    chaosPoisonDps: 0.25,
    chaosChainCount: 2,
    chaosSlowAmount: 0.4,
    chaosElements: ['fire', 'frost', 'lightning', 'poison'] as Element[],
  },

  // ---- Boss attacks (shared by the game and the simulation) -----------------------------------
  bossAttacks: {
    slimeJump:       { damage: 1.3, windup: 0.9, hitsPerUse: 1 },
    slimeBurst:      { damage: 0.5, windup: 0.7, hitsPerUse: 3 },
    slimeSplit:      { damage: 0,   windup: 1.0, hitsPerUse: 0, summon: { enemy: 'slime', count: 4 } },
    kingSweep:       { damage: 1.2, windup: 0.8, hitsPerUse: 1 },
    kingSummon:      { damage: 0,   windup: 1.1, hitsPerUse: 0, summon: { enemy: 'skeleton', count: 3 } },
    kingCharge:      { damage: 1.5, windup: 0.9, hitsPerUse: 1 },
    dragonBreath:    { damage: 0.35, windup: 1.0, hitsPerUse: 4 },
    dragonTailSwipe: { damage: 1.3, windup: 0.7, hitsPerUse: 1 },
    dragonMeteors:   { damage: 0.45, windup: 1.2, hitsPerUse: 3 },
    dragonRing:      { damage: 0.4, windup: 1.0, hitsPerUse: 3 },
    spiderWeb:       { damage: 0.4, windup: 0.8, hitsPerUse: 3 },
    spiderEggs:      { damage: 0,   windup: 1.0, hitsPerUse: 0, summon: { enemy: 'spider_egg', count: 3 } },
    spiderPounce:    { damage: 1.3, windup: 0.75, hitsPerUse: 1 },
    spiderVenom:     { damage: 0.35, windup: 0.9, hitsPerUse: 4 },
    lichBlink:       { damage: 0.8, windup: 0.8, hitsPerUse: 1 },
    lichSpiral:      { damage: 0.35, windup: 0.8, hitsPerUse: 6 },
    lichNova:        { damage: 1.2, windup: 1.1, hitsPerUse: 1 },
    lichRaise:       { damage: 0,   windup: 1.1, hitsPerUse: 0, summon: { enemy: 'ghost', count: 3 } },
    mimicChomp:      { damage: 1.4, windup: 0.8, hitsPerUse: 1 },
    mimicCoins:      { damage: 0.35, windup: 0.8, hitsPerUse: 5 },
    mimicTongue:     { damage: 1.1, windup: 0.9, hitsPerUse: 1 },
    mimicDecoys:     { damage: 0,   windup: 1.0, hitsPerUse: 0, summon: { enemy: 'mimic', count: 2 } },
  } as Record<BossAttackId, BossAttackTuning>,

  // ---- Shrines (data.events) ------------------------------------------------------------------
  shrines: {
    bloodAltarHpFraction: 0.25,
    gamblersIdolGoldFraction: 0.5,
    gamblersIdolWinChance: 0.5,
    gamblersIdolMinGold: 15,
    cursedChestGoldBase: 30,
    cursedChestGoldPerRoom: 8,
    cursedChestHpBonus: 0.2,
    cursedChestRooms: 3,
    buffRooms: 3,
  },

  // ---- Hard anti-runaway guards (pools & per-frame budgets) -----------------------------------
  limits: {
    maxEnemiesAlive: 60,
    maxProjectiles: 150,
    maxParticles: 300,
    maxDamageNumbers: 40,
    maxPickups: 120,
    maxChainJumpsPerHit: 6,
    maxExplosionsPerFrame: 6,
    maxThunderStrikesPerPulse: 8,
    maxStatusAppliesPerFrame: 40,
  },
};

export type Balance = typeof BALANCE;
