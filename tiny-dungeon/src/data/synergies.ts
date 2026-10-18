import type { SynergyDef } from '../core/types';

// Active as soon as every upgrade in `requires` is owned (level >= 1). Effects are applied once.
export const SYNERGIES: SynergyDef[] = [
  { id: 'wildfire', name: 'Wildfire', desc: 'Burn stacks faster: +20% chance, +2 max stacks',
    requires: ['fire_weapon', 'double_strike'],
    effects: [{ stat: 'burnChance', add: 0.2 }, { stat: 'burnMaxStacks', add: 2 }] },
  { id: 'storm_crit', name: 'Storm Crit', desc: 'Chains can crit, +1 jump, +15% chance',
    requires: ['chain_lightning', 'lucky_strike'],
    effects: [{ stat: 'chainCanCrit', add: 1 }, { stat: 'chainCount', add: 1 }, { stat: 'chainChance', add: 0.15 }] },
  { id: 'plague_bomb', name: 'Plague Bomb', desc: 'Explosions poison, +20% blast radius',
    requires: ['explosive_death', 'toxic_plague'],
    effects: [{ stat: 'explosionPoison', add: 1 }, { stat: 'poisonSpread', add: 1 }, { stat: 'explosionRadius', pct: 0.2 }] },
  { id: 'frozen_fortress', name: 'Frozen Fortress', desc: 'Blades freeze enemies, +1 blade, +10% slow',
    requires: ['blade_orbit', 'frost_touch'], evolution: true,
    effects: [{ stat: 'orbitFreeze', add: 1 }, { stat: 'orbitBlades', add: 1 }, { stat: 'slowAmount', add: 0.1 }] },
  { id: 'inferno_burst', name: 'Inferno Burst', desc: 'Burning enemies always explode, +20% blast damage',
    requires: ['fire_weapon', 'explosive_death'],
    effects: [{ stat: 'burnExplode', add: 1 }, { stat: 'explosionDamage', pct: 0.2 }] },
  { id: 'shatter', name: 'Shatter', desc: 'Frozen enemies take +50% crit chance and +35% damage; +10% freeze',
    requires: ['frost_touch', 'keen_edge'],
    effects: [{ stat: 'frostShatter', add: 1 }, { stat: 'freezeChance', add: 0.1 }] },
  { id: 'tempest', name: 'Tempest', desc: '+2 lightning strikes, faster storms, +1 chain jump',
    requires: ['thunderstorm', 'chain_lightning'], evolution: true,
    effects: [{ stat: 'thunderLevel', add: 2 }, { stat: 'thunderInterval', add: -0.6 }, { stat: 'chainCount', add: 1 }] },
  { id: 'bloodlust', name: 'Bloodlust', desc: '+1 HP per kill, +10% attack speed',
    requires: ['vampire_fang', 'double_strike'],
    effects: [{ stat: 'lifeOnKill', add: 1 }, { stat: 'attackSpeedMult', pct: 0.1 }] },
  { id: 'arrow_storm', name: 'Arrow Storm', desc: '+1 projectile, +1 pierce',
    requires: ['multishot', 'piercing_shots'],
    effects: [{ stat: 'extraProjectiles', add: 1 }, { stat: 'pierce', add: 1 }] },
  { id: 'armageddon', name: 'Armageddon', desc: '+2 meteors, faster showers, +20% element power',
    requires: ['meteor_storm', 'fire_weapon'], evolution: true,
    effects: [{ stat: 'meteorLevel', add: 2 }, { stat: 'meteorInterval', add: -1 }, { stat: 'elementPower', pct: 0.2 }] },
  { id: 'soul_reaper', name: 'Soul Reaper', desc: '+1 HP per kill, souls give +0.1% more damage',
    requires: ['soul_harvest', 'vampire_fang'],
    effects: [{ stat: 'lifeOnKill', add: 1 }, { stat: 'soulHarvest', add: 0.001 }] },
  { id: 'chaos_theory', name: 'Chaos Theory', desc: '+15% chaos chance, +5% crit chance',
    requires: ['chaos_engine', 'lucky_strike'],
    effects: [{ stat: 'chaosLevel', add: 0.15 }, { stat: 'critChance', add: 0.05 }] },
  { id: 'iron_wall', name: 'Iron Wall', desc: '+2 armor, +10% max HP',
    requires: ['thick_armor', 'iron_skin'],
    effects: [{ stat: 'armor', add: 2 }, { stat: 'maxHp', pct: 0.1 }] },
  { id: 'glass_storm', name: 'Glass Storm', desc: '+25% attack speed, +5% crit chance',
    requires: ['glass_cannon', 'quick_hands'],
    effects: [{ stat: 'attackSpeedMult', pct: 0.25 }, { stat: 'critChance', add: 0.05 }] },
  { id: 'venomous_flames', name: 'Venomous Flames', desc: 'Poison and burn +15% damage',
    requires: ['venom', 'fire_weapon'],
    effects: [{ stat: 'elementPower', pct: 0.15 }] },
];

export const SYNERGY_BY_ID: Record<string, SynergyDef> = Object.fromEntries(SYNERGIES.map((s) => [s.id, s]));

/** Synergies that list `upgradeId` as a requirement. */
export function synergiesFor(upgradeId: string): SynergyDef[] {
  return SYNERGIES.filter((s) => s.requires.includes(upgradeId));
}
