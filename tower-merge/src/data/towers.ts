import type { Effect, TowerDef, TowerId, TowerLevelDef } from './types';

const flag = (f: Extract<Effect, { kind: 'flag' }>['flag'], value: number): Effect => ({ kind: 'flag', flag: f, value });
const stat = (
  s: Extract<Effect, { kind: 'stat' }>['stat'], op: 'flat' | 'pct' | 'mul', value: number,
): Effect => ({ kind: 'stat', stat: s, op, value });

/** Level 1 has no perk; levels 2..5 name their perk and list the effects (cumulative per instance). */
const L1 = (): TowerLevelDef => ({ damageMult: 1, fireRateMult: 1, rangeBonus: 0, perks: [] });
const lv = (
  damageMult: number, fireRateMult: number, rangeBonus: number,
  perkName: string, perkDesc: string, perks: Effect[],
): TowerLevelDef => ({ damageMult, fireRateMult, rangeBonus, perkName, perkDesc, perks });

/**
 * The eight towers. Level multipliers are tuned so a level 2 tower (perk included) deals about
 * 2.3-2.5x a level 1 tower's single-target DPS (it frees a slot), and higher levels keep adding
 * ~2x DPS per level through multipliers plus the listed perks. See tests/sim/balance.test.ts.
 */
