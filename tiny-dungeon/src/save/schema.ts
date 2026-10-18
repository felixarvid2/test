import type { HeroId, RunSummary } from '../core/types';

export const SAVE_VERSION = 1;

export interface Settings {
  musicVolume: number;      // 0..1
  sfxVolume: number;        // 0..1
  screenShake: boolean;
  reducedMotion: boolean;   // fewer particles, no flashes, no shake
  damageNumbers: boolean;
  joystick: 'floating' | 'fixed';
}

export interface LifetimeStats {
  runs: number;
  totalKills: number;
  totalGold: number;
  bestRoom: number;
  bestRoomByHero: Partial<Record<HeroId, number>>;
  legendariesTotal: number;
  bossesDefeated: Record<string, number>;
  bestNoDamageRooms: number;
  bestKillsInRun: number;
  bestLevel: number;
  maxSynergiesInRun: number;
  dailyCompleted: number;
}

export interface DailyResult { bestRoom: number; kills: number; attempts: number }

export interface RewardLedger {
  day: string;                          // YYYY-MM-DD (UTC) the counter belongs to
  claimsToday: number;
  claimed: Record<string, number>;      // claimKey -> timestamp; pruned to the last ~200 entries
  tokens: number;                       // Fortune Tokens (ad-free alternative)
}

export interface SaveData {
  version: number;
  gold: number;
  meta: Record<string, number>;         // meta upgrade id -> level
  heroes: HeroId[];                     // unlocked heroes
  selectedHero: HeroId;
  unlocks: string[];                    // unlock ids (weapons, upgrades, enemy variants, cosmetics)
  achievements: Record<string, number>; // id -> unlock timestamp
  stats: LifetimeStats;
  settings: Settings;
  daily: Record<string, DailyResult>;   // date -> result, pruned to the last 30 days
  rewards: RewardLedger;
  cosmetics: { owned: string[]; equipped: Partial<Record<HeroId, string>> };
  lastRun: RunSummary | null;
}
