/**
 * Pure logic behind the in-run overlays (no Phaser, no services): unit-tested in tests/overlays.
 * The scenes only draw what these functions decide.
 */
import type { EventOption, IconKey, TowerId, UpgradeDef } from '../../data/types';
import type { ClaimFailure, ClaimResult, RewardGate, RewardQuote } from '../../rewards/types';
import type { EmergencyPower, PendingEvent, RunStats, SlotState, WorldApi } from '../../sim/api';

// ---------------------------------------------------------------------------------------------
// Reward offer button
// ---------------------------------------------------------------------------------------------

export type OfferMode = 'ad' | 'gems';

export interface OfferView {
  /** False when the gate is 'none', the reward was claimed, or it was granted by this button. */
  visible: boolean;
  /** Tappable: visible, idle and not blocked by the scene. */
  enabled: boolean;
  /** A claim is in flight (ad showing): the button stays visible but disabled. */
  busy: boolean;
  mode: OfferMode | null;
  /** "Watch ad", "15 gems" or "Reroll - Watch ad" when a prefix was given. */
  label: string;
}

export function gemsLabel(cost: number | null): string {
  const n = Math.max(0, Math.floor(cost ?? 0));
  return `${n} ${n === 1 ? 'gem' : 'gems'}`;
}

export function offerLabel(mode: OfferMode, quote: Pick<RewardQuote, 'gemCost'>, prefix = ''): string {
  const base = mode === 'ad' ? 'Watch ad' : gemsLabel(quote.gemCost);
  return prefix ? `${prefix} - ${base}` : base;
}

const CLAIM_MESSAGES: Record<ClaimFailure, string | null> = {
  cancelled: 'Ad closed - no reward',
  failed: 'Ad unavailable, try again later',
  dailyLimit: 'Daily reward limit reached',
  insufficientGems: 'Not enough gems',
  unavailable: 'Not available right now',
  invalid: 'Could not verify the reward',
  busy: 'One moment...',
  alreadyClaimed: null,
};

/** Toast text for a failed claim (null = say nothing). */
export function claimFailureMessage(reason: ClaimFailure): string | null {
  return reason in CLAIM_MESSAGES ? CLAIM_MESSAGES[reason] : 'Not available right now';
}

/**
 * State machine of one reward button. `getQuote` is RewardService.quote for the button's
 * placement and context. While a claim is pending the service itself reports gate 'none' (it is
 * busy), so the quote from before the claim is frozen and used to keep the button on screen.
 *
 *   idle --begin()--> busy --finish(ok)--> granted (hidden for good)
 *                          \--finish(fail)--> idle (toast; quote decides again)
 */
export class RewardOfferState {
  private phase: 'idle' | 'busy' | 'granted' = 'idle';
  private frozen: RewardQuote | null = null;
  private blockedFlag = false;

  constructor(private readonly getQuote: () => RewardQuote, private readonly prefix = '') {}

  get isBusy(): boolean {
    return this.phase === 'busy';
  }

  get isGranted(): boolean {
    return this.phase === 'granted';
  }

  /** The scene can hold the button disabled (e.g. nothing selected yet) without hiding it. */
  setBlocked(blocked: boolean): void {
    this.blockedFlag = blocked;
  }

  view(): OfferView {
    if (this.phase === 'granted') return { visible: false, enabled: false, busy: false, mode: null, label: '' };
    if (this.phase === 'busy' && this.frozen && this.frozen.gate !== 'none') {
      const mode: OfferMode = this.frozen.gate;
      return { visible: true, enabled: false, busy: true, mode, label: offerLabel(mode, this.frozen, this.prefix) };
    }
    const q = this.getQuote();
    if (q.claimed || q.gate === 'none') return { visible: false, enabled: false, busy: false, mode: null, label: '' };
    return { visible: true, enabled: !this.blockedFlag, busy: false, mode: q.gate, label: offerLabel(q.gate, q, this.prefix) };
  }

