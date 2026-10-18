import type { LifetimeStats, TowerId } from '../data/types';

export const SAVE_VERSION = 1;

/** Towers every fresh save owns (the 'start' towers of data/towers.ts). */
export const START_TOWERS: readonly TowerId[] = ['arrow', 'cannon', 'frost'];

export interface Settings {
  musicVolume: number;   // 0..1
  sfxVolume: number;     // 0..1
  muted: boolean;
  screenShake: boolean;
  reducedMotion: boolean;
  damageNumbers: boolean;
  showRanges: boolean;
}

export interface BestRun {
  wave: number;
  kills: number;
  merges: number;
  gems: number;
  /** YYYY-MM-DD (UTC). */
  date: string;
}

export interface DailyRecord {
  /** YYYY-MM-DD (UTC) of the daily challenge. */
  key: string;
  bestWave: number;
  attempts: number;
}

export interface RewardLedger {
  /** claim key -> timestamp (ms); pruned to the newest REWARD_CONFIG.maxClaims entries. */
  claimed: Record<string, number>;
  /** Ad-gated claims per placement (and under 'all') on one UTC day. */
  counts: Record<string, { day: string; n: number }>;
}

export interface SaveData {
  version: number;
  /** Meta currency. */
  gems: number;
  /** Meta upgrade id -> level. */
  metaLevels: Record<string, number>;
  unlockedTowers: TowerId[];
  /** Towers the player has seen in a run (collection screen). */
  discoveredTowers: TowerId[];
  achievements: string[];
  settings: Settings;
  stats: LifetimeStats;
  bestRun: BestRun | null;
  daily: DailyRecord | null;
  rewards: RewardLedger;
  tutorial: { firstRunDone: boolean; mergeHintShown: boolean };
}
