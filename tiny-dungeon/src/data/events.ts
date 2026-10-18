// Shrine room options (data) and the run-state functions that apply them.
import { BALANCE } from '../config/balance';
import { applyBuff, healPlayer } from '../core/run';
import type { Rng } from '../core/rng';
import type { RunState } from '../core/types';

export type ShrineKind = 'blood_altar' | 'healing_fountain' | 'gamblers_idol' | 'cursed_chest' | 'fairy_spring' | 'war_banner';

export interface ShrineOption {
  id: string;
  name: string;
  desc: string;
  icon: string;
  kind: ShrineKind;
}

export const SHRINE_OPTIONS: ShrineOption[] = [
  { id: 'blood_altar', name: 'Blood Altar', desc: 'Pay 25% max HP: next upgrade offer is epic or better', icon: 'heart', kind: 'blood_altar' },
  { id: 'healing_fountain', name: 'Healing Fountain', desc: 'Heal to full HP', icon: 'regen', kind: 'healing_fountain' },
  { id: 'gamblers_idol', name: "Gambler's Idol", desc: 'Pay 50% of your gold: 50% chance of a legendary offer', icon: 'luck', kind: 'gamblers_idol' },
  { id: 'cursed_chest', name: 'Cursed Chest', desc: 'Gain gold, but enemies have +20% HP for 3 rooms', icon: 'chest', kind: 'cursed_chest' },
  { id: 'fairy_spring', name: 'Fairy Spring', desc: 'A fairy fights beside you for 3 rooms', icon: 'star', kind: 'fairy_spring' },
  { id: 'war_banner', name: 'War Banner', desc: '+25% damage for 3 rooms', icon: 'damage', kind: 'war_banner' },
];

export const SHRINE_BY_ID: Record<string, ShrineOption> = Object.fromEntries(SHRINE_OPTIONS.map((s) => [s.id, s]));

export interface ShrineResult {
  ok: boolean;
  message: string;
}

/** HP the Blood Altar costs right now. */
export function bloodAltarCost(run: RunState): number {
  return Math.ceil(run.stats.maxHp * BALANCE.shrines.bloodAltarHpFraction);
}

export function canUseShrine(run: RunState, id: string): boolean {
  const opt = SHRINE_BY_ID[id];
  if (!opt) return false;
  switch (opt.kind) {
    case 'blood_altar': return run.hp > bloodAltarCost(run);
    case 'gamblers_idol': return run.gold >= BALANCE.shrines.gamblersIdolMinGold;
    case 'healing_fountain': return run.hp < run.stats.maxHp;
    default: return true;
  }
}

/** Offers `count` distinct shrine options; the fountain is always included when badly hurt. */
export function rollShrineOptions(run: RunState, rng: Rng, count = 3): ShrineOption[] {
  const pool = rng.shuffle(SHRINE_OPTIONS);
  const out = pool.slice(0, count);
  if (run.hp / run.stats.maxHp < 0.5 && !out.some((o) => o.kind === 'healing_fountain')) {
    out[out.length - 1] = SHRINE_BY_ID.healing_fountain;
  }
  return out;
}

/**
 * Applies a shrine option. Timed effects are given one extra room because the shrine room itself is
 * cleared (onRoomCleared) right after the choice, which ticks them down once.
 */
export function applyShrine(run: RunState, id: string, rng: Rng): ShrineResult {
  const opt = SHRINE_BY_ID[id];
  if (!opt) return { ok: false, message: 'Nothing happens.' };
  if (!canUseShrine(run, id)) return { ok: false, message: 'You cannot use this right now.' };
  const s = BALANCE.shrines;
  switch (opt.kind) {
    case 'blood_altar':
      run.hp -= bloodAltarCost(run);
      run.nextChoice = { minRarity: 'epic' };
      return { ok: true, message: 'The altar accepts your blood. Epic power awaits.' };
    case 'healing_fountain':
      healPlayer(run, run.stats.maxHp);
      return { ok: true, message: 'You feel fully restored.' };
    case 'gamblers_idol': {
      run.gold -= Math.floor(run.gold * s.gamblersIdolGoldFraction);
      if (rng.chance(s.gamblersIdolWinChance)) {
        run.nextChoice = { minRarity: 'legendary' };
        return { ok: true, message: 'The idol grins. A legend awaits!' };
      }
      return { ok: true, message: 'The idol laughs and keeps your gold.' };
    }
    case 'cursed_chest': {
      const gold = Math.round((s.cursedChestGoldBase + s.cursedChestGoldPerRoom * run.room) * run.stats.goldMult);
      run.gold += gold;
      run.curseRooms = s.cursedChestRooms + 1;
      return { ok: true, message: `+${gold} gold. Enemies grow stronger...` };
    }
    case 'fairy_spring':
      applyBuff(run, 'companion_fairy', s.buffRooms + 1);
      return { ok: true, message: 'A fairy joins you.' };
    case 'war_banner':
      applyBuff(run, 'buff_fury', s.buffRooms + 1);
      return { ok: true, message: 'Your blows hit harder.' };
  }
}

/** HP multiplier for enemies while a Cursed Chest curse is active; pass to planRoom as opts.hpMult. */
export function curseHpMult(run: RunState): number {
  return (run.curseRooms ?? 0) > 0 ? 1 + BALANCE.shrines.cursedChestHpBonus : 1;
}
