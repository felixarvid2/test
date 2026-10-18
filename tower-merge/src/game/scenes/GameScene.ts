import Phaser from 'phaser';
import { BALANCE } from '../../data/balance';
import { BOSSES } from '../../data/bosses';
import { CASTLE, PATH, SLOTS } from '../../data/map';
import { SYNERGIES } from '../../data/synergies';
import type { AbilityId } from '../../data/types';
import { buildRunOptions } from '../../core/meta';
import { services, onHostPause } from '../../services';
import type { SimEvent, WorldApi } from '../../sim/api';
import { createWorld } from '../../sim/World';
import { bossForWave } from '../../sim/waves';
import { BoardView } from '../play/BoardView';
import { BossBar } from '../play/BossBar';
import { D, ENEMY_COLORS, ENEMY_SIZE } from '../play/constants';
import { DamageNumbers } from '../play/DamageNumbers';
import { clearDebugHooks, installDebugHooks, readFlags, startStress } from '../play/debugHooks';
import { DragController, type DragHost } from '../play/DragController';
import { Effects } from '../play/Effects';
import { EnemyLayer } from '../play/EnemyView';
import { Hud } from '../play/Hud';
import {
  QualityMeter, nearestSlot, overlayForPhase, shouldOfferEmergency, shouldOfferRareTower, tutorialStep, type SlotPos,
} from '../play/logic';
import { MergeFx, popText } from '../play/MergeFx';
import { FireZoneLayer, ProjectileLayer } from '../play/ProjectileView';
import { ShopBar } from '../play/ShopBar';
import { Telegraphs } from '../play/Telegraphs';
import { ensurePlayTextures } from '../play/textures';
import { TowerInfo } from '../play/TowerInfo';
import { TowerLayer } from '../play/TowerView';
import { Tutorial } from '../play/Tutorial';
import {
  PALETTE, RARITY_COLORS, TOWER_COLORS, W, fadeIn, fitText, showBanner, showToast,
} from '../ui';
import { OverlayEvents, type GameSceneData, type RunContext } from './contracts';
import { SceneKeys } from './keys';

const SLOT_POS: readonly SlotPos[] = SLOTS.map((s) => ({ id: s.id, x: s.x, y: s.y }));
const MAX_COINS_IN_FLIGHT = 26;
const BOSS_ICON: Record<string, string> = { goblinKing: 'icon_crown', stoneGolem: 'icon_golem', dragon: 'icon_dragon' };

interface PendingReward {
  kind: 'rareTower' | 'emergencyPower';
  wave: number;
  at: number;
}

/**
 * The core gameplay scene: owns the World, renders it (board, towers, enemies, projectiles, effects,
 * HUD, shop bar), forwards input (tap, drag-and-drop merging) and drives the overlay flow of
 * contracts.ts. The simulation is stepped here; visuals only read it and react to its events.
 */
export class GameScene extends Phaser.Scene {
  private sceneData: GameSceneData = {};
  private world!: WorldApi;
  private runId = '';
  private speed = 1;
  private animTime = 0;
  private frameNo = 0;

  private overlay: string | null = null;
  private hostPaused = false;
  private phaseSerial = 0;
  private launchedSerial = -1;
  private overlayRetry = 0;
  private emergencyOffered = false;
  private pendingRewards: PendingReward[] = [];
  private cleanups: Array<() => void> = [];
  private ended = false;
  private tutorialDone = false;

  private quality = new QualityMeter();
  private fx!: Effects;
  private board!: BoardView;
  private towers!: TowerLayer;
  private enemies!: EnemyLayer;
  private projectiles!: ProjectileLayer;
  private zones!: FireZoneLayer;
  private dmg!: DamageNumbers;
  private hud!: Hud;
  private shop!: ShopBar;
  private bossBar!: BossBar;
  private tele!: Telegraphs;
  private tutorial!: Tutorial;
  private drag!: DragController;
  private merge!: MergeFx;
  private info!: TowerInfo;
  private freezeTint!: Phaser.GameObjects.Rectangle;

  private coinsInFlight = 0;
  private hitBudget = 0;
  private deathBudget = 0;
  private lastFpsLog = 0;
  private stopStress: (() => void) | null = null;
  private bossWaveMusic = false;
  private stressFlag = false;
  private synergyQueue: string[] = [];
  private synergyCooldown = 0;

  constructor() {
    super(SceneKeys.Game);
  }

