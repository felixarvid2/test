import type { Effect, FlagKey, SynergyDef, TowerId, TowerStat } from './types';

const stat = (s: TowerStat, op: 'flat' | 'pct' | 'mul', value: number, tower?: TowerId[]): Effect =>
  tower ? { kind: 'stat', stat: s, op, value, tower } : { kind: 'stat', stat: s, op, value };
const flag = (f: FlagKey, value: number, tower?: TowerId[]): Effect =>
  tower ? { kind: 'flag', flag: f, value, tower } : { kind: 'flag', flag: f, value };

/**
 * Data-driven synergies: memorable power spikes that switch on when the board / upgrades match.
 * Tower lists mean "all of these types are on the board".
 */
export const SYNERGIES: SynergyDef[] = [
  {
    id: 'toxicInferno', name: 'Toxic Inferno', icon: 'poison',
    description: 'Fire + Poison: burning enemies apply 2 poison stacks to enemies within 80 px when defeated.',
    requires: { towers: ['fire', 'poison'] },
    effects: [flag('burnSpreadsPoison', 2)],
  },
  {
    id: 'shatter', name: 'Shatter', icon: 'freeze',
    description: 'Frost + Cannon: Cannon towers deal +80% damage to frozen or slowed enemies.',
    requires: { towers: ['frost', 'cannon'] },
    effects: [flag('frozenBonusDamage', 0.8, ['cannon'])],
  },
  {
    id: 'thunderstorm', name: 'Thunderstorm', icon: 'lightning',
    description: 'Lightning + Keen Eye: critical hits fire 2 extra lightning bolts at 60% damage.',
    requires: { towers: ['lightning'], upgrades: ['keenEye'] },
    effects: [flag('critLightning', 2)],
  },
  {
    id: 'venomBarrage', name: 'Venom Barrage', icon: 'arrow',
    description: 'Arrow + Poison: arrows apply 1 poison stack and deal +25% damage to poisoned enemies.',
    requires: { towers: ['arrow', 'poison'] },
    effects: [flag('poisonOnHit', 1, ['arrow']), flag('poisonedBonusDamage', 0.25, ['arrow'])],
  },
  {
    id: 'napalm', name: 'Napalm', icon: 'cannon',
    description: 'Cannon + Fire: cannon hits leave burning ground (14 dps, 50 px, 2.5 s).',
    requires: { towers: ['cannon', 'fire'] },
    effects: [flag('fireZoneOnHit', 14, ['cannon'])],
  },
  {
    id: 'deathMark', name: 'Death Mark', icon: 'skull',
    description: 'Level 3 Sniper: snipers execute non-boss enemies below 12% HP (bosses take +100%) and crit for +0.5x more.',
    requires: { towerLevel: { tower: 'sniper', level: 3 } },
    effects: [flag('executeThreshold', 0.12, ['sniper']), stat('critMult', 'flat', 0.5, ['sniper'])],
  },
  {
    id: 'arcaneStorm', name: 'Arcane Storm', icon: 'magic',
    description: 'Magic + Lightning: magic hits have a 30% chance to trigger a 3-jump chain lightning.',
    requires: { towers: ['magic', 'lightning'] },
    effects: [flag('chainLightningChance', 0.3, ['magic'])],
  },
  {
    id: 'frostfire', name: 'Frostfire', icon: 'vortex',
    description: 'Fire + Frost: Fire and Frost towers deal +30% damage to burning enemies and to slowed or frozen enemies.',
    requires: { towers: ['fire', 'frost'] },
    effects: [
      flag('burningBonusDamage', 0.3, ['fire', 'frost']),
      flag('frozenBonusDamage', 0.3, ['fire', 'frost']),
    ],
  },
  {
    id: 'plagueDoctor', name: 'Plague Doctor', icon: 'poison',
    description: 'Level 4 Poison Tower: poisoned enemies pass their stacks to 2 nearby enemies on death; all towers deal +20% to poisoned enemies.',
    requires: { towerLevel: { tower: 'poison', level: 4 } },
    effects: [flag('poisonSpreadOnDeath', 1), flag('poisonedBonusDamage', 0.2)],
  },
  {
    id: 'bombardment', name: 'Bombardment', icon: 'explosion',
    description: 'Level 4 Cannon: every 3rd Cannon attack triggers a 60 px explosion for 150% damage; +20% Cannon splash radius.',
    requires: { towerLevel: { tower: 'cannon', level: 4 } },
    effects: [flag('everyNthExplosion', 3, ['cannon']), stat('splashRadius', 'pct', 0.2, ['cannon'])],
  },
  {
    id: 'staticField', name: 'Static Field', icon: 'chain',
    description: 'Lightning + Frost: Lightning towers deal +40% damage to slowed or frozen enemies and stun for 0.6 s on 15% of hits.',
    requires: { towers: ['lightning', 'frost'] },
    effects: [flag('frozenBonusDamage', 0.4, ['lightning']), flag('stunChance', 0.15, ['lightning'])],
  },
  {
    id: 'glacier', name: 'Glacier', icon: 'frost',
    description: 'Level 4 Frost Tower: freezing releases an 80 px frost nova, +15% freeze chance, bosses take +25% while slowed or frozen.',
    requires: { towerLevel: { tower: 'frost', level: 4 } },
    effects: [flag('frostNova', 80, ['frost']), flag('freezeChance', 0.15, ['frost']), flag('bossShatter', 0.25)],
  },
  {
    id: 'eagleEye', name: 'Eagle Eye', icon: 'eye',
    description: 'Arrow + Sniper: Arrow and Sniper towers gain +20% range, +10% crit chance and arrows pierce 1 extra enemy.',
    requires: { towers: ['arrow', 'sniper'] },
    effects: [
      stat('range', 'pct', 0.2, ['arrow', 'sniper']),
      stat('critChance', 'flat', 0.1, ['arrow', 'sniper']),
      flag('pierce', 1, ['arrow']),
    ],
  },
  {
    id: 'elementalChaos', name: 'Elemental Chaos', icon: 'magic',
    description: 'Magic + Fire + Frost: Magic hits apply a random element; Magic, Fire and Frost gain +25% status strength.',
    requires: { towers: ['magic', 'fire', 'frost'] },
    effects: [
      flag('randomElement', 1, ['magic']),
      stat('statusPower', 'pct', 0.25, ['magic', 'fire', 'frost']),
    ],
  },
  {
    id: 'fortress', name: 'Fortress', icon: 'castle',
    description: 'Arrow + Cannon + Frost + Lightning: +25% castle max HP, 10 thorns damage and +10% damage for all towers.',
    requires: { towers: ['arrow', 'cannon', 'frost', 'lightning'] },
    effects: [
      { kind: 'global', stat: 'castleMaxHp', op: 'pct', value: 0.25 },
      flag('thorns', 10),
      stat('damage', 'pct', 0.1),
    ],
  },
  {
    id: 'overload', name: 'Overload', icon: 'lightning',
    description: 'Level 5 Lightning Tower: lightning chains to 3 more targets with +30% chain range and +30% damage.',
    requires: { towerLevel: { tower: 'lightning', level: 5 } },
    effects: [
      stat('chainCount', 'flat', 3, ['lightning']),
      stat('chainRange', 'pct', 0.3, ['lightning']),
      stat('damage', 'pct', 0.3, ['lightning']),
    ],
  },
  {
    id: 'flamingArrows', name: 'Flaming Arrows', icon: 'fire',
    description: 'Arrow + Fire: arrows burn enemies for 40% of hit damage per second for 3 s.',
    requires: { towers: ['arrow', 'fire'] },
    effects: [flag('burnOnHit', 0.4, ['arrow'])],
  },
  {
    id: 'cryoRounds', name: 'Cryo Rounds', icon: 'sniper',
    description: 'Sniper + Frost: sniper shots have a 30% chance to freeze and make targets take +20% damage for 3 s.',
    requires: { towers: ['sniper', 'frost'] },
    effects: [flag('freezeChance', 0.3, ['sniper']), flag('vulnerabilityOnHit', 0.2, ['sniper'])],
  },
  {
    id: 'witchsBrew', name: "Witch's Brew", icon: 'curse',
    description: 'Poison + Magic: magic hits apply 1 poison stack and deal +30% damage to poisoned enemies.',
    requires: { towers: ['poison', 'magic'] },
    effects: [flag('poisonOnHit', 1, ['magic']), flag('poisonedBonusDamage', 0.3, ['magic'])],
  },
  {
    id: 'tripleThreat', name: 'Triple Threat', icon: 'star',
    description: 'Arrow + Cannon + Frost: all towers gain +10% attack speed and +7% damage.',
    requires: { towers: ['arrow', 'cannon', 'frost'] },
    effects: [stat('fireRate', 'pct', 0.1), stat('damage', 'pct', 0.07)],
  },
];
