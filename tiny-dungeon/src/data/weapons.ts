import type { WeaponDef, WeaponId } from '../core/types';

// Base numbers before stats. Weapon level = 1 + levels of upgrades that `requiresWeapon` this weapon.
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  sword: {
    id: 'sword',
    name: 'Sword',
    kind: 'melee',
    baseDamage: 18,
    cooldown: 0.7,
    range: 95,            // arc reach; arc width comes from the swordArc stat (110 deg)
    knockback: 220,
    icon: 'sword',
  },
  bow: {
    id: 'bow',
    name: 'Bow',
    kind: 'projectile',
    baseDamage: 16,
    cooldown: 0.9,
    range: 420,
    projectileSpeed: 620,
    knockback: 70,
    icon: 'bow',
  },
  staff: {
    id: 'staff',
    name: 'Staff',
    kind: 'magic',
    baseDamage: 15,
    cooldown: 0.8,
    range: 380,
    projectileSpeed: 380, // seeking bolts; bounce to staffBounces extra targets
    knockback: 40,
    icon: 'staff',
  },
};

export const WEAPON_IDS: WeaponId[] = ['sword', 'bow', 'staff'];