  init(data: GameSceneData): void {
    this.sceneData = data ?? {};
    this.speed = 1;
    this.animTime = 0;
    this.overlay = null;
    this.hostPaused = false;
    this.phaseSerial = 0;
    this.launchedSerial = -1;
    this.overlayRetry = 0;
    this.emergencyOffered = false;
    this.pendingRewards = [];
    this.cleanups = [];
    this.ended = false;
    this.tutorialDone = false;
    this.coinsInFlight = 0;
    this.bossWaveMusic = false;
    this.synergyQueue = [];
    this.synergyCooldown = 0;
    this.quality = new QualityMeter();
  }

  // ---------------------------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------------------------

  create(): void {
    fadeIn(this);
    ensurePlayTextures(this);
    this.cameras.main.setBackgroundColor(0x16301a);
    const flags = readFlags();
    this.stressFlag = flags.stress;
    if (flags.quality !== null) this.quality.lock(flags.quality);

    const daily = this.sceneData.daily;
    const seed = daily ? daily.seed : Date.now();
    this.runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    this.world = createWorld(buildRunOptions(services.save.data, { seed, daily }));

    this.fx = new Effects(this, this.quality);
    this.board = new BoardView(this, this.fx);
    this.towers = new TowerLayer(this, this.fx);
    this.enemies = new EnemyLayer(this, this.fx, this.quality);
    this.projectiles = new ProjectileLayer(this, this.fx, this.quality);
    this.zones = new FireZoneLayer(this);
    this.dmg = new DamageNumbers(this, this.quality);
    this.tele = new Telegraphs(this, this.enemies);
    this.merge = new MergeFx(this, this.fx, this.towers, () => this.world);
    this.info = new TowerInfo(this, () => this.world, (slot) => this.sell(slot));
    this.hud = new Hud(this, { openPause: () => this.openPause() });
    this.bossBar = new BossBar(this);
    this.shop = new ShopBar(this, {
      buy: () => this.buy(),
      startWave: () => this.startWave(),
      useAbility: (id) => this.useAbility(id),
      toggleSpeed: () => this.toggleSpeed(),
      denied: (what) => this.denied(what),
    });
    this.tutorial = new Tutorial(this, () => this.shop.buyPoint());
    this.freezeTint = this.add.rectangle(360, 640, 720, 1280, 0x7fdcff, 0.0).setScrollFactor(0).setDepth(D.fxTop + 1).setVisible(false);

    const host: DragHost = {
      scene: this,
      fx: this.fx,
      layer: this.towers,
      world: () => this.world,
      flush: () => this.flush(),
      canEdit: () => this.canEdit(),
      onBoardPress: (x, y) => this.onBoardPress(x, y),
      onTowerTap: (slot) => this.onTowerTap(slot),
      onLift: () => this.info.hide(),
      isUiHit: (x, y) => this.info.contains(x, y),
    };
    this.drag = new DragController(host);

    installDebugHooks(this.game, this, () => this.world, (n) => this.setSpeed(n));

    this.wireOverlayEvents();
    services.audio.playMusic('music_battle');
    this.flush();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());

