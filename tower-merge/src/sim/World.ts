import { BALANCE } from '../data/balance';
import { CASTLE, SLOTS, UNLOCK_ORDER } from '../data/map';
import { SYNERGIES } from '../data/synergies';
import { EVENTS } from '../data/events';
import { UPGRADES } from '../data/upgrades';
import type { AbilityId, RandomEventDef, SynergyDef, TowerId, UpgradeDef, WaveModifier } from '../data/types';
import { MAX_TOWER_LEVEL, TOWER_IDS } from '../data/types';
import type {
  AbilityState, EmergencyPower, EnemyState, FireZoneState, MoveResult, PendingEvent, ProjectileState, RunOptions,
  RunPhase, RunStats, SimEvent, SlotState, TowerStatsView, WorldApi,
} from './api';
import { initAbilities, updateAbilities, useAbility } from './abilities';
import * as board from './board';
import { flushDeaths, killEnemy, updateZones } from './combat';
import { describe } from './describe';
import { updateEnemies } from './enemies';
import { applyEventOption } from './events';
import { afterEvent, afterUpgrade, beginPrewave, completeWave, startWave } from './flow';
import { FL } from './modifiers';
import { drawOffers, takeUpgrade } from './offers';
import { buildMetaEffects, buildOwnMods, refresh } from './refresh';
import { SimState } from './state';
import type { Content } from './state';
import { updateProjectiles, updateTowers } from './towerAI';
import { isBossWave, runSpawns } from './waves';

const STEP = 1 / 60;
const MAX_DT = 0.1;

/** Optional content overrides (tests pass fixtures; the game uses the data files). */
export interface WorldContent {
  upgrades?: UpgradeDef[];
  synergies?: SynergyDef[];
  events?: RandomEventDef[];
}

export class World implements WorldApi {
  private readonly s: SimState;
  private acc = 0;

  constructor(opts: RunOptions, content?: WorldContent) {
    const full: Content = {
      upgrades: content?.upgrades ?? UPGRADES,
      synergies: content?.synergies ?? SYNERGIES,
      events: content?.events ?? EVENTS,
    };
    const s = new SimState(opts, full);
    this.s = s;
    buildOwnMods(s);
    buildMetaEffects(s);
    for (const def of SLOTS) {
      s.slots.push({ id: def.id, unlocked: UNLOCK_ORDER.indexOf(def.id) < opts.startingSlots, tower: null });
    }
    refresh(s);
    s.castleHp = s.castleMaxHp;
    initAbilities(s);
    s.coins = BALANCE.economy.startCoins + opts.startCoinsBonus + (opts.daily?.startCoins ?? 0);
    s.freeRerolls = Math.max(0, opts.freeRerolls);
    const level = Math.max(1, Math.min(MAX_TOWER_LEVEL, Math.round(opts.startTowerLevel)));
    board.placeTower(s, UNLOCK_ORDER[0], 'arrow', level, board.grantedValue(level));
    refresh(s);
    beginPrewave(s, false);
  }

  // --- state ---
  get options(): RunOptions { return this.s.opts; }
  get phase(): RunPhase { return this.s.phase; }
  get wave(): number { return this.s.wave; }
  get isBossWave(): boolean { return isBossWave(this.s.wave); }
  get prewaveTime(): number { return this.s.phase === 'prewave' ? Math.max(0, this.s.prewaveTime) : 0; }
  get coins(): number { return this.s.coins; }
  get castleHp(): number { return this.s.castleHp; }
  get castleMaxHp(): number { return this.s.castleMaxHp; }
  get enemies(): readonly EnemyState[] { return this.s.enemies; }
  get projectiles(): readonly ProjectileState[] { return this.s.projectiles; }
  get fireZones(): readonly FireZoneState[] { return this.s.zones; }
  get slots(): readonly SlotState[] { return this.s.slots; }
  get abilities(): readonly AbilityState[] { return this.s.abilities; }
  get stats(): RunStats { return this.s.stats; }
  get activeSynergies(): readonly string[] { return this.s.activeSynergies; }
  get upgradeChoices(): readonly UpgradeDef[] { return this.s.upgradeChoices; }
  get pendingEvent(): PendingEvent | null { return this.s.pendingEvent; }
  get freeRerolls(): number { return this.s.freeRerolls; }
  get revived(): boolean { return this.s.revived; }
  get nextWaveModifier(): WaveModifier | null { return this.s.nextWaveMod; }

