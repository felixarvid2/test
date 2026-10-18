/**
 * A static, scriptable WorldApi for overlay tests and the dev harness (no simulation). Every
 * player action is recorded in `calls`; fields are plain mutable data.
 */
import type { PendingEvent, RunOptions, RunPhase, RunStats, SlotState, WorldApi } from '../../sim/api';
import type { UpgradeDef, WaveModifier } from '../../data/types';

export function fakeRunStats(over: Partial<RunStats> = {}): RunStats {
  return {
    wave: 7, wavesCleared: 6, enemiesKilled: 142, bossesKilled: [], towersMerged: 18, towersBought: 31,
    highestTowerLevel: 4, coinsEarned: 2310, gemsEarned: 38, chainLightnings: 4, meteorsCalled: 2, abilitiesUsed: 5,
    flawlessWaves: 2, synergiesActivated: [], legendariesPicked: 0, upgradesTaken: [],
    towerKills: { arrow: 80, cannon: 62 }, towerDamage: {}, timeSeconds: 412, ...over,
  };
}

export function fakeRunOptions(over: Partial<RunOptions> = {}): RunOptions {
  return {
    seed: 1, towerPool: ['arrow', 'cannon', 'frost'], abilities: ['meteor', 'freeze'], castleHpBonus: 0, startCoinsBonus: 0,
    damagePct: 0, fireRatePct: 0, discountPct: 0, coinGainPct: 0, abilityCdPct: 0, startTowerLevel: 1, startingSlots: 4,
    freeRerolls: 0, ...over,
  };
}

export function fakeSlots(unlocked = 8, filled = 5): SlotState[] {
  return Array.from({ length: 12 }, (_, id) => ({
    id,
    unlocked: id < unlocked,
    tower: id < filled
      ? { uid: id + 1, slot: id, type: 'arrow' as const, level: 1, aim: 0, sinceAttack: 1, disabledTime: 0, kills: 0, damageDealt: 0 }
      : null,
  }));
}

export interface FakeWorldInit {
  phase: RunPhase;
  wave: number;
  coins: number;
  castleHp: number;
  castleMaxHp: number;
  stats: RunStats;
  activeSynergies: string[];
  upgradeChoices: UpgradeDef[];
  pendingEvent: PendingEvent | null;
  freeRerolls: number;
  revived: boolean;
  options: RunOptions;
  slots: SlotState[];
  /** Result of the reward hooks (to test failure paths). */
  hookResult: boolean;
}

export type FakeWorld = WorldApi & {
  calls: string[];
  /** Mutable copies of the readonly API fields. */
  state: { -readonly [K in keyof FakeWorldInit]: FakeWorldInit[K] };
  /** What rerollUpgrades() shows next (the sim picks new choices). */
  nextChoices: UpgradeDef[] | null;
};

export function createFakeWorld(over: Partial<FakeWorldInit> = {}): FakeWorld {
  const state: FakeWorld['state'] = {
    phase: 'upgrade', wave: 5, coins: 120, castleHp: 80, castleMaxHp: 100, stats: fakeRunStats(), activeSynergies: [],
    upgradeChoices: [], pendingEvent: null, freeRerolls: 0, revived: false, options: fakeRunOptions(), slots: fakeSlots(),
    hookResult: true, ...over,
  };
  const calls: string[] = [];
  const noModifier: WaveModifier | null = null;

  const world: Partial<WorldApi> & { calls: string[]; state: FakeWorld['state']; nextChoices: UpgradeDef[] | null } = {
    calls, state, nextChoices: null,
    get options() { return state.options; },
    get phase() { return state.phase; },
    get wave() { return state.wave; },
    get isBossWave() { return state.wave % 5 === 0; },
    get prewaveTime() { return 0; },
    get coins() { return state.coins; },
    get castleHp() { return state.castleHp; },
    get castleMaxHp() { return state.castleMaxHp; },
    get enemies() { return []; },
    get projectiles() { return []; },
    get fireZones() { return []; },
    get slots() { return state.slots; },
    get abilities() { return []; },
    get stats() { return state.stats; },
    get activeSynergies() { return state.activeSynergies; },
    get upgradeChoices() { return state.upgradeChoices; },
    get pendingEvent() { return state.pendingEvent; },
    get freeRerolls() { return state.freeRerolls; },
    get revived() { return state.revived; },
    get nextWaveModifier() { return noModifier; },
    update() { /* static */ },
    drainEvents() { return []; },
    chooseUpgrade(id: string) {
      calls.push(`chooseUpgrade:${id}`);
      if (!state.upgradeChoices.some((u) => u.id === id)) return false;
      state.stats.upgradesTaken.push(id);
      state.phase = 'prewave';
      return true;
    },
    rerollUpgrades(paid?: boolean) {
      calls.push(`rerollUpgrades:${paid ? 'paid' : 'free'}`);
      if (!paid) {
        if (state.freeRerolls <= 0) return false;
        state.freeRerolls -= 1;
      }
      if (world.nextChoices) state.upgradeChoices = world.nextChoices;
      return true;
    },
    resolveEvent(optionId: string) {
      calls.push(`resolveEvent:${optionId}`);
      const opt = state.pendingEvent?.options.find((o) => o.id === optionId);
      if (!opt || (opt.cost ?? 0) > state.coins) return false;
      state.coins -= opt.cost ?? 0;
      state.pendingEvent = null;
      state.phase = 'prewave';
      return true;
    },
    revive() {
      calls.push('revive');
      if (!state.hookResult) return false;
      state.revived = true;
      state.phase = 'prewave';
      return true;
    },
    grantTower(type, level) {
      calls.push(`grantTower:${type}:${level}`);
      return state.hookResult;
    },
    applyEmergencyPower(power) {
      calls.push(`applyEmergencyPower:${power}`);
      return state.hookResult;
    },
    forfeit() {
      calls.push('forfeit');
      state.phase = 'over';
    },
    describeTower() { return null; },
  };
  return world as unknown as FakeWorld;
}
