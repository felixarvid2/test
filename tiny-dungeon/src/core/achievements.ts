import { ACHIEVEMENTS } from '../data/achievements';
import type { SaveData } from '../save/schema';
import type { AchievementCheck, AchievementDef, RunSummary } from './types';

/**
 * Updates lifetime stats with a finished run. "Room reached" = roomsCleared + 1 everywhere (a run that
 * dies in room 6 has bestRoom 6). Does NOT bank gold: the caller adds runGoldReward(summary) to save.gold
 * (and handles the daily result via recordDaily).
 */
export function recordRun(save: SaveData, summary: RunSummary): void {
  const s = save.stats;
  const reached = summary.roomsCleared + 1;
  s.runs += 1;
  s.totalKills += summary.kills;
  s.totalGold += summary.gold;
  s.bestRoom = Math.max(s.bestRoom, reached);
  s.bestRoomByHero[summary.hero] = Math.max(s.bestRoomByHero[summary.hero] ?? 0, reached);
  s.legendariesTotal += summary.legendaries;
  for (const boss of summary.bossesDefeated) s.bossesDefeated[boss] = (s.bossesDefeated[boss] ?? 0) + 1;
  s.bestNoDamageRooms = Math.max(s.bestNoDamageRooms, summary.noDamageRooms);
  s.bestKillsInRun = Math.max(s.bestKillsInRun, summary.kills);
  s.bestLevel = Math.max(s.bestLevel, summary.level);
  s.maxSynergiesInRun = Math.max(s.maxSynergiesInRun, summary.synergies.length);
  save.lastRun = summary;
}

function isMet(check: AchievementCheck, save: SaveData, run?: RunSummary): boolean {
  const s = save.stats;
  const reached = run ? run.roomsCleared + 1 : 0;
  switch (check.kind) {
    case 'totalKills': return s.totalKills >= check.value;
    case 'bestRoom': return Math.max(s.bestRoom, reached) >= check.value;
    case 'bossDefeated': return (s.bossesDefeated[check.boss] ?? 0) > 0 || !!run?.bossesDefeated.includes(check.boss);
    // "Reach room N without damage": the N-1 rooms before it were cleared untouched.
    case 'noDamageRoom': return Math.max(s.bestNoDamageRooms, run?.noDamageRooms ?? 0) + 1 >= check.value;
    case 'legendariesTotal': return s.legendariesTotal >= check.value;
    case 'runs': return s.runs >= check.value;
    case 'goldTotal': return s.totalGold >= check.value;
    case 'synergiesInRun': return Math.max(s.maxSynergiesInRun, run?.synergies.length ?? 0) >= check.value;
    case 'killsInRun': return Math.max(s.bestKillsInRun, run?.kills ?? 0) >= check.value;
    case 'heroRoom':
      return Math.max(s.bestRoomByHero[check.hero] ?? 0, run && run.hero === check.hero ? reached : 0) >= check.value;
    case 'dailyCompleted': return s.dailyCompleted >= check.value;
    case 'levelInRun': return Math.max(s.bestLevel, run?.level ?? 0) >= check.value;
  }
}

function grant(save: SaveData, a: AchievementDef): void {
  const r = a.reward;
  if (!r) return;
  if (r.gold) save.gold += r.gold;
  if (r.tokens) save.rewards.tokens += r.tokens;
  if (r.unlock) {
    const list = r.unlock.startsWith('skin_') ? save.cosmetics.owned : save.unlocks;
    if (!list.includes(r.unlock)) list.push(r.unlock);
  }
}

/**
 * Returns achievements earned by this call (each is earned once), recording them in `save.achievements`
 * and granting their rewards. Call recordRun first; passing the summary also counts it directly.
 */
export function evaluateAchievements(save: SaveData, run?: RunSummary): AchievementDef[] {
  const earned: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (save.achievements[a.id] !== undefined) continue;
    if (!isMet(a.check, save, run)) continue;
    save.achievements[a.id] = Date.now();
    grant(save, a);
    earned.push(a);
  }
  return earned;
}