  // --- simulation ---
  update(dt: number): void {
    if (!(dt > 0)) return;
    if (this.s.phase !== 'wave' && this.s.phase !== 'prewave') return;
    this.acc += Math.min(dt, MAX_DT);
    while (this.acc >= STEP - 1e-9) {
      this.acc -= STEP;
      this.step();
      const p = this.s.phase;
      if (p !== 'wave' && p !== 'prewave') {
        this.acc = 0;
        break;
      }
    }
    if (this.s.dirty) refresh(this.s);
  }

  /**
   * Returns the events since the last call. To avoid per-frame garbage the returned array and the
   * hit / damage / explosion / chain event objects are recycled: read them synchronously (the renderer
   * does, within the frame) and copy anything you want to keep. The array stays intact until the
   * second following drainEvents() call; event objects are reused after ~500 further events of their type.
   */
  drainEvents(): SimEvent[] {
    const s = this.s;
    const out = s.events;
    if (out.length !== s.evCount) out.length = s.evCount;
    s.events = s.spareEvents;
    s.evCount = 0;
    s.spareEvents = out;
    return out;
  }

  private step(): void {
    this.stepInner();
    const s = this.s;
    if (s.towerDmgDirty) {
      s.towerDmgDirty = false;
      for (let i = 0; i < TOWER_IDS.length; i++) if (s.towerDmg[i] > 0) s.stats.towerDamage[TOWER_IDS[i]] = s.towerDmg[i];
    }
  }

  private stepInner(): void {
    const s = this.s;
    s.time += STEP;
    s.stats.timeSeconds += STEP;
    s.damageEvents = 0;
    s.hitEvents = 0;
    s.procBudget = BALANCE.caps.procsPerTick;
    s.depth = 0;
    if (s.dirty) refresh(s);
    updateAbilities(s, STEP);
    if (s.phase === 'prewave') {
      s.prewaveTime -= STEP;
      if (s.prewaveTime <= 0) startWave(s);
      return;
    }
    // --- wave tick ---
    if (s.meteorKillCd > 0) s.meteorKillCd -= STEP;
    const regen = s.gm.flags[FL.castleRegen];
    if (regen > 0 && s.castleHp < s.castleMaxHp) {
      s.regenAcc += regen * STEP;
      if (s.regenAcc >= 1) {
        const amount = Math.min(Math.floor(s.regenAcc), s.castleMaxHp - s.castleHp);
        s.regenAcc -= Math.floor(s.regenAcc);
        s.castleHp += amount;
        if (amount > 0) s.emit({ type: 'castleHealed', amount, hp: s.castleHp });
      }
    }
    const plan = s.plan;
    if (!plan) return;
    plan.elapsed += STEP;
    if (s.freezeStartLeft > 0) s.freezeStartLeft -= STEP;
    runSpawns(s, plan);
    updateEnemies(s, STEP);
    flushDeaths(s);
    if (s.phase !== 'wave') return;
    updateTowers(s, STEP);
    flushDeaths(s);
    updateProjectiles(s);
    updateZones(s, STEP);
    flushDeaths(s);
    if (s.phase === 'wave' && plan.next >= plan.entries.length && s.alive <= 0) completeWave(s);
  }