    if (flags.stress) {
      void startStress(this.world, (m) => console.log(`[stress] ${m}`)).then((stop) => { this.stopStress = stop; });
    }
  }

  private wireOverlayEvents(): void {
    const onClosed = (): void => {
      this.overlay = null;
      if (this.scene.isPaused()) this.scene.resume();
      if (overlayForPhase(this.world.phase) && ++this.overlayRetry <= 2) this.launchedSerial = -1;
    };
    const onRestart = (): void => {
      if (this.scene.isPaused()) this.scene.resume();
      this.scene.restart(this.sceneData);
    };
    this.events.on(OverlayEvents.Closed, onClosed);
    this.events.on(OverlayEvents.Restart, onRestart);
    this.cleanups.push(() => {
      this.events.off(OverlayEvents.Closed, onClosed);
      this.events.off(OverlayEvents.Restart, onRestart);
    });
    try {
      const off = onHostPause(() => { if (this.world.phase === 'wave' || this.world.phase === 'prewave') this.openPause(); });
      this.cleanups.push(off);
    } catch { /* platform not ready (tests) */ }
  }

  private teardown(): void {
    for (const c of this.cleanups) c();
    this.cleanups = [];
    this.stopStress?.();
    this.stopStress = null;
    clearDebugHooks(this);
    this.drag?.destroy();
    this.fx?.clear();
  }

  // ---------------------------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------------------------

  update(_time: number, delta: number): void {
    const real = Math.min(delta / 1000, 0.1);
    this.frameNo++;
    this.quality.push(delta);
    this.animTime += real;
    this.fx.update(real);
    this.dmg.beginFrame();
    this.hitBudget = this.quality.preset.hitSparks ? 10 : 3;
    this.deathBudget = this.quality.preset.hitSparks ? 14 : 5;

    const frozen = this.overlay !== null || this.hostPaused;
    if (!frozen && this.fx.hitstopLeft <= 0) {
      const sim = real * this.speed * this.fx.timeScale;
      if (sim > 0) this.world.update(sim);
    }
    this.flush();

    const world = this.world;
    const t = this.animTime;
    const vdt = real * this.fx.timeScale;
    const frenzy = world.abilities.some((a) => a.id === 'frenzy' && a.activeTime > 0);
    this.towers.update(world.slots, t, real, frenzy);
    this.enemies.update(world, t, vdt);
    this.projectiles.update(world, t, vdt);
    this.zones.update(world, t);
    this.dmg.update(real);
    this.board.update(world, t, real);
    this.tele.update(world, vdt, t);
    this.hud.update(world, real, t);
    this.shop.update(world, real, t, this.speed);
    this.bossBar.update(this.enemies.boss(world), real, t);
    this.info.update();
    if (this.drag.active && !this.canEdit()) this.drag.cancel();
    this.drag.update(real, t);
    this.updateFreezeTint(world, t);
    this.updateTutorial(real);
    this.updateSynergyQueue(real);
    this.watchPhase();
    this.processRewards();
    this.logStress(t);
  }

  private updateFreezeTint(world: WorldApi, t: number): void {
    const f = world.abilities.find((a) => a.id === 'freeze');
    const on = !!f && f.activeTime > 0;
    this.freezeTint.setVisible(on);
    if (on) this.freezeTint.setFillStyle(0x7fdcff, 0.1 + 0.05 * Math.sin(t * 6));
  }

  private logStress(t: number): void {
    if (!this.stressFlag || t - this.lastFpsLog < 2) return;
    this.lastFpsLog = t;
    let n = 0;
    for (const e of this.world.enemies) if (e.active) n++;
    console.log(`[stress] fps=${this.quality.fps.toFixed(1)} quality=${this.quality.level} enemies=${n} projectiles=${this.world.projectiles.filter((p) => p.active).length}`);
  }

  // ---------------------------------------------------------------------------------------------
  // State queries
  // ---------------------------------------------------------------------------------------------

  private canEdit(): boolean {
    const p = this.world.phase;
    return this.overlay === null && !this.hostPaused && (p === 'prewave' || p === 'wave');
  }

  private hasFreeSlot(): boolean {
    return this.world.slots.some((s) => s.unlocked && !s.tower);
  }

  // ---------------------------------------------------------------------------------------------
  // Player actions
  // ---------------------------------------------------------------------------------------------

  private buy(): void {
    if (!this.canEdit()) return;
    const w = this.world;
    if (!this.hasFreeSlot()) { this.denied('full'); return; }
    if (w.coins < w.buyCost()) { this.denied('coins'); return; }
    const r = w.buyTower();
    this.flush();
    if (r.ok) this.fx.sfx('buy');
    else this.denied('coins');
  }

  private denied(what: 'coins' | 'ability' | 'full'): void {
    this.fx.sfx('invalid');
    if (what === 'coins') {
      this.shop.shake('buy');
      showToast(this, 'Not enough coins', { kind: 'danger', icon: 'icon_coin', duration: 1100 });
    } else if (what === 'full') {
      this.shop.shake('buy');
      showToast(this, 'Board full - merge towers!', { kind: 'danger', duration: 1300 });
    }
  }

  private startWave(): void {
    if (this.overlay !== null) return;
    this.world.startWaveNow();
    this.flush();
  }

  private useAbility(id: AbilityId): boolean {
    if (!this.canEdit()) return false;
    const ok = this.world.useAbility(id);
    this.flush();
    return ok;
  }

  private setSpeed(n: number): void {
    this.speed = Math.max(0.25, Math.min(8, Number(n) || 1));
  }

  private toggleSpeed(): number {
    this.speed = this.speed >= 2 ? 1 : 2;
    return this.speed;
  }

  private sell(slot: number): void {
    if (!this.canEdit()) return;
    this.world.sellTower(slot);
    this.flush();
    this.info.hide();
  }

  private onBoardPress(x: number, y: number): void {
    const world = this.world;
    const locked = this.board.lockedSlotAt(world, x, y);
    if (locked >= 0) {
      this.info.hide();
      const cost = world.unlockSlotCost();
      if (world.unlockSlot(locked)) {
        this.flush();
      } else {
        this.board.denied(locked);
        this.fx.sfx('invalid');
        this.fx.shake(3, 120);
        showToast(this, Number.isFinite(cost) ? `Need ${cost} coins to unlock` : 'Nothing to unlock', { kind: 'danger', icon: 'icon_lock', duration: 1200 });
      }
      return;
    }
    if (this.info.open) this.info.hide();
  }

  private onTowerTap(slot: number): void {
    if (this.info.open && this.info.selectedSlot === slot) { this.info.hide(); return; }
    this.fx.sfx('click', { volume: 0.5 });
    this.info.show(slot);
  }

  // ---------------------------------------------------------------------------------------------
  // Overlays
  // ---------------------------------------------------------------------------------------------

  private context(): RunContext {
    const d = this.sceneData.daily;
    return { world: this.world, runId: this.runId, daily: d ? { key: d.key, modifiers: d.modifiers } : undefined };
  }

  private launch(key: string, extra?: object): void {
    this.drag.cancel();
    this.info.hide();
    this.overlay = key;
    this.scene.launch(key, { ...this.context(), ...extra });
    this.scene.bringToTop(key);
  }

  private openPause(): void {
    if (this.overlay !== null || this.ended) return;
    this.launch(SceneKeys.Pause);
    // freeze tweens and particles too: the overlay is a full pause
    this.scene.pause();
  }

  private watchPhase(): void {
    if (this.overlay !== null) return;
    const phase = this.world.phase;
    if (phase === 'defeated' || phase === 'over') this.markTutorialDone();
    const want = overlayForPhase(phase);
    if (!want || this.launchedSerial === this.phaseSerial) return;
    this.launchedSerial = this.phaseSerial;
    this.launch(want === 'Upgrade' ? SceneKeys.Upgrade : want === 'Event' ? SceneKeys.Event : SceneKeys.GameOver);
  }

  private processRewards(): void {
    if (this.overlay !== null || this.pendingRewards.length === 0) return;
    const p = this.world.phase;
    if (p !== 'wave' && p !== 'prewave') return;
    const now = this.animTime;
    const i = this.pendingRewards.findIndex((r) => r.at <= now);
    if (i < 0) return;
    const r = this.pendingRewards.splice(i, 1)[0];
    this.launch(SceneKeys.Reward, { kind: r.kind, wave: r.wave });
  }

  private queueRareTower(wave: number): void {
    const gate = services.rewards.quote('rareTower', { runId: this.runId, key: `boss-${wave}` }).gate;
    if (!shouldOfferRareTower(gate, this.hasFreeSlot())) return;
    this.pendingRewards.push({ kind: 'rareTower', wave, at: this.animTime + 1.6 });
  }

  private queueEmergency(wave: number): void {
    const gate = services.rewards.quote('emergencyPower', { runId: this.runId }).gate;
    if (!shouldOfferEmergency(gate, true, this.emergencyOffered)) return;
    this.emergencyOffered = true;
    this.pendingRewards.push({ kind: 'emergencyPower', wave, at: this.animTime + 1.7 });
  }

  private markTutorialDone(): void {
    if (this.tutorialDone) return;
    this.tutorialDone = true;
    try {
      if (!services.save.data.tutorial.firstRunDone) void services.save.update((d) => { d.tutorial.firstRunDone = true; });
    } catch { /* save unavailable */ }
  }

  // ---------------------------------------------------------------------------------------------
  // Tutorial
  // ---------------------------------------------------------------------------------------------

  private updateTutorial(dt: number): void {
    const w = this.world;
    let step = 'none' as ReturnType<typeof tutorialStep>;
    try {
      const t = services.save.data.tutorial;
      if (!t.firstRunDone && this.overlay === null && (w.phase === 'prewave' || w.phase === 'wave')) {
        step = tutorialStep({
          firstRunDone: t.firstRunDone,
          mergeHintShown: t.mergeHintShown,
          towersBought: w.stats.towersBought,
          towersMerged: w.stats.towersMerged,
          coins: w.coins,
          buyCost: w.buyCost(),
          hasFreeSlot: this.hasFreeSlot(),
          hasPair: Tutorial.findPair(w) !== null,
        });
        if (step === 'merge' && !t.mergeHintShown) void services.save.update((d) => { d.tutorial.mergeHintShown = true; });
      }
    } catch { /* tutorial is optional */ }
    this.shop.emphasizeBuy = step === 'buy';
    this.tutorial.update(step, w, dt, this.drag.dragging);
  }

  // ---------------------------------------------------------------------------------------------
  // Event dispatch
  // ---------------------------------------------------------------------------------------------

  private flush(): void {
    const events = this.world.drainEvents();
    for (let i = 0; i < events.length; i++) this.handle(events[i]);
  }

  private slotAt(x: number, y: number): number {
    return nearestSlot(x, y, SLOT_POS, 46);
  }

  private handle(ev: SimEvent): void {
    const fx = this.fx;
    switch (ev.type) {
      case 'shot': {
        const view = this.towers.views[ev.slot];
        const angle = Math.atan2(ev.ty - ev.y, ev.tx - ev.x);
        view?.recoil(angle);
        if (view) {
          const m = view.muzzle(angle);
          const c = TOWER_COLORS[ev.tower] ?? 0xffffff;
          fx.glow(m.x, m.y, c, 18, 54, 110, 0.9);
          if (this.quality.preset.hitSparks) fx.sparks(m.x, m.y, c, 2);
        }
        fx.sfx(`shoot_${ev.tower}` as 'shoot_arrow', { volume: 0.32 });
        break;
      }
      case 'beam': {
        const slot = this.slotAt(ev.x, ev.y);
        const view = slot >= 0 ? this.towers.views[slot] : undefined;
        const angle = Math.atan2(ev.ty - ev.y, ev.tx - ev.x);
        view?.recoil(angle);
        const m = view ? view.muzzle(angle) : { x: ev.x, y: ev.y - 60 };
        fx.beam(m.x, m.y, ev.tx, ev.ty, TOWER_COLORS[ev.tower] ?? 0xc084fc, ev.crit);
        fx.glow(m.x, m.y, 0xffffff, 20, 70, 120, 0.9);
        fx.sfx('shoot_sniper', { volume: 0.55 });
        break;
      }
      case 'chain': {
        fx.chain(ev.points, 0xfff07a);
        fx.sfx('shoot_lightning', { volume: 0.4 });
        break;
      }
      case 'cone': {
        const slot = this.slotAt(ev.x, ev.y);
        const view = slot >= 0 ? this.towers.views[slot] : undefined;
        view?.recoil(ev.angle);
        const m = view ? view.muzzle(ev.angle) : { x: ev.x, y: ev.y - 50 };
        fx.cone(m.x, m.y + 8, ev.angle, ev.range);
        fx.sfx('shoot_fire', { volume: 0.3 });
        break;
      }
      case 'hit':
        if (this.hitBudget > 0) {
          this.hitBudget--;
          fx.impact(ev.x, ev.y, ev.tower ? TOWER_COLORS[ev.tower] ?? 0xffffff : 0xffffff, ev.kind === 'cannonball' ? 44 : 28);
        }
        break;
      case 'damage':
        this.dmg.spawn(ev.x, ev.y, ev.amount, ev.crit);
        break;
      case 'explosion':
        fx.explosion(ev.x, ev.y, ev.radius, ev.element);
        break;
      case 'status': {
        const e = this.enemies.find(this.world, ev.enemyId);
        if (!e) break;
        if (ev.status === 'freeze') {
          fx.stars(e.x, e.y - 14, 0xbfeeff, 8);
          fx.sparks(e.x, e.y - 14, 0xffffff, 6);
          fx.ring(e.x, e.y - 10, 0x9fe4ff, 20, 80, 260, 0.9);
          fx.sfx('freeze', { volume: 0.6 });
        } else if (ev.status === 'stun') {
          fx.stars(e.x, e.y - 30, 0xffe14d, 4);
        } else if (ev.status === 'execute') {
          fx.anim('icon_skull', e.x, e.y - 20, 28, 84, 1, 0, 0.7, 0xffffff, { ty: e.y - 70, additive: false, depth: D.fxTop });
          fx.sparks(e.x, e.y - 10, 0xc084fc, 10);
        }
        break;
      }
      case 'enemySpawned':
        if (this.quality.preset.hitSparks) {
          if (ev.y < PATH[0].y + 40 && Math.abs(ev.x - PATH[0].x) < 60) fx.sparks(ev.x, PATH[0].y + 20, 0xc77dff, 2);
          else { fx.puffs(ev.x, ev.y, 3, 0xb78bd8); fx.sparks(ev.x, ev.y, 0xe0b0ff, 4); }
        }
        break;
      case 'enemyDied':
        this.onEnemyDied(ev);
        break;
      case 'enemyHealed':
        if (this.hitBudget > 0) { this.hitBudget--; fx.pluses(ev.x, ev.y - 20, 2); }
        break;
      case 'castleHit': {
        this.board.castleHit();
        fx.shake(Math.min(10, 5 + ev.damage * 0.25), 260);
        fx.sfx('castle_hit', { volume: 0.9 });
        fx.sparks(CASTLE.x + (Math.random() - 0.5) * 80, CASTLE.y - 10, 0xff5a4f, 6);
        fx.puffs(CASTLE.x, CASTLE.y - 20, 3, 0x8a7f78);
        popText(this, CASTLE.x + (Math.random() - 0.5) * 60, CASTLE.y - 60, `-${Math.round(ev.damage)}`, 34, 0xff5a4f, 50, 380);
        break;
      }
      case 'castleHealed':
        this.board.castleHeal();
        fx.pluses(CASTLE.x, CASTLE.y - 10, 10);
        fx.glow(CASTLE.x, CASTLE.y - 20, 0x7dff8a, 80, 260, 420, 0.7);
        break;
      case 'coins':
        this.onCoins(ev);
        break;
      case 'towerPlaced': {
        const v = this.towers.views[ev.slot];
        v.markDrop();
        const a = v.anchor();
        this.time.delayedCall(330, () => { fx.dust(a.x, a.y + 14, 3); fx.ring(a.x, a.y + 6, 0xffffff, 30, 110, 260, 0.5); });
        break;
      }
      case 'merged':
        this.merge.play(ev, this.drag.takeFlyer());
        break;
      case 'towerSold': {
        const v = this.towers.views[ev.slot];
        const a = v.anchor();
        fx.puffs(a.x, a.y - 30, 6, 0xe8dcc0);
        fx.sparks(a.x, a.y - 30, 0xffd35e, 8);
        if (ev.refund > 0) popText(this, a.x, a.y - 90, `+${ev.refund}`, 38, 0xffd35e, 60, 380);
        fx.sfx('sell');
        break;
      }
      case 'slotUnlocked':
        this.board.unlocked(ev.slot);
        fx.sfx('unlock');
        break;
      case 'towerDisabled': {
        const v = this.towers.views[ev.slot];
        const a = v.anchor();
        fx.ring(a.x, a.y - 40, 0xff4a3f, 40, 190, 380, 0.9);
        fx.puffs(a.x, a.y - 50, 6, 0x6a6a76);
        fx.shake(4, 160);
        break;
      }
      case 'waveStart':
        this.onWaveStart(ev);
        break;
      case 'waveCleared':
        this.onWaveCleared(ev);
        break;
      case 'bossSpawned': {
        fx.sfx('boss_roar');
        fx.shake(8, 420);
        fx.flash(0xff2a2a, 0.3, 320);
        const b = this.banner(ev.name.toUpperCase(), { sub: ev.title, color: 0x8a1c26, duration: 2100, y: 330 }, BOSS_ICON[ev.boss]);
        void b;
        break;
      }
      case 'bossPhase': {
        const boss = this.enemies.boss(this.world);
        if (boss) {
          fx.ring(boss.x, boss.y, 0xff5a4f, 60, 300, 520, 0.9);
          fx.glow(boss.x, boss.y - 20, 0xff4a3a, 120, 340, 380, 0.8);
        }
        fx.shake(6, 260);
        if (ev.announce) this.banner(ev.announce, { color: 0x8a1c26, duration: 1500, y: 330 });
        break;
      }
      case 'bossTelegraph':
        if (!this.tele.add(ev)) {
          const c = ev.ability === 'haste' ? 0xffe14d : ev.ability === 'shieldAllies' ? 0x8fd8ff : ev.ability === 'armorUp' ? 0xcfd2e0 : 0xc77dff;
          fx.ring(ev.x, ev.y, c, 40, 220, 600, 0.85);
        }
        fx.sfx('boss_warning', { volume: 0.5 });
        break;
      case 'bossAbility': {
        const c = ev.ability === 'haste' ? 0xffe14d : ev.ability === 'shieldAllies' ? 0x8fd8ff : ev.ability === 'armorUp' ? 0xcfd2e0 : ev.ability === 'summon' ? 0xc77dff : 0xff7a3a;
        fx.ring(ev.x, ev.y, c, 30, 190, 420, 0.9);
        fx.sparks(ev.x, ev.y, c, 8);
        break;
      }
      case 'bossDefeated':
        this.onBossDefeated(ev);
        break;
      case 'synergyActivated': this.onSynergy(ev); break;
      case 'abilityUsed':
        this.onAbility(ev);
        break;
      case 'meteor':
        this.tele.meteor(ev.x, ev.y, ev.radius, BALANCE.abilities.meteor.flightTime);
        break;
      case 'upgradePicked':
        fx.flash(RARITY_COLORS[ev.rarity], 0.22, 240);
        break;
      case 'phaseChanged':
        this.phaseSerial++;
        this.overlayRetry = 0;
        if (ev.phase === 'prewave') this.onPrewave();
        if (ev.phase === 'defeated') { this.drag.cancel(); this.info.hide(); }
        break;
      case 'gameOver':
        this.ended = true;
        this.markTutorialDone();
        break;
      default:
    }
  }

  private banner(title: string, opts: { sub?: string; color?: number; duration?: number; y?: number }, icon?: string): Phaser.GameObjects.Container {
    const c = showBanner(this, title, opts);
    if (icon && this.textures.exists(icon)) {
      c.add(this.add.image(-W / 2 + 64, 0, icon).setDisplaySize(84, 84));
      c.add(this.add.image(W / 2 - 64, 0, icon).setDisplaySize(84, 84).setFlipX(true));
    }
    const label = c.list[1] as Phaser.GameObjects.Text;
    if (label && typeof label.setText === 'function') fitText(label, icon ? W - 250 : W - 60);
    return c;
  }

  private onPrewave(): void {
    const w = this.world;
    this.setBossMusic(false);
    if (w.isBossWave) {
      const boss = bossForWave(w.wave);
      const def = BOSSES[boss.id];
      this.fx.sfx('boss_warning');
      this.fx.flash(0xff2a2a, 0.18, 400);
      this.banner('BOSS INCOMING', { sub: def.name, color: 0xc0262e, duration: 1900, y: 340 }, BOSS_ICON[boss.id]);
      this.queueEmergency(w.wave);
    }
  }

  private setBossMusic(on: boolean): void {
    if (on === this.bossWaveMusic) return;
    this.bossWaveMusic = on;
    services.audio.playMusic(on ? 'music_boss' : 'music_battle');
  }

  private onWaveStart(ev: Extract<SimEvent, { type: 'waveStart' }>): void {
    this.fx.sfx('wave_start');
    if (ev.isBoss) {
      this.setBossMusic(true);
    } else {
      this.banner(`WAVE ${ev.wave}`, { color: PALETTE.infoDark, duration: 1000, y: 360 });
    }
  }

  private onWaveCleared(ev: Extract<SimEvent, { type: 'waveCleared' }>): void {
    this.fx.sfx('wave_clear');
    this.setBossMusic(false);
    this.fx.flash(0xffffff, 0.14, 240);
    this.banner(`WAVE ${ev.wave} CLEARED!`, { color: PALETTE.successDark, duration: 1100, y: 360 });
    if (ev.flawless) {
      showToast(this, `PERFECT DEFENSE +${ev.bonus}`, { kind: 'gold', icon: 'icon_star', duration: 1700, y: 200 });
    }
  }

  /** Several synergies can switch on at once: announce them one after another. */
  private onSynergy(ev: Extract<SimEvent, { type: 'synergyActivated' }>): void {
    this.synergyQueue.push(ev.id);
    // let a merge celebration play out before the banner covers the board
    this.synergyCooldown = Math.max(this.synergyCooldown, 1.0);
  }

  private updateSynergyQueue(dt: number): void {
    if (this.synergyCooldown > 0) { this.synergyCooldown -= dt; return; }
    if (this.synergyQueue.length === 0 || this.overlay !== null) return;
    this.synergyCooldown = this.synergyQueue.length > 1 ? 1.1 : 2;
    this.announceSynergy(this.synergyQueue.shift() as string);
  }

  private announceSynergy(id: string): void {
    const ev = { id, name: id };
    const def = SYNERGIES.find((s) => s.id === id);
    this.fx.sfx('synergy');
    this.fx.flash(0xb35cff, 0.25, 300);
    this.fx.stars(360, 420, 0xe0b0ff, 14);
    this.fx.ring(360, 420, 0xb35cff, 60, 420, 600, 0.8);
    this.banner('SYNERGY!', { sub: def?.name ?? ev.name, color: 0x6a2fb8, duration: 2200, y: 560 }, def ? `icon_${def.icon}` : undefined);
    if (def) showToast(this, def.description, { kind: 'info', icon: `icon_${def.icon}`, duration: 2400, y: 975 });
  }

  private onCoins(ev: Extract<SimEvent, { type: 'coins' }>): void {
    this.fx.sfx('coin', { volume: 0.5 });
    if (ev.x === undefined || ev.y === undefined) { this.hud.coinArrived(); return; }
    if (this.coinsInFlight >= MAX_COINS_IN_FLIGHT || !this.quality.preset.hitSparks && this.coinsInFlight > 8) return;
    const pt = this.hud.coinPoint();
    this.coinsInFlight++;
    const amount = ev.amount;
    this.hud.holdCoins(amount);
    this.fx.anim('fx_coin', ev.x, ev.y - 10, 30, 22, 1, 1, 0.55 + Math.random() * 0.2, 0xffffff, {
      tx: pt.x, ty: pt.y, arc: 30 + Math.random() * 60, ease: 2, additive: false, depth: D.dmg + 3, rot1: 6,
      done: () => { this.coinsInFlight--; this.hud.releaseCoins(amount); this.hud.coinArrived(); },
    });
  }

  private onEnemyDied(ev: Extract<SimEvent, { type: 'enemyDied' }>): void {
    const fx = this.fx;
    const col = ENEMY_COLORS[ev.kind] ?? 0xffffff;
    const size = ENEMY_SIZE[ev.kind] ?? 56;
    fx.sfx('enemy_die', { volume: 0.5 });
    if (ev.isBoss) return; // the boss sequence handles it
    if (this.deathBudget <= 0) return;
    this.deathBudget--;
    const key = `enemy_${ev.kind}`;
    fx.anim(key, ev.x, ev.y - size * 0.3, size, size * 1.35, 1, 0, 0.22, 0xffffff, { additive: false, depth: D.fx });
    fx.glow(ev.x, ev.y - size * 0.3, 0xffffff, size * 0.8, size * 1.8, 150, 0.8);
    fx.puffs(ev.x, ev.y - 4, ev.elite ? 5 : 3, 0xd8d0c0);
    fx.sparks(ev.x, ev.y - size * 0.3, col, ev.elite ? 14 : 7);
    if (ev.elite) {
      fx.stars(ev.x, ev.y - size * 0.3, 0xffd24a, 8);
      fx.ring(ev.x, ev.y - size * 0.3, 0xffd24a, 30, 120, 320, 0.9);
    }
  }

  private onBossDefeated(ev: Extract<SimEvent, { type: 'bossDefeated' }>): void {
    const fx = this.fx;
    fx.slowmo(0.3, 600);
    fx.sfx('boss_die');
    fx.flash(0xffffff, 0.6, 360);
    fx.shake(14, 800);
    for (let i = 0; i < 8; i++) {
      this.time.delayedCall(i * 85, () => {
        const x = ev.x + (Math.random() - 0.5) * 170;
        const y = ev.y + (Math.random() - 0.5) * 120;
        fx.explosion(x, y, 50 + Math.random() * 45, i % 2 ? 'fire' : 'physical');
        if (i % 3 === 0) fx.flash(0xffe0b0, 0.25, 140);
      });
    }
    this.time.delayedCall(650, () => {
      fx.ring(ev.x, ev.y, 0xffd35e, 80, 560, 700, 1);
      fx.stars(ev.x, ev.y, 0xffd35e, 36);
      fx.glow(ev.x, ev.y, 0xffe58a, 200, 600, 500, 0.9);
    });
    const gems = Math.min(12, Math.max(0, ev.gems));
    for (let i = 0; i < gems; i++) {
      fx.anim('icon_gem', ev.x, ev.y, 30, 46, 1, 1, 0.9 + Math.random() * 0.4, 0xffffff, {
        tx: ev.x + (Math.random() - 0.5) * 300, ty: ev.y + (Math.random() - 0.3) * 200, arc: 90 + Math.random() * 80, additive: false, depth: D.fxTop, rot1: 5,
      });
    }
    if (ev.gems > 0) this.time.delayedCall(450, () => popText(this, ev.x, ev.y - 90, `+${ev.gems} GEMS`, 44, 0x7ee0ff, 70, 900));
    this.queueRareTower(this.world.wave);
  }

  private onAbility(ev: Extract<SimEvent, { type: 'abilityUsed' }>): void {
    const fx = this.fx;
    switch (ev.ability) {
      case 'meteor':
        fx.sfx('ability_meteor');
        fx.flash(0xff8a3a, 0.16, 240);
        break;
      case 'freeze': {
        fx.sfx('ability_freeze');
        fx.flash(0x7fdcff, 0.4, 420);
        let n = 0;
        for (const e of this.world.enemies) {
          if (!e.active) continue;
          fx.stars(e.x, e.y - 14, 0xbfeeff, 3);
          if (++n >= 22) break;
        }
        break;
      }
      case 'repair':
        fx.sfx('ability_repair');
        fx.pluses(CASTLE.x, CASTLE.y - 10, 14);
        fx.glow(CASTLE.x, CASTLE.y - 20, 0x7dff8a, 100, 320, 520, 0.8);
        fx.ring(CASTLE.x, CASTLE.y - 10, 0x7dff8a, 40, 300, 560, 0.9);
        fx.flash(0x7dff8a, 0.15, 260);
        break;
      case 'frenzy':
        fx.sfx('ability_frenzy');
        fx.flash(0xff3a3a, 0.28, 360);
        for (const v of this.towers.views) {
          const a = v.anchor();
          fx.ring(a.x, a.y - 30, 0xff4a3a, 30, 130, 420, 0.8);
        }
        break;
      default:
    }
  }
}