  /** Call on tap. True = the caller may now run claim(); false = ignore the tap. */
  begin(): boolean {
    const v = this.view();
    if (this.phase !== 'idle' || !v.visible || !v.enabled) return false;
    this.frozen = this.getQuote();
    this.phase = 'busy';
    return true;
  }

  /** Call with claim()'s result. `granted` = the caller should now grant the reward. */
  finish(result: ClaimResult): { granted: boolean; message: string | null } {
    this.frozen = null;
    if (result.ok) {
      this.phase = 'granted';
      return { granted: true, message: null };
    }
    this.phase = 'idle';
    return { granted: false, message: claimFailureMessage(result.reason) };
  }
}

/** The revive offer is shown only when it can be claimed: defeated, not yet revived, gate open. */
export function reviveOfferAvailable(world: Pick<WorldApi, 'phase' | 'revived'>, gate: RewardGate): boolean {
  return world.phase === 'defeated' && !world.revived && gate !== 'none';
}

// ---------------------------------------------------------------------------------------------
// Upgrades
// ---------------------------------------------------------------------------------------------

export function countTaken(taken: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of taken) out.set(id, (out.get(id) ?? 0) + 1);
  return out;
}

export interface StackInfo {
  /** Times it was already taken this run. */
  owned: number;
  /** Stack level after picking it again. */
  next: number;
  max: number;
  /** "Stack 2/3" for an upgrade that is already owned and can stack; null otherwise. */
  label: string | null;
}

export function stackInfo(id: string, maxStacks: number, taken: readonly string[]): StackInfo {
  const owned = taken.reduce((n, t) => (t === id ? n + 1 : n), 0);
  const max = Math.max(1, Math.floor(maxStacks));
  const next = Math.min(max, owned + 1);
  return { owned, next, max, label: owned > 0 && max > 1 ? `Stack ${next}/${max}` : null };
}

/** Distinct upgrades in the order they were first taken, with counts (pause screen list). */
export function upgradeInventory<T extends { id: string }>(
  taken: readonly string[], lookup: (id: string) => T | undefined,
): Array<{ def: T; count: number }> {
  const counts = countTaken(taken);
  const out: Array<{ def: T; count: number }> = [];
  for (const [id, count] of counts) {
    const def = lookup(id);
    if (def) out.push({ def, count });
  }
  return out;
}

export function upgradeIconKey(def: Pick<UpgradeDef, 'icon'>): string {
  return `icon_${def.icon}`;
}

// ---------------------------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------------------------

export function canAffordOption(option: Pick<EventOption, 'cost'>, coins: number): boolean {
  return (option.cost ?? 0) <= coins;
}

/**
 * A chest event shows its reward options as face-down chests. The last option is always the free
 * "leave" choice (events.ts), so it becomes the button instead of a chest.
 */
export function chestLayout(event: Pick<PendingEvent, 'id' | 'options'>): { chests: EventOption[]; leave: EventOption | null } {
  if (event.id !== 'chest' || event.options.length < 2) return { chests: [], leave: null };
  return { chests: event.options.slice(0, -1).slice(0, 3), leave: event.options[event.options.length - 1] };
}

/** Icon for an event option, derived from what it does. */
export function eventOptionIcon(option: EventOption): IconKey {
  if (option.upgradeRarity) return option.upgradeRarity === 'epic' || option.upgradeRarity === 'legendary' ? 'star' : 'crown';
  for (const e of option.effects ?? []) {
    if (e.kind !== 'instant') continue;
    switch (e.action) {
      case 'grantCoins': return 'coin';
      case 'grantTower': return 'merge';
      case 'healCastle': return 'heart';
      case 'unlockSlot': return 'slot';
      case 'resetCooldowns': return 'clock';
    }
  }
  const m = option.waveModifier;
  if (m) {
    if ((m.eliteChance ?? 0) > 0) return 'elite';
    if ((m.enemyHpMult ?? 1) > 1 || (m.enemySpeedMult ?? 1) > 1) return 'curse';
    if ((m.coinMult ?? 1) > 1) return 'coin';
  }
  return 'eye';
}

// ---------------------------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------------------------

