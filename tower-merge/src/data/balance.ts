/**
 * Every tunable number of the simulation lives here. Edit values, run `npm run sim` / the bot tests
 * and look at wave reached and run length. Targets (greedy bot, no meta bonuses): death around
 * waves 9-14, runs of about 3-6 simulated minutes; the 'noUpgrades' policy dies noticeably earlier.
 * Last measured (24 seeds, default RunOptions, real upgrade/synergy/event data): greedy avg wave 11.0
 * (8-15) in 334 s, noUpgrades 9.9 in 289 s, random 10.6, mergeHeavy 9.5, spreadOut 6.5.
 */
export const BALANCE = {
  castle: {
    hp: 100,
  },

  economy: {
    startCoins: 120,
    /** Buy price = round(baseCost * growth^(towers bought so far) * towerCost stat). */
    buyBaseCost: 36,
    buyGrowth: 1.075,
    buyMinCost: 10,
    /** Price of the n-th purchased slot unlock = round(base * growth^n). */
    slotUnlockBase: 110,
    slotUnlockGrowth: 1.5,
    /** Fraction of the coins invested in a tower that selling returns. */
    sellRefund: 0.6,
    /** Coins a tower granted for free (reward/upgrade) is "worth" when sold: baseCost * 2^(level-1) * this. */
    grantedTowerValue: 0.5,
    /** Coins given instead when a granted tower finds no free slot. */
    grantFallbackCoinsPerLevel: 40,
  },

  waves: {
    firstPrewave: 1.5,
    prewave: 3,
    /** Threat budget of wave n = budgetBase + budgetPerWave * (n - 1) ^ budgetExp. */
    budgetBase: 8,
    budgetPerWave: 4.2,
    budgetExp: 1.12,
    /** Enemy hp multiplier at wave n = hpScale * hpGrowth ^ (n - 1) * (1 + hpLinear * (n - 1)). */
    hpScale: 3,
    hpGrowth: 1.22,
    hpLinear: 0.02,
    /** Extra hp growth per wave beyond hpLateStart: the wall that ends most runs. */
    hpLateStart: 7,
    hpLateGrowth: 1,
    /** Castle damage of regular enemies grows by this fraction per wave. */
    castleDamagePerWave: 0.1,
    /** Enemy speed multiplier = min(speedCap, 1 + speedPerWave * (n - 1)). */
    speedPerWave: 0.04,
    speedCap: 1.8,
    /** Spawning window in seconds = min(spawnMax, spawnBase + spawnPerWave * (n - 1)). */
    spawnBase: 5,
    spawnPerWave: 0.3,
    spawnMax: 8.5,
    /** Hard limit on enemies spawned by the generator in one regular wave. */
    maxEnemiesPerWave: 70,
    /** A boss wave's escorts use this fraction of the normal budget. */
    escortBudgetFraction: 0.45,
    bossSpawnDelay: 0.6,
    bossEveryNWaves: 5,
    /** Chance a regular enemy is elite without an event: starts at fromWave, grows per wave. */
    naturalElite: { fromWave: 8, base: 0.03, perWave: 0.006, max: 0.2 },
    /** Seconds from a wave's first spawn when 'freezeStart' emergency power freezes new enemies. */
    freezeStartWindow: 3,
    eliteHpMult: 2.5,
    eliteCoinMult: 2,
    /** A wave newly introduces its enemy type with at least this many of them. */
    introCount: 2,
  },

  boss: {
    /** Each loop through Goblin King -> Stone Golem -> Dragon multiplies these. */
    loopHpMult: 2.6,
    loopCoinMult: 1.6,
    loopDamageMult: 1.25,
    loopGemMult: 1.3,
    /** Boss hp is multiplied by (regular enemy hp multiplier of the wave) ^ hpWaveExp, so bosses keep pace with the waves. */
    hpWaveExp: 0.5,
    /** How far a revive pushes a boss back, px. */
    reviveKnockback: 420,
    freezeSeconds: 0.3,
    freezeImmunity: 3,
    stunSeconds: 0.3,
    stunImmunity: 1.5,
  },

  coins: {
    /** Kill coins = def.coins * (1 + killScalePerWave * (n - 1)) * coinMult * coinGain. */
    killScalePerWave: 0.075,
    waveClearBase: 14,
    waveClearPerWave: 3.5,
    /** Extra fraction of the clear bonus for a wave where the castle took no damage. */
    flawlessBonusFraction: 0.5,
  },

  /** Rarity weights by wave band (first band whose maxWave >= cleared wave). */
  rarity: [
    { maxWave: 4, weights: { common: 74, rare: 22, epic: 4, legendary: 0 } },
    { maxWave: 9, weights: { common: 56, rare: 30, epic: 12, legendary: 2 } },
    { maxWave: 14, weights: { common: 40, rare: 34, epic: 20, legendary: 6 } },
    { maxWave: 9999, weights: { common: 30, rare: 34, epic: 26, legendary: 10 } },
  ] as { maxWave: number; weights: Record<'common' | 'rare' | 'epic' | 'legendary', number> }[],

  upgrades: {
    choices: 3,
    /** Used only when fewer than `choices` real upgrades are available. */
    fallbackCoins: [70, 120, 180],
    fallbackHeal: 0.3,
  },

  events: {
    /** Chance of a random event after an upgrade pick, once wave >= minWave (also per-event minWave). */
    chance: 0.4,
    minWave: 2,
    chestChoices: 3,
  },

  gems: {
    perWave: 2.2,
    /** Extra per wave beyond this many cleared waves. */
    lateWave: 12,
    perLateWave: 2,
  },

  abilities: {
    meteor: { cooldown: 38, radius: 105, damageBase: 140, damagePerWave: 32, flightTime: 0.55 },
    freeze: { cooldown: 55, duration: 3, bossDuration: 1 },
    repair: { cooldown: 60, healFraction: 0.25 },
    frenzy: { cooldown: 50, duration: 6, fireRatePct: 1 },
    /** Fraction of the cooldown already elapsed at run start (so abilities are not instantly ready). */
    startCooldownFraction: 0.5,
  },

  /** Temporary rewards. */
  emergency: {
    doubleDamageMult: 2,
    legendaryLevel: 5,
  },

  revive: {
    hpFraction: 0.5,
    clearRadius: 260,
  },

  combat: {
    /** Splash hits on non-primary enemies from projectile splash (frost area freeze, magic area). */
    splashSecondaryMult: 0.6,
    /** Lobbed explosions: damage multiplier at the very edge (1 at centre). */
    lobbedEdgeMult: 0.7,
    /** Jump decay of normal chains; infiniteChain uses chainDecayInfinite until damage < chainMinFraction. */
    chainDecay: 0.08,
    chainDecayInfinite: 0.15,
    chainMinFraction: 0.05,
    shardDamage: 0.3,
    shardSpeed: 620,
    shardCount: 6,
    shardRange: 170,
    bombletDamage: 0.35,
    bombletRadiusFraction: 0.5,
    bombletScatter: 80,
    nthExplosionRadius: 60,
    nthExplosionDamage: 1.5,
    explosionOnHitDamage: 0.4,
    procChainJumps: 3,
    /** Jump range of chain lightning that comes from procs (tower chains use their own chainRange). */
    procChainRange: 120,
    procChainDamage: 0.5,
    critLightningDamage: 0.6,
    critLightningRange: 170,
    fireZoneRadius: 50,
    fireZoneDuration: 2.5,
    fireZoneTick: 0.25,
    frostNovaSlow: 0.4,
    frostNovaDuration: 2,
    frostNovaDamage: 0.5,
    flameExplosionBurnSeconds: 4,
    flameExplosionFraction: 0.5,
    poisonExplosionPerStack: 8,
    poisonSpreadTargets: 2,
    poisonSpreadRadius: 90,
    burnSpreadPoisonRadius: 80,
    fireSpreadInterval: 1,
    fireSpreadRange: 100,
    meteorOnKillRadius: 90,
    meteorOnKillBase: 150,
    meteorOnKillPerWave: 25,
    meteorOnKillCooldown: 0.5,
    slowDuration: 1.5,
    maxSlow: 0.7,
    freezeDuration: 1.2,
    stunDuration: 0.6,
    burnDuration: 3,
    poisonDpsPerStack: 7,
    poisonDuration: 4,
    maxPoisonStacks: 12,
    vulnerabilityDuration: 3,
    maxVulnerability: 0.5,
    elementalSecondaryEvery: 3,
    /** Opposite-element hits of elementalSecondary: slow strength/seconds (fire tower), burn fraction (frost tower), poison stacks (lightning tower). */
    secondarySlow: 0.4,
    secondarySlowSeconds: 2,
    secondaryBurnFraction: 0.5,
    secondaryPoisonStacks: 2,
    secondaryChainJumps: 2,
    randomElementBurnFraction: 0.8,
    randomElementSlow: 0.3,
    randomElementStun: 0.5,
    arcaneBurstRadius: 60,
    arcaneBurstDamage: 0.6,
    pierceSearchWidth: 16,
    homingRetargetRange: 140,
    /** Fire tower cone: half angle in radians (50 degree cone). */
    coneHalfAngle: (25 * Math.PI) / 180,
    /** Lobbed shell flight: minimum seconds and arc height as a fraction of distance. */
    lobbedMinFlight: 0.35,
    lobbedArcFraction: 0.35,
    lobbedMaxArc: 120,
    /** Chance of trying a new target each tick when no enemy is in range (seconds between scans). */
    idleScan: 0.05,
    /** Armor never exceeds this after temporary bonuses. */
    maxArmor: 0.9,
    /** Death-cascade depth: on-death effects of kills this deep are skipped. */
    maxDeathDepth: 3,
    /** Sideways offset range of enemies on their lane, px. */
    lateralOffset: 14,
    /** Seconds towers scorched by a Dragon fire breath stay disabled, and the margin around the beam that still counts. */
    scorchSeconds: 2,
    fireLineSlotMargin: 34,
    thornsRadius: 110,
    thornsSplash: 0.5,
    mergeFrenzyFireRatePct: 0.5,
    frontShieldHalfAngle: Math.PI / 2,
    /** Shaman heals at most this many allies per pulse (event spam guard). */
    healTargetsMax: 24,
    sniperPrefersHighestHp: true,
  },

  caps: {
    maxEnemies: 160,
    maxProjectiles: 320,
    maxFireZones: 12,
    chainHardCap: 25,
    /** 'damage' events emitted per simulation substep (protects the renderer). */
    damageEventsPerTick: 10,
    /** 'hit' events emitted per substep. */
    hitEventsPerTick: 24,
    /** Procs (explosions, chains, shards, bomblets, zones...) allowed per substep. */
    procsPerTick: 80,
    /** Queued events kept when nobody drains them (cosmetic ones are dropped beyond this). */
    maxQueuedEvents: 6000,
    maxDeaths: 512,
  },
};

export type Balance = typeof BALANCE;

/** Gems earned by a run so far: waves cleared (with a late-game bonus) plus boss gems. */
export function gemsFor(wavesCleared: number, bossGems: number): number {
  const g = BALANCE.gems;
  const late = Math.max(0, wavesCleared - g.lateWave);
  return Math.floor(wavesCleared * g.perWave + late * g.perLateWave + bossGems);
}