  // --- player actions ---
  buyCost(): number { return board.buyCost(this.s); }
  buyTower(): { ok: boolean; slot?: number; tower?: TowerId } { return board.buyTower(this.s); }
  moveTower(from: number, to: number): MoveResult { return board.moveTower(this.s, from, to); }
  canMerge(from: number, to: number): boolean { return board.canMerge(this.s, from, to); }
  sellValue(slot: number): number { return board.sellValue(this.s, slot); }
  sellTower(slot: number): boolean { return board.sellTower(this.s, slot); }
  unlockSlotCost(): number { return board.unlockSlotCost(this.s); }
  unlockSlot(slot: number): boolean { return board.unlockSlot(this.s, slot); }
  useAbility(id: AbilityId): boolean { return useAbility(this.s, id); }

  chooseUpgrade(id: string): boolean {
    const s = this.s;
    if (s.phase !== 'upgrade') return false;
    const up = s.upgradeChoices.find((u) => u.id === id);
    if (!up) return false;
    takeUpgrade(s, up);
    afterUpgrade(s);
    return true;
  }

  rerollUpgrades(paid = false): boolean {
    const s = this.s;
    if (s.phase !== 'upgrade') return false;
    if (paid) {
      if (s.paidRerollUsed) return false;
      s.paidRerollUsed = true;
    } else {
      if (s.freeRerolls <= 0) return false;
      s.freeRerolls--;
    }
    s.upgradeChoices = drawOffers(s, s.upgradeChoices.map((u) => u.id));
    return true;
  }

  resolveEvent(optionId: string): boolean {
    const s = this.s;
    if (!applyEventOption(s, optionId)) return false;
    afterEvent(s);
    return true;
  }

  startWaveNow(): void {
    if (this.s.phase === 'prewave') startWave(this.s);
  }

  // --- reward hooks ---
  revive(): boolean {
    const s = this.s;
    if (s.phase !== 'defeated' || s.revived) return false;
    s.revived = true;
    s.castleHp = Math.max(1, Math.round(s.castleMaxHp * BALANCE.revive.hpFraction));
    const r2 = BALANCE.revive.clearRadius * BALANCE.revive.clearRadius;
    for (const e of s.enemies) {
      if (!e.active) continue;
      if (e.isBoss) {
        e.progress = Math.max(0, e.progress - BALANCE.boss.reviveKnockback);
        e.busyTime = 0;
        e.busyAb = null;
        e.charging = false;
        e.chargeTime = 0;
        e.lane.place(e);
        continue;
      }
      const dx = e.x - CASTLE.x;
      const dy = e.y - CASTLE.y;
      if (dx * dx + dy * dy <= r2) killEnemy(s, e, null, true);
    }
    s.deathHead = 0;
    s.deathTail = 0;
    s.phase = 'wave';
    s.emit({ type: 'castleHealed', amount: s.castleHp, hp: s.castleHp });
    s.emit({ type: 'phaseChanged', phase: 'wave' });
    return true;
  }

  grantTower(type: TowerId, level: number): boolean { return board.grantTower(this.s, type, level); }

  applyEmergencyPower(power: EmergencyPower): boolean {
    const s = this.s;
    if (s.phase === 'defeated' || s.phase === 'over') return false;
    switch (power) {
      case 'doubleDamage':
        s.pendingDoubleDamage = true;
        return true;
      case 'freezeStart':
        s.pendingFreezeStart = true;
        return true;
      case 'legendaryTower':
        return board.grantTempTower(s);
    }
  }

  describeTower(slot: number): TowerStatsView | null { return describe(this.s, slot); }

  forfeit(): void {
    const s = this.s;
    if (s.phase === 'over') return;
    s.phase = 'over';
    s.emit({ type: 'phaseChanged', phase: 'over' });
    s.emit({ type: 'gameOver', wave: s.wave });
  }
}

/** Creates a run. `content` overrides the upgrade/synergy/event data (tests use fixtures). */
export function createWorld(opts: RunOptions, content?: WorldContent): World {
  return new World(opts, content);
}