export const TOWERS: Record<TowerId, TowerDef> = {
  arrow: {
    id: 'arrow', name: 'Arrow Tower', role: 'Fast single-target shots. Cheap and reliable.',
    attack: 'projectile', damage: 11, fireRate: 1.6, range: 200, splashRadius: 0, projectileSpeed: 720,
    critChance: 0.05, critMult: 2, statusPower: 1, statusDuration: 1.5, chainCount: 0, chainRange: 0, armorPen: 0,
    hitsAir: true, baseEffects: [], color: 0xd9a441, unlock: { kind: 'start' }, buyWeight: 30,
    levels: [
      L1(),
      lv(1.1, 1.1, 8, 'Double Arrows', 'Fires 1 extra arrow at the same target with every shot.', [flag('extraProjectiles', 1)]),
      lv(2.1, 1.25, 16, 'Piercing Arrows', 'Arrows pass through up to 2 extra enemies.', [flag('pierce', 2)]),
      lv(3.3, 1.4, 24, 'Critical Hits', '+25% critical hit chance (crits deal 2x damage).', [stat('critChance', 'flat', 0.25)]),
      lv(4.9, 1.6, 32, 'Multishot', 'Also shoots 1 extra target in range with every attack.', [flag('multishot', 1)]),
    ],
  },
  cannon: {
    id: 'cannon', name: 'Cannon', role: 'Slow lobbed shells that explode on the ground. Cannot hit flyers.',
    attack: 'lobbed', damage: 34, fireRate: 0.55, range: 230, splashRadius: 62, projectileSpeed: 380,
    critChance: 0, critMult: 2, statusPower: 1, statusDuration: 3, chainCount: 0, chainRange: 0, armorPen: 0,
    hitsAir: false, baseEffects: [], color: 0x8a8f98, unlock: { kind: 'start' }, buyWeight: 22,
    levels: [
      L1(),
      lv(2.15, 1.12, 8, 'Larger Explosions', '+25% explosion radius.', [stat('splashRadius', 'pct', 0.25)]),
      lv(4.1, 1.3, 16, 'Cluster Bombs', 'Each explosion scatters 3 bomblets (35% damage, half radius).', [flag('clusterBombs', 3)]),
      lv(7.6, 1.45, 24, 'Armor Penetration', 'Ignores 35% of enemy armor.', [stat('armorPen', 'flat', 0.35)]),
      lv(11.5, 1.6, 32, 'Burning Shells', 'Hits set enemies on fire for 25% of hit damage per second for 3 s.', [flag('burnOnHit', 0.25)]),
    ],
  },
  frost: {
    id: 'frost', name: 'Frost Tower', role: 'Slows enemies so every other tower gets more time on target.',
    attack: 'projectile', damage: 6, fireRate: 1.1, range: 180, splashRadius: 0, projectileSpeed: 520,
    critChance: 0, critMult: 2, statusPower: 1, statusDuration: 1.5, chainCount: 0, chainRange: 0, armorPen: 0,
    hitsAir: true, baseEffects: [flag('slowOnHit', 0.3)], color: 0x6fd3ff, unlock: { kind: 'start' }, buyWeight: 20,
    levels: [
      L1(),
      lv(2.05, 1.17, 8, 'Increased Slow', 'Slow strength +35% (30% becomes 40.5%).', [stat('statusPower', 'pct', 0.35)]),
      lv(3.7, 1.3, 16, 'Freeze Chance', 'Hits have a 12% chance to freeze for 1.2 s.', [flag('freezeChance', 0.12)]),
      lv(6.5, 1.45, 24, 'Frost Explosion', 'Freezing an enemy releases a 75 px nova: slows 40% for 2 s, 50% damage.', [flag('frostNova', 75)]),
      lv(9.8, 1.6, 32, 'Area Freeze', 'Hits splash in a 55 px radius, slowing and freezing everything inside.', [stat('splashRadius', 'flat', 55)]),
    ],
  },
  lightning: {
    id: 'lightning', name: 'Lightning Tower', role: 'Instant bolts that chain between enemies. Great against crowds.',
    attack: 'chain', damage: 13, fireRate: 1.0, range: 170, splashRadius: 0, projectileSpeed: 0,
    critChance: 0.05, critMult: 2, statusPower: 1, statusDuration: 1.5, chainCount: 2, chainRange: 110, armorPen: 0,
    hitsAir: true, baseEffects: [], color: 0xf6e05e, unlock: { kind: 'gems', cost: 150 }, buyWeight: 16,
    levels: [
      L1(),
      lv(2.1, 1.15, 8, 'Additional Chain Targets', 'Bolts jump to 2 more enemies (2 becomes 4).', [stat('chainCount', 'flat', 2)]),
      lv(4.1, 1.3, 16, 'Increased Chain Range', '+40% distance between chain jumps.', [stat('chainRange', 'pct', 0.4)]),
      lv(7.5, 1.45, 24, 'Stun Chance', 'Hits have a 20% chance to stun for 0.6 s.', [flag('stunChance', 0.2)]),
      lv(12.5, 1.6, 32, 'Critical Lightning', '+20% crit chance; crits fire 2 extra bolts at nearby enemies (60% damage).', [
        stat('critChance', 'flat', 0.2), flag('critLightning', 2),
      ]),
    ],
  },
  fire: {
    id: 'fire', name: 'Fire Tower', role: 'Short-range flamethrower: sprays a cone and leaves enemies burning.',
    attack: 'cone', damage: 4.5, fireRate: 3, range: 125, splashRadius: 0, projectileSpeed: 0,
    critChance: 0, critMult: 2, statusPower: 1, statusDuration: 3, chainCount: 0, chainRange: 0, armorPen: 0,
    hitsAir: true, baseEffects: [flag('burnOnHit', 1.6)], color: 0xff6a2b, unlock: { kind: 'gems', cost: 200 }, buyWeight: 14,
    levels: [
      L1(),
      lv(2.0, 1.1, 6, 'Stronger Burning', 'Burn strength +40%.', [stat('statusPower', 'pct', 0.4)]),
      lv(3.9, 1.25, 12, 'Fire Spread', 'Burning enemies spread their fire to the nearest enemy every second and on death.', [flag('fireSpread', 1)]),
      lv(7.8, 1.4, 18, 'Flame Explosions', 'Burning enemies explode on death (70 px) for 200% of their burn damage per second.', [flag('flameExplosionOnDeath', 70)]),
      lv(14.5, 1.6, 24, 'Persistent Fire Zones', 'Hits leave a burning patch (50 px, 2.5 s) that burns enemies for 60 damage per second.', [flag('fireZoneOnHit', 60)]),
    ],
  },
  poison: {
    id: 'poison', name: 'Poison Tower', role: 'Stacking poison that melts tough enemies over time.',
    attack: 'projectile', damage: 3, fireRate: 1.0, range: 190, splashRadius: 0, projectileSpeed: 480,
    critChance: 0, critMult: 2, statusPower: 5, statusDuration: 4, chainCount: 0, chainRange: 0, armorPen: 0,
    hitsAir: true, baseEffects: [flag('poisonOnHit', 1)], color: 0x7bd957, unlock: { kind: 'gems', cost: 250 }, buyWeight: 14,
    levels: [
      L1(),
      lv(1.5, 1.1, 8, 'Increased Duration', 'Poison lasts 50% longer (4 s becomes 6 s).', [stat('statusDuration', 'pct', 0.5)]),
      lv(2.9, 1.25, 16, 'Poison Spread', 'Poisoned enemies pass their stacks to up to 2 enemies within 90 px on death.', [flag('poisonSpreadOnDeath', 1)]),
      lv(5.7, 1.4, 24, 'Enemy Vulnerability', 'Hits make the target take +15% damage from all sources for 3 s.', [flag('vulnerabilityOnHit', 0.15)]),
      lv(9.6, 1.6, 32, 'Poison Explosions', 'Poisoned enemies explode on death (55 px) for 8 damage per stack.', [flag('poisonExplosionOnDeath', 55)]),
    ],
  },
  sniper: {
    id: 'sniper', name: 'Sniper Tower', role: 'Instant long-range shots at the toughest enemy. Huge damage, slow reload.',
    attack: 'beam', damage: 55, fireRate: 0.35, range: 560, splashRadius: 0, projectileSpeed: 0,
    critChance: 0.1, critMult: 2.5, statusPower: 1, statusDuration: 1.5, chainCount: 0, chainRange: 0, armorPen: 0.2,
    hitsAir: true, baseEffects: [], color: 0xc084fc, unlock: { kind: 'gems', cost: 350 }, buyWeight: 10,
    levels: [
      L1(),
      lv(2.1, 1.1, 20, 'Increased Crit Damage', 'Critical hits deal +0.75x more damage (2.5x becomes 3.25x).', [stat('critMult', 'flat', 0.75)]),
      lv(4.3, 1.2, 40, 'Execute', 'Non-boss enemies below 15% HP die instantly; bosses below 15% take +100% damage.', [flag('executeThreshold', 0.15)]),
      lv(8.5, 1.3, 60, 'Armor Piercing', 'Ignores 40% more enemy armor.', [stat('armorPen', 'flat', 0.4)]),
      lv(12.5, 1.4, 80, 'Faster Targeting', '+35% attack speed.', [stat('fireRate', 'pct', 0.35)]),
    ],
  },
  magic: {
    id: 'magic', name: 'Magic Tower', role: 'Arcane orbs with unpredictable effects. Strong when upgraded.',
    attack: 'projectile', damage: 14, fireRate: 1.0, range: 200, splashRadius: 0, projectileSpeed: 450,
    critChance: 0.03, critMult: 2, statusPower: 1, statusDuration: 1.5, chainCount: 0, chainRange: 0, armorPen: 0,
    hitsAir: true, baseEffects: [], color: 0xe879f9, unlock: { kind: 'gems', cost: 500 }, buyWeight: 12,
    levels: [
      L1(),
      lv(2.1, 1.15, 8, 'Random Elements', 'Every hit applies a random effect: burn, slow, poison or stun.', [flag('randomElement', 1)]),
      lv(2.05, 1.3, 16, 'Multiple Projectiles', 'Fires 1 extra orb at the same target with every shot.', [flag('extraProjectiles', 1)]),
      lv(3.9, 1.45, 24, 'Area Damage', 'Orbs explode on impact: +45 px splash radius (60% damage to others).', [stat('splashRadius', 'flat', 45)]),
      lv(7.2, 1.6, 32, 'Arcane Explosions', 'Every hit also explodes in a 70 px radius for 40% damage.', [flag('explosionOnHit', 70)]),
    ],
  },
};
