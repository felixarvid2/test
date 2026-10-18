import type { AchievementCheck, MetaUpgradeDef, StatKey } from '../../core/types';
import type { SaveData } from '../../save/schema';

// Pure text / number helpers for the menu scenes (no Phaser, so they are unit-tested).

/** 1234567 -> "1,234,567". */
export function fmt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const STAT_NAME: Partial<Record<StatKey, string>> = {
  maxHp: 'HP', damageMult: 'damage', moveSpeed: 'speed', critChance: 'crit', goldMult: 'gold', xpMult: 'XP',
};
const FRACTION_STATS = new Set<StatKey>(['critChance', 'dodge']);

/** "+30 HP" for the effect of `level` levels of a permanent upgrade (shop rows show now -> next). */
export function metaEffectText(def: MetaUpgradeDef, level: number): string {
  switch (def.special) {
    case 'unlockBow':
    case 'unlockStaff': return level > 0 ? 'Unlocked' : 'Locked';
    case 'extraChoice': return level > 0 ? '4 choices' : '3 choices';
    case 'reroll': return level === 1 ? '1 free reroll' : `${level} free rerolls`;
    default: break;
  }
  const e = def.effects[0];
  if (!e) return '';
  const v = (e.add ?? e.pct ?? 0) * level;
  const asPct = e.pct !== undefined || FRACTION_STATS.has(e.stat);
  const val = asPct ? `${Math.round(v * 100)}%` : `${Math.round(v)}`;
  return `+${val} ${STAT_NAME[e.stat] ?? e.stat}`;
}

/** Progress toward an achievement from lifetime stats, or null when it is not a simple counter. */
export function achievementProgress(check: AchievementCheck, save: SaveData): { cur: number; max: number } | null {
  const s = save.stats;
  switch (check.kind) {
    case 'totalKills': return { cur: s.totalKills, max: check.value };
    case 'bestRoom': return { cur: s.bestRoom, max: check.value };
    case 'noDamageRoom': return { cur: s.bestNoDamageRooms + 1, max: check.value };
    case 'legendariesTotal': return { cur: s.legendariesTotal, max: check.value };
    case 'runs': return { cur: s.runs, max: check.value };
    case 'goldTotal': return { cur: s.totalGold, max: check.value };
    case 'synergiesInRun': return { cur: s.maxSynergiesInRun, max: check.value };
    case 'killsInRun': return { cur: s.bestKillsInRun, max: check.value };
    case 'heroRoom': return { cur: s.bestRoomByHero[check.hero] ?? 0, max: check.value };
    case 'dailyCompleted': return { cur: s.dailyCompleted, max: check.value };
    case 'levelInRun': return { cur: s.bestLevel, max: check.value };
    case 'bossDefeated': return null;
  }
}
