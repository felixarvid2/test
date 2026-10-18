import type { HeroDef, HeroId } from '../core/types';

export const HEROES: Record<HeroId, HeroDef> = {
  knight: {
    id: 'knight',
    name: 'Knight',
    desc: 'Tough front-liner with a wide sword arc.',
    frame: 'tile:knight',
    weapon: 'sword',
    base: { maxHp: 140, armor: 1, moveSpeed: 185 },
    passive: {
      name: 'Bulwark',
      desc: '+1 armor, +0.5 HP/s regeneration',
      effects: [{ stat: 'armor', add: 1 }, { stat: 'regen', add: 0.5 }],
    },
    favoredTags: ['defense', 'melee'],
    unlockCost: 0,
  },
  ranger: {
    id: 'ranger',
    name: 'Ranger',
    desc: 'Fast, fragile marksman who lives on crits.',
    frame: 'tile:ranger',
    weapon: 'bow',
    base: { maxHp: 105, moveSpeed: 215, critChance: 0.1, attackSpeedMult: 1.1 },
    passive: {
      name: 'Eagle Eye',
      desc: '+25% crit damage, +15% range',
      effects: [{ stat: 'critDamage', add: 0.25 }, { stat: 'rangeMult', pct: 0.15 }],
    },
    favoredTags: ['crit', 'projectile', 'speed'],
    unlockCost: 400,
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    desc: 'Frail caster; every element hits harder.',
    frame: 'tile:mage',
    weapon: 'staff',
    base: { maxHp: 100, elementPower: 1.4 },
    passive: {
      name: 'Arcane Affinity',
      desc: '+10% burn, slow, chain and poison chance',
      effects: [
        { stat: 'burnChance', add: 0.1 }, { stat: 'slowChance', add: 0.1 },
        { stat: 'chainChance', add: 0.1 }, { stat: 'poisonChance', add: 0.1 },
      ],
    },
    favoredTags: ['elemental', 'fire', 'frost', 'lightning', 'poison'],
    unlockCost: 900,
  },
};

export const HERO_IDS: HeroId[] = ['knight', 'ranger', 'mage'];
