import type { MysteryEggReward } from './types';

/** Shown to the player before they open an egg. Must sum to 1. */
export const EGG_ODDS = { companion: 0.25, cosmetic: 0.15, gold: 0.35, buff: 0.25 } as const;

export const EGG_COMPANIONS = ['companion_fairy', 'companion_wisp'] as const;
export const EGG_COSMETICS = ['skin_gold', 'skin_shadow', 'skin_emerald', 'skin_crimson'] as const;
export const EGG_BUFFS = ['buff_fury', 'buff_haste', 'buff_fortune', 'buff_bulwark'] as const;

const COMPANION_ROOMS = 3;
const BUFF_ROOMS = 3;
const GOLD_MIN = 40;
const GOLD_MAX = 120;

function pick<T>(list: readonly T[], rand: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}

function rollGold(rand: () => number): MysteryEggReward {
  return { kind: 'gold', amount: GOLD_MIN + Math.min(GOLD_MAX - GOLD_MIN, Math.floor(rand() * (GOLD_MAX - GOLD_MIN + 1))) };
}

/** `owned` is the list of owned cosmetic ids; when every skin is owned a cosmetic roll becomes gold. */
export function rollMysteryEgg(rand: () => number, owned: string[]): MysteryEggReward {
  const r = rand();
  if (r < EGG_ODDS.companion) {
    return { kind: 'companion', id: pick(EGG_COMPANIONS, rand), rooms: COMPANION_ROOMS };
  }
  if (r < EGG_ODDS.companion + EGG_ODDS.cosmetic) {
    const free = EGG_COSMETICS.filter((id) => !owned.includes(id));
    return free.length > 0 ? { kind: 'cosmetic', id: pick(free, rand) } : rollGold(rand);
  }
  if (r < EGG_ODDS.companion + EGG_ODDS.cosmetic + EGG_ODDS.gold) return rollGold(rand);
  return { kind: 'buff', id: pick(EGG_BUFFS, rand), rooms: BUFF_ROOMS };
}

const pct = (n: number): string => `${Math.round(n * 100)}%`;

/** Odds text for the egg UI. */
export function formatOdds(): string {
  return `Companion ${pct(EGG_ODDS.companion)} · Cosmetic ${pct(EGG_ODDS.cosmetic)} · `
    + `Gold ${pct(EGG_ODDS.gold)} · Buff ${pct(EGG_ODDS.buff)}`;
}