export interface PowerInfo {
  id: EmergencyPower;
  name: string;
  description: string;
  icon: IconKey;
  rarity: 'rare' | 'epic' | 'legendary';
}

export const EMERGENCY_POWERS: readonly PowerInfo[] = [
  { id: 'doubleDamage', name: 'Double Damage', description: 'All towers deal 2x damage this wave.', icon: 'damage', rarity: 'rare' },
  { id: 'freezeStart', name: 'Deep Freeze', description: 'Enemies start the wave frozen for 3 seconds.', icon: 'freeze', rarity: 'epic' },
  { id: 'legendaryTower', name: 'Legend Tower', description: 'A free level 5 tower fights for you this wave.', icon: 'crown', rarity: 'legendary' },
];

export function hasFreeSlot(slots: readonly Pick<SlotState, 'unlocked' | 'tower'>[]): boolean {
  return slots.some((s) => s.unlocked && s.tower === null);
}

/** Random tower type from the run's pool (rand in [0,1)); null for an empty pool. */
export function pickRewardTower(pool: readonly TowerId[], rand: number): TowerId | null {
  if (pool.length === 0) return null;
  const i = Math.min(pool.length - 1, Math.max(0, Math.floor(rand * pool.length)));
  return pool[i];
}

// ---------------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------------

/** Wave from which the end screen says VICTORY instead of DEFEAT. */
export const VICTORY_WAVE = 15;

export function isVictory(wave: number): boolean {
  return wave >= VICTORY_WAVE;
}

export interface ResultRow {
  key: 'wave' | 'kills' | 'merges' | 'level' | 'coins' | 'gems';
  label: string;
  icon: IconKey;
  value: number;
}

/**
 * The count-up rows of the results screen. "Wave" is the wave reached (RunStats.wave): the same
 * number the best-run record and the NEW BEST ribbon use. `gemsTotal` = banked run gems plus
 * achievement gems.
 */
export function buildResultRows(stats: RunStats, gemsTotal: number, achievementGems = 0): ResultRow[] {
  return [
    { key: 'wave', label: 'Waves survived', icon: 'castle', value: Math.max(0, Math.floor(stats.wave)) },
    { key: 'kills', label: 'Enemies defeated', icon: 'skull', value: Math.max(0, Math.floor(stats.enemiesKilled)) },
    { key: 'merges', label: 'Towers merged', icon: 'merge', value: Math.max(0, Math.floor(stats.towersMerged)) },
    { key: 'level', label: 'Highest tower level', icon: 'star', value: Math.max(0, Math.floor(stats.highestTowerLevel)) },
    { key: 'coins', label: 'Coins earned', icon: 'coin', value: Math.max(0, Math.floor(stats.coinsEarned)) },
    {
      key: 'gems', label: achievementGems > 0 ? `Gems (+${achievementGems} bonus)` : 'Gems earned', icon: 'gem',
      value: Math.max(0, Math.floor(gemsTotal)),
    },
  ];
}

/** Value shown t (0..1) through a count-up with ease-out. */
export function countUpValue(target: number, t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return Math.round(target * (1 - (1 - c) * (1 - c) * (1 - c)));
}

/** Remaining fraction of the revive countdown, 0..1. */
export function countdownFraction(left: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.min(1, Math.max(0, left / total));
}

/** Whole seconds to display for a countdown (rounds up so "0" only shows at the very end). */
export function countdownSeconds(left: number): number {
  return Math.max(0, Math.ceil(left - 1e-6));
}

// ---------------------------------------------------------------------------------------------
// Pause screen
// ---------------------------------------------------------------------------------------------

/** Slider position to a 0..1 volume snapped to `step`. */
export function sliderValue(pointerX: number, left: number, width: number, step = 0.05): number {
  if (!(width > 0)) return 0;
  const raw = Math.min(1, Math.max(0, (pointerX - left) / width));
  return Math.min(1, Math.round(Math.round(raw / step) * step * 1000) / 1000);
}

export function percentLabel(v: number): string {
  return `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`;
}
