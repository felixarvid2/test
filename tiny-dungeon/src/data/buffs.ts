import type { BuffDef } from '../core/types';

// Temporary buffs and companions (Mystery Egg, shrines). They last a number of rooms (ActiveBuff.roomsLeft).
export const BUFFS: BuffDef[] = [
  { id: 'companion_fairy', name: 'Fairy', desc: 'A fairy follows you and shoots small bolts', icon: 'heart',
    effects: [], companion: 'companion_fairy' },
  { id: 'companion_wisp', name: 'Wisp', desc: 'A wisp orbits you and zaps enemies', icon: 'lightning',
    effects: [], companion: 'companion_wisp' },
  { id: 'buff_fury', name: 'Fury', desc: '+25% damage', icon: 'damage',
    effects: [{ stat: 'damageMult', pct: 0.25 }] },
  { id: 'buff_haste', name: 'Haste', desc: '+20% attack speed, +10% move speed', icon: 'attackSpeed',
    effects: [{ stat: 'attackSpeedMult', pct: 0.2 }, { stat: 'moveSpeed', pct: 0.1 }] },
  { id: 'buff_fortune', name: 'Fortune', desc: '+50% gold', icon: 'gold',
    effects: [{ stat: 'goldMult', pct: 0.5 }] },
  { id: 'buff_bulwark', name: 'Bulwark', desc: '+2 armor, +15% max HP', icon: 'shield',
    effects: [{ stat: 'armor', add: 2 }, { stat: 'maxHp', pct: 0.15 }] },
];

export const BUFF_BY_ID: Record<string, BuffDef> = Object.fromEntries(BUFFS.map((b) => [b.id, b]));

/** Hero skins: `tint` is applied to the hero sprite (0xffffff = untinted). Ids match achievement unlocks. */
export const COSMETICS: { id: string; name: string; tint: number }[] = [
  { id: 'skin_gold', name: 'Golden', tint: 0xffd86b },
  { id: 'skin_shadow', name: 'Shadow', tint: 0x6a5a8c },
  { id: 'skin_emerald', name: 'Emerald', tint: 0x6bffa8 },
  { id: 'skin_crimson', name: 'Crimson', tint: 0xff6b7a },
];
