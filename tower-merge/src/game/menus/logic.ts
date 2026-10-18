/**
 * Pure helpers for the out-of-run menu scenes (no Phaser): formatting, ranking and countdown math.
 * Unit-tested in tests/menus. Content records (towers, enemies, bosses) may still be empty while
 * other agents fill them, so every lookup degrades to a name made from the id.
 */
import { ACHIEVEMENTS } from '../../data/achievements';
import { BOSSES } from '../../data/bosses';
import { ENEMIES } from '../../data/enemies';
import { SYNERGIES } from '../../data/synergies';
import { TOWERS } from '../../data/towers';
import {
  BOSS_IDS, TOWER_IDS, type AchievementDef, type BossId, type DailyModifier, type IconKey, type LifetimeStats,
  type MetaStat, type MetaUpgradeDef, type TowerDef, type TowerId,
} from '../../data/types';
import type { DailyRecord } from '../../save/schema';

// ---------- names ----------

/** "stoneGolem" -> "Stone Golem", "goblin" -> "Goblin". */
export function prettyName(id: string): string {
  const spaced = id.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
  return spaced.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export const towerDef = (id: string): TowerDef | undefined => (TOWERS as Record<string, TowerDef | undefined>)[id];
export const towerName = (id: string): string => towerDef(id)?.name ?? prettyName(id);
export const enemyName = (id: string): string => (ENEMIES as Record<string, { name?: string } | undefined>)[id]?.name ?? prettyName(id);
export const bossName = (id: string): string => (BOSSES as Record<string, { name?: string } | undefined>)[id]?.name ?? prettyName(id);
export const synergyName = (id: string): string => SYNERGIES.find((s) => s.id === id)?.name ?? prettyName(id);
export const synergyIcon = (id: string): IconKey => SYNERGIES.find((s) => s.id === id)?.icon ?? 'vortex';

/** First sentence of a text ("Fast shots. Cheap." -> "Fast shots."); the whole text when there is none. */
export function firstSentence(text: string): string {
  const m = /^(.+?[.!?])(\s|$)/.exec(text.trim());
  return m ? m[1] : text.trim();
}

// ---------- meta upgrades ----------

/** Stats stored as fractions (0.12) that the UI shows as percentages (12%). */
export const FRACTION_STATS: ReadonlySet<MetaStat> = new Set<MetaStat>([
  'damagePct', 'fireRatePct', 'discountPct', 'coinGainPct', 'abilityCdPct',
]);

const trimNum = (n: number, digits: number): string => String(Number(n.toFixed(digits)));

/** A total or per-level value as shown to the player: 0.12 -> "12%", 45 -> "45". */
export function formatMetaValue(stat: MetaStat, value: number): string {
  return FRACTION_STATS.has(stat) ? `${trimNum(value * 100, 1)}%` : trimNum(value, 2);
}

/** Sum of the upgrade at `level` (float noise rounded off, like core/meta metaTotal). */
export function metaTotalAt(def: MetaUpgradeDef, level: number): number {
  return Math.round(def.valuePerLevel * level * 1e6) / 1e6;
}

/** The upgrade's description with {value} replaced by the total at `level`. */
export function metaDescription(def: MetaUpgradeDef, level: number): string {
  return def.description.replace(/\{value\}/g, formatMetaValue(def.stat, metaTotalAt(def, level)));
}

/** What the next level adds: "+15", "+4%". */
export function metaGainText(def: MetaUpgradeDef): string {
  return `+${formatMetaValue(def.stat, def.valuePerLevel)}`;
}

// ---------- towers ----------

export interface TowerLevelStats {
  damage: number;
  fireRate: number;
  range: number;
  splashRadius: number;
  critChance: number;
  /** Damage per second of one tower, ignoring crits and splash. */
  dps: number;
}

/** Base stats of a tower scaled by the level multipliers (level 1..5). Undefined without a definition. */
export function towerStatsAt(def: TowerDef | undefined, level: number): TowerLevelStats | undefined {
  if (!def) return undefined;
  const lv = def.levels?.[Math.max(0, level - 1)];
  const damage = def.damage * (lv?.damageMult ?? 1);
  const fireRate = def.fireRate * (lv?.fireRateMult ?? 1);
  return {
    damage,
    fireRate,
    range: def.range + (lv?.rangeBonus ?? 0),
    splashRadius: def.splashRadius,
    critChance: def.critChance,
    dps: damage * fireRate,
  };
}

/** Compact stat number: 34 -> "34", 1.65 -> "1.7", 0.55 -> "0.55". */
export function formatStat(n: number): string {
  if (!Number.isFinite(n)) return '-';
  if (n >= 100) return String(Math.round(n));
  if (n >= 10) return trimNum(n, 1);
  return trimNum(n, 2);
}

export interface Ranked<T> {
  id: T;
  value: number;
  /** value / the largest value in the list (0..1) for bar widths. */
  fraction: number;
}

function rank<T extends string>(entries: Array<[T, number]>, limit: number): Ranked<T>[] {
  const list = entries.filter(([, v]) => Number.isFinite(v) && v > 0);
  // Stable: the input order breaks ties.
  const sorted = list.map((e, i) => ({ e, i })).sort((a, b) => b.e[1] - a.e[1] || a.i - b.i).map((x) => x.e).slice(0, limit);
  const max = sorted.length ? sorted[0][1] : 1;
  return sorted.map(([id, value]) => ({ id, value, fraction: value / max }));
}

/** Towers with kills, most kills first (ties in TOWER_IDS order). */
export function rankTowerKills(
  kills: Partial<Record<TowerId, number>>, ids: readonly TowerId[] = TOWER_IDS, limit = ids.length,
): Ranked<TowerId>[] {
  return rank(ids.map((id): [TowerId, number] => [id, kills[id] ?? 0]), limit);
}

/** Synergies by activation count, most first (ties by id). */
export function rankSynergies(counts: Record<string, number>, limit = 5): Ranked<string>[] {
  return rank(Object.keys(counts).sort().map((id): [string, number] => [id, counts[id]]), limit);
}

export function bossKills(stats: LifetimeStats, id: BossId): number {
  return id === 'goblinKing' ? stats.goblinKingKills : id === 'stoneGolem' ? stats.golemKills : stats.dragonKills;
}

export const bossIds = BOSS_IDS;

// ---------- achievements ----------

export interface AchievementRow {
  def: AchievementDef;
  value: number;
  target: number;
  /** 0..1 */
  fraction: number;
  unlocked: boolean;
}

export function achievementRows(stats: LifetimeStats, unlockedIds: readonly string[], defs: readonly AchievementDef[] = ACHIEVEMENTS): AchievementRow[] {
  return defs.map((def) => {
    const value = Math.min(stats[def.stat] ?? 0, def.target);
    const unlocked = unlockedIds.includes(def.id) || (stats[def.stat] ?? 0) >= def.target;
    return { def, value: unlocked ? def.target : value, target: def.target, fraction: unlocked ? 1 : value / def.target, unlocked };
  });
}

/** Closest to done first, then the unlocked ones (their order is kept). */
export function sortAchievementRows(rows: readonly AchievementRow[]): AchievementRow[] {
  return rows.map((r, i) => ({ r, i })).sort((a, b) => {
    if (a.r.unlocked !== b.r.unlocked) return a.r.unlocked ? 1 : -1;
    if (!a.r.unlocked && a.r.fraction !== b.r.fraction) return b.r.fraction - a.r.fraction;
    return a.i - b.i;
  }).map((x) => x.r);
}

// ---------- daily ----------

const DAY_MS = 86_400_000;

/** Milliseconds until 00:00 UTC of the next day (always 1..86400000). */
export function msUntilNextUtcDay(now: number | Date): number {
  const t = typeof now === 'number' ? now : now.getTime();
  return (Math.floor(t / DAY_MS) + 1) * DAY_MS - t;
}

/** 5025000 -> "01:23:45" (hours keep growing past 99, never negative). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil((Number.isFinite(ms) ? ms : 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}

export interface DailyStatus {
  bestWave: number;
  attempts: number;
  played: boolean;
}

/** Today's record; a record of another day counts as not played. */
export function dailyStatus(record: DailyRecord | null | undefined, key: string): DailyStatus {
  if (!record || record.key !== key) return { bestWave: 0, attempts: 0, played: false };
  return { bestWave: record.bestWave, attempts: record.attempts, played: record.attempts > 0 || record.bestWave > 0 };
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-18" -> "Sunday, Oct 18". Falls back to the key itself when it does not parse. */
export function formatDailyDate(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return key;
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

const MODIFIER_ICONS: Record<string, IconKey> = {
  elementalDay: 'fire', swarm: 'skull', richKingdom: 'coin', glassFortress: 'castle', speedDemons: 'speed',
  snipersParadise: 'sniper', juggernauts: 'golem', poisonParty: 'poison', demolitionDerby: 'explosion',
  bargainBin: 'merchant', championsParade: 'elite', stormSeason: 'lightning', frenzyFriday: 'frenzy', fragileFoes: 'crit',
};

/** Icon for a daily modifier (they carry none): by id, else by what it changes. */
export function modifierIcon(mod: DailyModifier): IconKey {
  const known = MODIFIER_ICONS[mod.id];
  if (known) return known;
  if (mod.towerPool?.length) return mod.towerPool[0];
  if (mod.startCoins) return 'coin';
  if (mod.waveModifier?.enemyCountMult || mod.waveModifier?.eliteChance) return 'skull';
  if (mod.waveModifier) return 'clock';
  return 'star';
}

/** "Best wave 12" / "New!" for the menu's daily button. */
export function dailyButtonStatus(status: DailyStatus): string {
  return status.played ? `Best wave ${status.bestWave}` : 'New!';
}

// ---------- menu ----------

export function countUnlocked(stats: LifetimeStats, unlockedIds: readonly string[]): { unlocked: number; total: number } {
  const rows = achievementRows(stats, unlockedIds);
  return { unlocked: rows.filter((r) => r.unlocked).length, total: rows.length };
}

/** "2026-10-18" -> "18 Oct 2026" for the best-run card; empty stays empty. */
export function formatRunDate(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return '';
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}`;
}
