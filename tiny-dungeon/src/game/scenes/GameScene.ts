import Phaser from 'phaser';
import { BALANCE } from '../../config/balance';
import { enemyGold, enemyXp } from '../../core/combat';
import { evaluateAchievements } from '../../core/achievements';
import { Rng, newSeed } from '../../core/rng';
import { doorOptions, planRoom, treasureReward } from '../../core/rooms';
import {
  applyBuff, applyUpgrade, createRun, onRoomCleared, registerBossKill, revivePlayer, toSummary,
} from '../../core/run';
import type { BossAttackId, BossDef, RoomPlan, RoomType, RunState } from '../../core/types';
import { BOSS_BY_ID } from '../../data/bosses';
import { BUFF_BY_ID, COSMETICS } from '../../data/buffs';
import { ENEMY_BY_ID } from '../../data/enemies';
import { applyShrine, canUseShrine, curseHpMult, rollShrineOptions, type ShrineOption } from '../../data/events';
import { formatOdds, rollMysteryEgg } from '../../rewards/mysteryEgg';
import { onHostPause, services } from '../../services';
import { COLORS, ICONS_KEY, TILE_FRAMES } from '../assets';
import { Enemy } from '../entities/Enemy';
import { EnemyPool } from '../entities/EnemyPool';
import { PICKUP_COIN, PICKUP_XP_BIG, PickupPool } from '../entities/PickupPool';
import { Player } from '../entities/Player';
import { ProjectilePool } from '../entities/ProjectilePool';
import { Button, H, W, drawBox, label, panel, textStyle, titleStyle, toast, veil } from '../ui/kit';
import { canOfferReward, offerReward } from '../ui/rewardPrompt';
import { AbilitySystem } from '../systems/AbilitySystem';
import { BossController } from '../systems/BossController';
import { BOSS_MODULES } from '../systems/bosses';
import { MIMIC_TRIGGER_DIST, type MimicChest, burstChest, destroyChests, placeMimicChests, popDecoy, rattleChests } from '../systems/bosses/MimicIntro';
import { CombatSystem } from '../systems/CombatSystem';
import { DamageNumbers } from '../systems/DamageNumbers';
import { Effects } from '../systems/Effects';
import { ENTRY, PLAY, START_Y, TAU } from '../systems/layout';
import { RoomBuilder, type Door } from '../systems/RoomBuilder';
import { SpatialGrid } from '../systems/SpatialGrid';
import { StatusSystem } from '../systems/StatusSystem';
import { Telegraphs } from '../systems/Telegraphs';
import { VirtualJoystick } from '../systems/VirtualJoystick';
import { WeaponSystem } from '../systems/WeaponSystem';
import { World } from '../systems/World';
import type { BossHud } from './HudScene';
import type { GameOverSceneData, GameSceneData, UpgradeSceneData } from './contracts';
import { SCENES } from './keys';

type State =
  | 'enter'        // hero walks in through the bottom door
  | 'fight'
  | 'bossIntro'
  | 'bossDying'
  | 'cleared'      // pickups sweep to the hero
  | 'modal'        // shrine / egg UI inside this scene
  | 'upgrade'      // Upgrade overlay is up (this scene is paused)
  | 'doors'
  | 'transition'
  | 'dying'
  | 'dead';

interface SpawnItem {
  at: number;
  enemy: string;
  elite: boolean;
}

const MAX_DT = 0.05;

/** The gameplay scene: room flow, input, and the glue between the systems. */
export class GameScene extends Phaser.Scene {
  private w!: World;
  private run!: RunState;
  private roomsRng!: Rng;
  private upgradesRng!: Rng;
  private doorRng!: Rng;
  private rooms!: RoomBuilder;
  private joystick!: VirtualJoystick;
  private state: State = 'enter';
  private stateT = 0;
  private roomType: RoomType = 'combat';
  private prevRoomType: RoomType | undefined;
  private spawnQ: SpawnItem[] = [];
  private spawnIdx = 0;
  private spawnPoint = { x: 0, y: 0 };
  private eggOffered = false;
  private timeScale = 1;
  private slowLeft = 0;
  private bossCtrl: BossController | null = null;
  private bossHud: BossHud | null = null;
  private bossDeathDone = true;
  private mimicChests: MimicChest[] = [];
  private chest: Phaser.GameObjects.Image | null = null;
  private chestOpened = false;
  private statue: Phaser.GameObjects.Image[] = [];
  private statueUsed = false;
  private modal: Phaser.GameObjects.Container | null = null;
  private dim: Phaser.GameObjects.Rectangle | null = null;
  private hint: Phaser.GameObjects.Container | null = null;
  private hintGone = false;
  private doorHint: Phaser.GameObjects.Text | null = null;
  private picked: Door | null = null;
  private godMode = false;
  private clearedFlag = false;
  private cleanup: (() => void)[] = [];
  private needStopOverlays = 0;
  private maxDt = MAX_DT;

  constructor() { super(SCENES.game); }

  // ---- setup --------------------------------------------------------------------------------------

  create(data: GameSceneData): void {
    const save = services.save;
    const params = new URLSearchParams(window.location.search);
    const debug = import.meta.env.DEV || params.has('debug');

    const hero = (data?.hero ?? 'knight') as RunState['hero'];
    const mode = data?.mode ?? 'normal';
    const run = createRun({ hero, seed: newSeed(), mode, meta: save.data.meta, unlocks: save.data.unlocks });
    this.run = run;
    const rng = new Rng(run.seed);
    this.roomsRng = rng.fork('rooms');
    this.upgradesRng = rng.fork('upgrades');
    this.doorRng = rng.fork('doors');
    const lootRng = rng.fork('loot');
    const combatRng = new Rng(newSeed());

    // debug hooks (dev builds or ?debug=1): ?room=5 ?type=elite ?up=a,b ?god=1
    let startType: RoomType = 'combat';
    if (debug) {
      const room = Number(params.get('room'));
      if (room > 1) run.room = Math.floor(room);
      const t = params.get('type');
      if (t === 'elite' || t === 'treasure' || t === 'shrine') startType = t;
      for (const id of (params.get('up') ?? '').split(',')) if (id) applyUpgrade(run, id);
      this.godMode = params.has('god');
    }

    this.registry.set('run', run);
    this.registry.set('boss', null);
    this.registry.set('roomType', 'combat');

    // systems
    const w = new World();
    this.w = w;
    w.scene = this;
    w.run = run;
    w.rng = combatRng;
    w.loot = lootRng;
    w.grid = new SpatialGrid();
    w.fx = new Effects(this);
    w.numbers = new DamageNumbers(this);
    w.tele = new Telegraphs(this);
    w.hooks = {
      levelUp: (n) => this.onLevelUp(n),
      bossKilled: (e) => this.onBossKilled(e),
      playerDied: () => this.onPlayerDied(),
      phoenix: () => this.onPhoenix(),
      playerHurt: () => undefined,
    };
    this.rooms = new RoomBuilder(this);
    w.plan = planRoom(run.room, this.roomsRng.fork('room' + run.room), { unlocks: run.unlocks ?? [], type: startType });
    w.enemies = new EnemyPool(this, w);
    w.playerShots = new ProjectilePool(this, w, true, 110);
    w.enemyShots = new ProjectilePool(this, w, false, BALANCE.limits.maxProjectiles);
    w.pickups = new PickupPool(this, w);
    w.combat = new CombatSystem(w);
    w.status = new StatusSystem(w);
    w.abilities = new AbilitySystem(this, w);
    w.weapons = new WeaponSystem(w);
    w.player = new Player(this, w);
    this.joystick = new VirtualJoystick(this);

    // flow (scene instances are reused between runs: reset everything that outlives a room)
    this.state = 'enter';
    this.cleanup = [];
    this.hint = null;
    this.modal = null;
    this.dim = null;
    this.doorHint = null;
    this.prevRoomType = undefined;
    this.bossCtrl = null;
    this.bossHud = null;
    this.picked = null;
    this.needStopOverlays = 0;
    this.maxDt = MAX_DT;
    this.timeScale = 1;
    this.slowLeft = 0;
    this.eggOffered = false;
    this.hintGone = false;
    this.cameras.main.setBackgroundColor(COLORS.bg);
    if (!services.save.data.settings.reducedMotion) this.cameras.main.fadeIn(260, 20, 12, 28);

    // HUD runs alongside (restart it so a new run starts clean)
    if (this.scene.isActive(SCENES.hud) || this.scene.isPaused(SCENES.hud)) this.scene.stop(SCENES.hud);
    this.scene.launch(SCENES.hud);

    this.bindInput();
    this.startRoom(startType, true);
    if (debug) {
      (window as unknown as { __game: unknown }).__game = {
        scene: this,
        run,
        world: w,
        killAll: () => this.debugKillAll(),
        state: () => this.state,
        setMaxDt: (v: number) => { this.maxDt = v; },
        spawn: (n: number) => this.debugSpawn(n),
        attack: (id: string) => this.bossCtrl?.launchAttack(id as BossAttackId),
      };
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
  }

  private bindInput(): void {
    const kb = this.input.keyboard;
    if (kb) {
      // Esc / P pause. Esc is never captured, so the browser still sees it.
      const onKey = (): void => this.pauseGame();
      kb.on('keydown-ESC', onKey);
      kb.on('keydown-P', onKey);
      this.cleanup.push(() => { kb.off('keydown-ESC', onKey); kb.off('keydown-P', onKey); });
    }
    this.cleanup.push(onHostPause(() => this.pauseGame()));
    // services' own pause handler flushes before this one runs, so flush again after the snapshot.
    this.cleanup.push(onHostPause(() => { if (this.snapshotRun()) void services.save.flush(); }));
    const onBlur = (): void => this.pauseGame();
    window.addEventListener('blur', onBlur);
    this.cleanup.push(() => window.removeEventListener('blur', onBlur));
    const onResume = (): void => {
      this.joystick.release();
      this.needStopOverlays = 3;
    };
    this.events.on(Phaser.Scenes.Events.RESUME, onResume);
    this.cleanup.push(() => this.events.off(Phaser.Scenes.Events.RESUME, onResume));
  }

  private shutdown(): void {
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
    this.joystick.destroy();
    this.rooms.destroy();
    this.w.fx.shutdown();
    this.registry.set('boss', null);
    this.scene.stop(SCENES.hud);
    this.tweens.killAll();
  }

  // ---- run recovery -------------------------------------------------------------------------------

  /**
   * Stores the run in progress as save.pendingRun so closing the app mid-run does not lose it (the menu
   * banks it on the next launch). Not for runs that died or were already banked by Game Over.
   * Returns true when pendingRun was updated; the caller decides how to persist it.
   */
  private snapshotRun(): boolean {
    if (this.state === 'dying' || this.state === 'dead') return false;
    const data = services.save.data;
    if (data.lastRun?.runId === this.run.runId) return false;
    data.pendingRun = toSummary(this.run);
    return true;
  }

  // ---- pause --------------------------------------------------------------------------------------

  /** Pauses gameplay and opens the Pause overlay (button, Esc / P, window blur, host pause). */
  pauseGame(): void {
    if (!this.scene.isActive() || this.scene.isPaused()) return;
    if (this.state === 'dying' || this.state === 'dead' || this.state === 'upgrade') return;
    if (this.scene.isActive(SCENES.pause) || this.scene.isPaused(SCENES.pause) || this.scene.isSleeping(SCENES.pause)) return;
    this.joystick.release();
    this.scene.pause();
    this.scene.launch(SCENES.pause);
  }

  // ---- rooms --------------------------------------------------------------------------------------

  private startRoom(type: RoomType, first = false): void {
    const run = this.run;
    const w = this.w;
    const idx = run.room;
    const plan: RoomPlan = planRoom(idx, this.roomsRng.fork('room' + idx), {
      unlocks: run.unlocks ?? [], type, hpMult: curseHpMult(run),
    });
    w.plan = plan;
    this.roomType = plan.type;
    this.registry.set('roomType', plan.type);

    w.enemies.clear();
    w.playerShots.clear();
    w.enemyShots.clear();
    w.pickups.clear();
    w.tele.clear();
    w.fx.clear();
    w.numbers.clear();
    w.abilities.reset();
    w.weapons.reset();
    w.abilities.refresh();
    w.boss = null;
    this.bossCtrl = null;
    this.bossDeathDone = true;
    this.clearedFlag = false;
    this.chest = null;
    this.chestOpened = false;
    this.statue = [];
    this.statueUsed = false;
    this.picked = null;
    destroyChests(this.mimicChests);
    this.doorHint?.destroy();
    this.doorHint = null;
    this.timeScale = 1;
    this.slowLeft = 0;
    this.registry.set('boss', null);
    this.bossHud = null;

    this.rooms.build(idx, plan.type);
    w.roomTime = 0;
    w.combatActive = false;
    w.player.place(ENTRY.x, ENTRY.y + 4);
    w.player.maxY = ENTRY.y + 30;
    w.player.minY = PLAY.top + 14;

    // spawn schedule
    this.spawnQ = [];
    this.spawnIdx = 0;
    for (const s of plan.spawns) {
      for (let i = 0; i < s.count; i++) this.spawnQ.push({ at: s.at + i * 0.12, enemy: s.enemy, elite: !!s.elite });
    }
    this.spawnQ.sort((a, b) => a.at - b.at);

    services.audio.playMusic(plan.type === 'boss' ? 'music_boss' : 'music_dungeon');
    if (plan.bossId === 'mimic_king') this.mimicChests = placeMimicChests(this);
    if (plan.type === 'treasure') this.chest = this.rooms.addChest(360, 560);
    if (plan.type === 'shrine') this.statue = this.rooms.addStatue(360, 560);

    this.state = 'enter';
    this.stateT = 0;
    const sub: Record<RoomType, string> = { combat: '', elite: 'ELITE ROOM', treasure: 'TREASURE ROOM', shrine: 'SHRINE', boss: 'BOSS' };
    this.banner(`ROOM ${idx}`, sub[plan.type], plan.type === 'boss' ? COLORS.danger : plan.type === 'elite' ? COLORS.legendary : COLORS.gold);
    if (!first) services.audio.play('door', { volume: 0.7 });

    if (first && services.save.data.stats.runs === 0 && idx === 1) this.showHint();
  }

  private banner(text: string, sub: string, color: number): void {
    const reduced = services.save.data.settings.reducedMotion;
    const t = this.add.text(W / 2, 400, text, titleStyle(72, color)).setOrigin(0.5).setDepth(1000).setAlpha(0);
    const objs: Phaser.GameObjects.Text[] = [t];
    if (sub) {
      const s = this.add.text(W / 2, 466, sub, textStyle(40, COLORS.text)).setOrigin(0.5).setDepth(1000).setAlpha(0);
      objs.push(s);
    }
    this.tweens.add({
      targets: objs, alpha: { from: 0, to: 1 }, duration: 160,
      onComplete: () => {
        this.tweens.add({ targets: objs, alpha: 0, y: '-=40', delay: 650, duration: 360, onComplete: () => objs.forEach((o) => o.destroy()) });
      },
    });
    if (!reduced) {
      t.setScale(0.5);
      this.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.Out' });
    }
  }

  private popText(text: string, color: number, size = 64, y = 520, hold = 500): void {
    const reduced = services.save.data.settings.reducedMotion;
    const t = this.add.text(W / 2, y, text, titleStyle(size, color)).setOrigin(0.5).setDepth(1000);
    if (!reduced) {
      t.setScale(0.4);
      this.tweens.add({ targets: t, scale: 1, duration: 240, ease: 'Back.Out' });
    }
    this.tweens.add({ targets: t, alpha: 0, y: y - 50, delay: hold, duration: 420, onComplete: () => t.destroy() });
  }

  private showHint(): void {
    const c = this.add.container(W / 2, 930).setDepth(850);
    const g = this.add.graphics();
    // a finger drawn with rounded shapes
    g.fillStyle(0x140c1c, 1).fillRoundedRect(-24, -52, 48, 100, 20).fillRoundedRect(-44, 4, 88, 66, 22);
    g.fillStyle(0xffe2c4, 1).fillRoundedRect(-18, -46, 36, 90, 16).fillRoundedRect(-38, 10, 76, 54, 18);
    g.fillStyle(0xd9b08c, 1).fillRect(-18, 10, 36, 4);
    const trail = this.add.graphics();
    trail.lineStyle(8, 0xffffff, 0.35).beginPath().moveTo(-110, 40).lineTo(110, 40).strokePath();
    trail.fillStyle(0xffffff, 0.25).fillCircle(-110, 40, 16).fillCircle(110, 40, 16);
    const txt = label(this, 0, 150, 'Drag to move', 46, COLORS.text);
    c.add([trail, g, txt]);
    this.hint = c;
    if (!services.save.data.settings.reducedMotion) {
      this.tweens.add({ targets: g, x: { from: -90, to: 90 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
    this.tweens.add({ targets: txt, alpha: { from: 0.6, to: 1 }, duration: 600, yoyo: true, repeat: -1 });
  }

  private hideHint(): void {
    if (!this.hint || this.hintGone) return;
    this.hintGone = true;
    const c = this.hint;
    this.tweens.add({ targets: c, alpha: 0, duration: 350, onComplete: () => { c.destroy(); this.hint = null; } });
  }

  // ---- update -------------------------------------------------------------------------------------

  update(time: number, deltaMs: number): void {
    const real = Math.min(this.maxDt, deltaMs / 1000);
    const w = this.w;
    const fx = w.fx;
    if (this.needStopOverlays > 0) {
      this.needStopOverlays -= 1;
      if (this.scene.isActive(SCENES.upgrade)) this.scene.stop(SCENES.upgrade);
      if (this.scene.isActive(SCENES.pause)) this.scene.stop(SCENES.pause);
    }

    // slow motion decays on real time
    if (this.slowLeft > 0) {
      this.slowLeft -= real;
      if (this.slowLeft <= 0) this.timeScale = 1;
    }
    let dt = real * this.timeScale;
    if (fx.hitstopLeft > 0) dt = 0;

    this.joystick.update();
    w.combat.beginFrame(dt);
    this.stateT += dt;
    if (this.godMode) w.player.invuln = 1;

    // hero movement
    let dirX = 0;
    let dirY = 0;
    let speedScale = 1;
    const st = this.state;
    if (st === 'enter') {
      dirY = -1;
      speedScale = 0.9;
      if (w.player.y <= START_Y) this.onEntered();
    } else if (st === 'transition' && this.picked) {
      dirY = -1;
      dirX = Phaser.Math.Clamp((this.picked.x - w.player.x) / 60, -1, 1);
    } else if (st === 'fight' || st === 'cleared' || st === 'doors' || st === 'bossIntro' || st === 'bossDying') {
      dirX = this.joystick.x;
      dirY = this.joystick.y;
      if (st === 'doors') this.updateDoorBounds();
    }
    if (st !== 'modal' && st !== 'dying' && st !== 'dead' && st !== 'upgrade') w.player.update(dt, dirX, dirY, speedScale);
    if (this.hint && (this.joystick.hasInput) && st === 'fight') this.hideHint();

    w.fx.targetX = w.player.x;
    w.fx.targetY = w.player.y - 12;
    if (st === 'fight' || st === 'bossDying') {
      w.roomTime += dt;
      this.run.elapsed += dt;
    } else if (st === 'enter' || st === 'cleared' || st === 'doors' || st === 'bossIntro') {
      w.roomTime += dt;
    }
    w.combatActive = st === 'fight' || st === 'bossDying';

    this.runSpawns();
    w.enemies.update(dt);;
    if (this.bossCtrl && w.combatActive) this.bossCtrl.update(dt);
    w.weapons.update(dt);;
    w.playerShots.update(dt);
    w.enemyShots.update(dt);;
    w.status.update(w.combatActive ? dt : 0);
    w.abilities.update(dt);;
    w.pickups.update(dt, w.roomTime);;
    w.tele.update(dt);
    w.numbers.update(dt);;
    fx.update(dt, real);;
    this.rooms.update(time / 1000);;
    if (this.bossHud && this.bossCtrl) {
      const info = this.bossCtrl.hudInfo();
      this.bossHud.hp = info.hp;
      this.bossHud.maxHp = info.maxHp;
    }

    switch (this.state) {
      case 'fight': this.updateFight(); break;
      case 'cleared': this.updateCleared(); break;
      case 'doors': this.updateDoors(); break;
      case 'transition': break;
      default: break;
    }
  }

  private runSpawns(): void {
    const w = this.w;
    if (this.state !== 'fight' || this.spawnIdx >= this.spawnQ.length) return;
    while (this.spawnIdx < this.spawnQ.length && w.roomTime >= this.spawnQ[this.spawnIdx].at) {
      const item = this.spawnQ[this.spawnIdx++];
      const def = ENEMY_BY_ID[item.enemy];
      if (!def) continue;
      w.enemies.pickSpawnPoint(this.spawnPoint);
      w.enemies.queueSpawn(def, this.spawnPoint.x, this.spawnPoint.y, item.elite);
    }
  }

  private onEntered(): void {
    const w = this.w;
    this.rooms.closeEntry();
    services.audio.play('door', { volume: 0.5 });
    w.player.maxY = PLAY.bottom - 14;
    if (w.player.y > w.player.maxY) w.player.y = w.player.maxY;
    w.player.invuln = Math.max(w.player.invuln, 0.5);
    if (this.roomType === 'boss') {
      this.startBossIntro();
    } else {
      this.state = 'fight';
      this.stateT = 0;
    }
  }

  private updateFight(): void {
    const w = this.w;
    const type = this.roomType;
    if (type === 'treasure') {
      if (this.chest && !this.chestOpened) {
        const dx = w.player.x - this.chest.x;
        const dy = w.player.y - this.chest.y;
        if (dx * dx + dy * dy < 80 * 80) this.openChest();
      }
      return;
    }
    if (type === 'shrine') {
      if (this.statue.length > 0 && !this.statueUsed) {
        const dx = w.player.x - this.statue[1].x;
        const dy = w.player.y - (this.statue[1].y + 30);
        if (dx * dx + dy * dy < 84 * 84) this.touchStatue();
      }
      return;
    }
    if (this.spawnIdx < this.spawnQ.length || w.enemies.pendingCount > 0 || w.enemies.aliveCount > 0) return;
    if (type === 'boss' && !this.bossDeathDone) return;
    this.onRoomEmpty();
  }

  // ---- clearing -----------------------------------------------------------------------------------

  private onRoomEmpty(): void {
    if (this.clearedFlag) return;
    this.clearedFlag = true;
    this.state = 'cleared';
    this.stateT = 0;
    this.w.pickups.vacuumAll();
    this.w.fx.ring(this.w.player.x, this.w.player.y, 20, 360, 0.55, 0xffffff, 0.5);
    this.popText('CLEARED!', COLORS.gold, 84, 520, 700);
    services.audio.play('victory', { volume: 0.7 });
  }

  private updateCleared(): void {
    const w = this.w;
    if (this.stateT < 0.8) return;
    if (w.pickups.count > 0 && this.stateT < 3) return;
    if (w.pickups.count > 0) w.pickups.grantAll();
    this.completeRoom(true);
  }

  /** Room finished: advance the run, check achievements, then the upgrade overlay (or straight to the doors). */
  private completeRoom(upgrade: boolean): void {
    const run = this.run;
    const clearedRoom = run.room;
    const type = this.roomType;
    const hpBefore = run.hp;
    onRoomCleared(run);
    if (this.snapshotRun()) void services.save.save();
    const healed = Math.round(run.hp - hpBefore);
    if (healed > 0) this.w.numbers.spawn(this.w.player.x, this.w.player.y - 56, `+${healed}`, COLORS.heal, 3);
    this.prevRoomType = type;
    this.w.abilities.refresh();

    const earned = evaluateAchievements(services.save.data, toSummary(run));
    if (earned.length > 0) {
      void services.save.save();
      earned.forEach((a, i) => {
        this.time.delayedCall(i * 700, () => toast(this, `🏆 ${a.name}`, COLORS.gold, 250 + i * 54));
      });
      services.audio.play('synergy', { volume: 0.7 });
    }

    if (!upgrade) {
      this.openDoors(clearedRoom);
      return;
    }
    const data: UpgradeSceneData = {
      run,
      rng: this.upgradesRng,
      reason: type === 'boss' ? 'boss' : type === 'treasure' ? 'treasure' : type === 'shrine' ? 'shrine' : 'room',
      minRarity: type === 'elite' ? BALANCE.rooms.eliteRoomMinRarity : type === 'treasure' ? treasureReward(clearedRoom).minRarity : undefined,
      offerExtra: type === 'boss',
      onDone: () => {
        this.scene.resume();
        this.w.abilities.refresh();
        this.openDoors(clearedRoom);
      },
    };
    this.state = 'upgrade';
    this.joystick.release();
    this.scene.pause();
    this.scene.launch(SCENES.upgrade, data);
  }

  private openDoors(clearedRoom: number): void {
    const types = doorOptions(clearedRoom, this.doorRng, this.prevRoomType);
    this.rooms.placeDoors(types);
    this.rooms.openDoors();
    services.audio.play('door');
    this.state = 'doors';
    this.stateT = 0;
    this.w.player.invuln = 0;
    const t = label(this, W / 2, 420, types.length > 1 ? 'Choose a door' : 'Next room', 36, COLORS.text).setDepth(1000).setAlpha(0);
    this.doorHint = t;
    this.tweens.add({ targets: t, alpha: { from: 0, to: 0.95 }, duration: 300 });
    this.tweens.add({ targets: t, y: 432, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  private updateDoorBounds(): void {
    const p = this.w.player;
    let near = false;
    for (const d of this.rooms.doors) if (Math.abs(p.x - d.x) < 52) near = true;
    p.minY = near ? PLAY.top - 30 : PLAY.top + 14;
  }

  private updateDoors(): void {
    const p = this.w.player;
    const d = this.rooms.doorAt(p.x, p.y);
    if (!d || this.picked) return;
    this.picked = d;
    this.state = 'transition';
    this.stateT = 0;
    this.joystick.release();
    this.doorHint?.destroy();
    this.doorHint = null;
    services.audio.play('door', { volume: 0.8 });
    const next = d.type;
    p.minY = PLAY.top - 60;
    const go = (): void => {
      this.startRoom(next);
      if (!services.save.data.settings.reducedMotion) this.cameras.main.fadeIn(260, 20, 12, 28);
    };
    if (services.save.data.settings.reducedMotion) {
      go();
    } else {
      this.time.delayedCall(180, () => {
        this.cameras.main.fadeOut(220, 20, 12, 28);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, go);
      });
    }
  }

  // ---- treasure & shrine --------------------------------------------------------------------------

  private openChest(): void {
    const w = this.w;
    const chest = this.chest;
    if (!chest) return;
    this.chestOpened = true;
    chest.setFrame(TILE_FRAMES.chestOpen);
    services.audio.play('chest');
    const reward = treasureReward(this.run.room, this.run.stats.goldMult);
    const coins = 16;
    for (let i = 0; i < coins; i++) {
      this.time.delayedCall(i * 35, () => w.pickups.spawn(PICKUP_COIN, reward.gold / coins, chest.x, chest.y - 10, true, 2.6));
    }
    w.fx.ring(chest.x, chest.y, 10, 190, 0.5, COLORS.gold);
    w.fx.emit('spark', chest.x, chest.y - 10, 24, -1.57, 2.4, 160, 520, 0.4, 0.8, 1.6, 0.1, 0xffe080, 500, true);
    w.fx.shake(0.14);
    this.popText(`+${reward.gold} gold`, COLORS.gold, 60, 430, 900);
    this.time.delayedCall(1000, () => this.treasureNext());
  }

  private treasureNext(): void {
    const ctx = { runId: this.run.runId };
    if (!this.eggOffered && canOfferReward('mysteryEgg', ctx)) {
      this.eggOffered = true;
      this.state = 'modal';
      this.joystick.release();
      void offerReward(this, 'mysteryEgg', ctx, { title: 'Mystery Egg', desc: formatOdds(), icon: 'egg' }).then((ok) => {
        if (!ok) { this.state = 'fight'; this.onRoomEmpty(); return; }
        this.openEgg();
      });
      return;
    }
    this.onRoomEmpty();
  }

  private openEgg(): void {
    const save = services.save;
    const reward = rollMysteryEgg(() => this.w.loot.next(), save.data.cosmetics.owned);
    let title = '';
    let desc = '';
    let icon: string = 'egg';
    switch (reward.kind) {
      case 'companion': {
        applyBuff(this.run, reward.id, reward.rooms);
        const def = BUFF_BY_ID[reward.id];
        title = def?.name ?? 'Companion';
        desc = `${def?.desc ?? ''}\nFor ${reward.rooms} rooms`;
        icon = def?.icon ?? 'star';
        break;
      }
      case 'buff': {
        applyBuff(this.run, reward.id, reward.rooms);
        const def = BUFF_BY_ID[reward.id];
        title = def?.name ?? 'Buff';
        desc = `${def?.desc ?? ''}\nFor ${reward.rooms} rooms`;
        icon = def?.icon ?? 'star';
        break;
      }
      case 'gold':
        save.data.gold += reward.amount;
        void save.save();
        title = `${reward.amount} gold`;
        desc = 'Added to your bank';
        icon = 'gold';
        break;
      case 'cosmetic': {
        if (!save.data.cosmetics.owned.includes(reward.id)) save.data.cosmetics.owned.push(reward.id);
        void save.save();
        const skin = COSMETICS.find((c) => c.id === reward.id);
        title = `${skin?.name ?? 'New'} skin`;
        desc = 'Equip it in the hero screen';
        icon = 'hero';
        break;
      }
    }
    this.w.abilities.refresh();
    this.showReward(title, desc, icon, () => { this.state = 'fight'; this.onRoomEmpty(); });
  }

  private showReward(title: string, desc: string, icon: string, done: () => void): void {
    services.audio.play('upgradePick');
    const layer = this.add.container(0, 0).setDepth(5000);
    const shade = this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg, 0.75).setInteractive();
    const box = panel(this, W / 2, H / 2, 600, 520, COLORS.panel, COLORS.legendary);
    const img = this.add.image(W / 2, H / 2 - 150, ICONS_KEY, icon).setScale(6);
    const t = label(this, W / 2, H / 2 - 50, title, 52, COLORS.gold);
    const d = label(this, W / 2, H / 2 + 30, desc, 34, COLORS.text, { wordWrap: { width: 520 } });
    const ok = new Button(this, W / 2, H / 2 + 170, 'Nice!', () => { layer.destroy(); done(); }, { width: 360, color: 0x2f8f4e });
    layer.add([shade, box, img, t, d, ok]);
    this.tweens.add({ targets: img, scale: { from: 2, to: 6 }, duration: 380, ease: 'Back.Out' });
    this.w.fx.burst('spark', W / 2, H / 2 - 150, 20, 100, 400, 0.8, 1.6, 0.1, 0xffd860, 0, true);
  }

  private touchStatue(): void {
    this.statueUsed = true;
    this.state = 'modal';
    this.joystick.release();
    services.audio.play('cardFlip');
    const run = this.run;
    const options = rollShrineOptions(run, this.w.loot, 3);
    const layer = this.add.container(0, 0).setDepth(5000);
    this.modal = layer;
    layer.add(veil(this, 0.78));
    layer.add(panel(this, W / 2, H / 2, 640, 920, COLORS.panel, 0x60e0b0));
    layer.add(this.add.text(W / 2, H / 2 - 400, 'ANCIENT SHRINE', titleStyle(48, 0x9fffd0)).setOrigin(0.5));
    layer.add(label(this, W / 2, H / 2 - 340, 'Make an offering', 34, COLORS.textDim));
    options.forEach((o, i) => layer.add(this.shrineCard(o, W / 2, H / 2 - 230 + i * 190)));
    layer.add(new Button(this, W / 2, H / 2 + 370, 'Leave', () => this.leaveShrine(), { width: 360, color: 0x5a4a62 }));
  }

  private shrineCard(o: ShrineOption, x: number, y: number): Phaser.GameObjects.Container {
    const run = this.run;
    const ok = canUseShrine(run, o.id);
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    drawBox(g, -280, -80, 560, 160, ok ? COLORS.panelLight : 0x2c2630, ok ? 0x9fffd0 : 0x40384a);
    c.add(g);
    const icon = this.add.image(-220, 0, ICONS_KEY, o.icon).setScale(4).setAlpha(ok ? 1 : 0.4);
    c.add(icon);
    c.add(label(this, 30, -34, o.name, 36, ok ? COLORS.gold : COLORS.textDim));
    c.add(label(this, 30, 22, o.desc, 28, ok ? COLORS.text : COLORS.textDim, { wordWrap: { width: 400 } }));
    const hit = this.add.zone(0, 0, 560, 160).setInteractive({ useHandCursor: ok });
    let pressed = false;
    hit.on('pointerdown', () => { pressed = true; c.setScale(0.97); });
    hit.on('pointerout', () => { pressed = false; c.setScale(1); });
    hit.on('pointerup', () => {
      c.setScale(1);
      if (!pressed) return;
      pressed = false;
      if (!ok) { services.audio.play('error'); return; }
      this.chooseShrine(o);
    });
    c.add(hit);
    return c;
  }

  private chooseShrine(o: ShrineOption): void {
    const res = applyShrine(this.run, o.id, this.w.loot);
    if (!res.ok) {
      services.audio.play('error');
      toast(this, res.message, COLORS.danger, 300);
      return;
    }
    services.audio.play('revive');
    this.modal?.destroy();
    this.modal = null;
    this.w.abilities.refresh();
    const p = this.w.player;
    this.w.fx.ring(p.x, p.y, 10, 220, 0.5, 0x9fffd0);
    this.w.fx.burst('spark', p.x, p.y - 20, 18, 80, 340, 0.8, 1.4, 0.1, 0x9fffd0, -60, true);
    this.popText(res.message, 0x9fffd0, 34, 470, 1500);
    this.state = 'cleared';
    this.stateT = 0.2;
    this.clearedFlag = true;
    // straight to the upgrade overlay (reason 'shrine'; run.nextChoice shapes the offer)
    this.time.delayedCall(900, () => this.completeRoom(true));
    this.state = 'transition';
  }

  private leaveShrine(): void {
    this.modal?.destroy();
    this.modal = null;
    this.state = 'transition';
    this.time.delayedCall(150, () => this.completeRoom(false));
  }

  // ---- boss ---------------------------------------------------------------------------------------

  private startBossIntro(): void {
    const w = this.w;
    const def = BOSS_BY_ID[w.plan.bossId ?? ''];
    if (!def) { this.state = 'fight'; return; }
    this.state = 'bossIntro';
    this.bossDeathDone = false;
    w.player.invuln = 99;
    const reduced = services.save.data.settings.reducedMotion;

    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(940);
    this.dim = dim;
    this.tweens.add({ targets: dim, alpha: 0.55, duration: 300 });

    // WARNING flashes twice
    const bar1 = this.add.rectangle(W / 2, 470, W, 130, 0x8a0f1c, 0.85).setDepth(1000).setAlpha(0);
    const warn = this.add.text(W / 2, 470, 'WARNING', titleStyle(88, 0xffd0d0)).setOrigin(0.5).setDepth(1001).setAlpha(0);
    warn.setStroke('#5a0010', 14);
    services.audio.play('bossWarning');
    const flashes = reduced ? 1 : 2;
    for (let i = 0; i < flashes; i++) {
      this.time.delayedCall(i * 480, () => { bar1.setAlpha(1); warn.setAlpha(1); });
      this.time.delayedCall(i * 480 + 300, () => { bar1.setAlpha(0.15); warn.setAlpha(0.15); });
    }
    this.time.delayedCall(flashes * 480 + 120, () => { bar1.destroy(); warn.destroy(); this.bossDrop(def); });
  }

  private bossDrop(def: BossDef): void {
    const w = this.w;
    if (def.id === 'mimic_king' && this.mimicChests.length > 0) { this.mimicReveal(def); return; }
    const boss = w.enemies.spawnBoss(def, W / 2, 400);
    const ctrl = new BossController(w, def, BOSS_MODULES[def.id], boss);
    this.bossCtrl = ctrl;
    w.boss = ctrl;
    boss.lift = 900;
    boss.spawnT = 1;
    const land = (): void => {
      boss.lift = 0;
      ctrl.slam(boss.x, boss.y, 200, 0.85);
      w.fx.flash(0xffffff, 0.35, 0.25);
      services.audio.play('explosion');
      this.beginBossFight(def, ctrl);
    };
    if (services.save.data.settings.reducedMotion) {
      land();
    } else {
      const o = { lift: 900 };
      this.tweens.add({
        targets: o, lift: 0, duration: 650, ease: 'Cubic.In',
        onUpdate: () => { boss.lift = o.lift; },
        onComplete: land,
      });
    }
  }

  /** Name banner, then the fight starts and the HP bar appears. */
  private beginBossFight(def: BossDef, ctrl: BossController): void {
    const w = this.w;
    this.showBossBanner(def.name, def.title);
    this.time.delayedCall(1500, () => {
      this.dim?.destroy();
      this.dim = null;
      this.state = 'fight';
      this.stateT = 0;
      w.player.invuln = 1;
      this.bossHud = ctrl.hudInfo();
      this.registry.set('boss', this.bossHud);
    });
  }

  /**
   * Mimic King: the room holds three identical chests. They rattle for a beat (or until the hero walks up to
   * one), then one bursts open into the boss and the other two spring into regular mimics.
   */
  private mimicReveal(def: BossDef): void {
    const w = this.w;
    const reduced = services.save.data.settings.reducedMotion;
    rattleChests(this, this.mimicChests, reduced);
    services.audio.play('chest', { volume: 0.6 });
    let waited = 0;
    let burst = false;
    const watch = this.time.addEvent({
      delay: 80, loop: true,
      callback: () => {
        if (burst) return;   // a slow frame can run a looping timer more than once
        waited += 0.08;
        const near = waited > 0.5 && this.mimicChests.some((c) => Math.hypot(w.player.x - c.x, w.player.y - c.y) < MIMIC_TRIGGER_DIST);
        if (waited < 1.7 && !near) return;
        burst = true;
        watch.remove();
        this.mimicBurst(def);
      },
    });
  }

  private mimicBurst(def: BossDef): void {
    const w = this.w;
    const chests = this.mimicChests;
    const real = chests[Math.floor(w.rng.next() * chests.length)];
    const boss = w.enemies.spawnBoss(def, real.x, real.y);
    const ctrl = new BossController(w, def, BOSS_MODULES[def.id], boss);
    this.bossCtrl = ctrl;
    w.boss = ctrl;
    boss.squash = 1;
    boss.flash = 0.25;
    services.audio.play('explosion');
    services.audio.play('chest');
    burstChest(w, real);
    this.mimicChests = chests.filter((c) => c !== real);
    this.time.delayedCall(260, () => {
      for (const c of this.mimicChests) popDecoy(w, c);
      this.mimicChests = [];
    });
    this.beginBossFight(def, ctrl);
  }

  private showBossBanner(name: string, title: string): void {
    const t = this.add.text(W / 2, 470, name.toUpperCase(), titleStyle(64, COLORS.danger)).setOrigin(0.5).setDepth(1001).setAlpha(0);
    const s = this.add.text(W / 2, 540, title, textStyle(36, COLORS.text)).setOrigin(0.5).setDepth(1001).setAlpha(0);
    this.tweens.add({ targets: [t, s], alpha: 1, duration: 200 });
    if (!services.save.data.settings.reducedMotion) {
      t.setScale(1.5);
      this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Cubic.Out' });
    }
    this.tweens.add({ targets: [t, s], alpha: 0, delay: 1300, duration: 400, onComplete: () => { t.destroy(); s.destroy(); } });
  }

  private onBossKilled(boss: Enemy): void {
    const w = this.w;
    const run = this.run;
    const def = boss.def as BossDef;
    this.state = 'bossDying';
    this.bossDeathDone = false;
    this.timeScale = 0.25;
    this.slowLeft = 0.8;
    boss.dying = true;
    this.bossCtrl?.stop();
    w.enemyShots.clear();
    w.player.invuln = Math.max(w.player.invuln, 2);
    this.registry.set('boss', null);
    this.bossHud = null;

    w.fx.flash(0xffffff, 0.85, 0.55);
    w.fx.shake(0.9);
    w.fx.ring(boss.x, boss.y, 20, 420, 0.7, 0xffffff, 0.9);
    w.fx.ring(boss.x, boss.y, 10, 300, 0.55, COLORS.fire, 0.9);
    w.fx.deathBurst(boss.x, boss.y - 20, 0xffd080, true);
    w.fx.emit('spark', boss.x, boss.y - 20, 40, 0, TAU, 150, 650, 0.5, 1, 2, 0.1, 0xffe0a0, 200, true);
    w.fx.emit('puff', boss.x, boss.y - 20, 18, 0, TAU, 60, 320, 0.5, 0.9, 3, 1, 0xd8d0c0, 0, false, 0.9);
    services.audio.play('bossDeath');

    // loot fountain
    const xp = enemyXp(def, w.plan.index, false);
    const gold = enemyGold(def, w.plan, false);
    for (let i = 0; i < 10; i++) w.pickups.spawn(PICKUP_XP_BIG, xp / 10, boss.x, boss.y - 10, false, 2.8);
    for (let i = 0; i < 18; i++) w.pickups.spawn(PICKUP_COIN, gold / 18, boss.x, boss.y - 10, false, 3);
    registerBossKill(run, def.id);
    services.rewards.addTokens(1, 'boss');

    // after the slow-motion beat: the corpse leaves, the room carries on (the Giant Slime splits)
    this.time.delayedCall(850, () => {
      const ctrl = this.bossCtrl;
      boss.release();
      ctrl?.onDeath();
      this.bossDeathDone = true;
      this.bossCtrl = null;
      w.boss = null;
      this.timeScale = 1;
      this.slowLeft = 0;
      if (this.state === 'bossDying') this.state = 'fight';
      services.audio.playMusic('music_dungeon');
    });
  }

  // ---- hero events --------------------------------------------------------------------------------

  private onLevelUp(levels: number): void {
    const w = this.w;
    const p = w.player;
    services.audio.play('levelUp');
    w.fx.ring(p.x, p.y - 10, 10, 200, 0.5, COLORS.xp);
    w.fx.ring(p.x, p.y - 10, 6, 130, 0.4, 0xffffff, 0.8);
    w.fx.emit('spark', p.x, p.y - 20, 18, 0, TAU, 80, 300, 0.4, 0.8, 1.4, 0.1, COLORS.xp, 80, true);
    const t = this.add.text(p.x, p.y - 80, levels > 1 ? `LEVEL UP x${levels}!` : 'LEVEL UP!', titleStyle(40, COLORS.xp)).setOrigin(0.5).setDepth(1000);
    if (!services.save.data.settings.reducedMotion) {
      t.setScale(0.4);
      this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.Out' });
    }
    this.tweens.add({ targets: t, y: t.y - 70, alpha: 0, delay: 450, duration: 550, onComplete: () => t.destroy() });
    w.abilities.refresh();
  }

  private onPhoenix(): void {
    const w = this.w;
    const p = w.player;
    services.audio.play('revive');
    w.fx.flash(0xff9a30, 0.55, 0.4);
    w.fx.shake(0.6);
    w.fx.ring(p.x, p.y, 20, 420, 0.7, 0xffb040, 1);
    w.fx.ring(p.x, p.y, 10, 280, 0.5, 0xffffff, 0.8);
    w.fx.emit('flame_0', p.x, p.y - 10, 22, 0, TAU, 120, 460, 0.6, 1.1, 2.4, 0.4, 0xffffff, -120, true);
    w.fx.emit('spark', p.x, p.y - 10, 30, 0, TAU, 150, 560, 0.5, 1, 1.8, 0.1, 0xffc060, 120, true);
    this.popText('PHOENIX!', COLORS.legendary, 72, 470, 700);
    this.shockwave(420, 1700);
  }

  /** Pushes every enemy away from the hero and wipes enemy projectiles. */
  private shockwave(radius: number, force: number): void {
    const w = this.w;
    const p = w.player;
    for (const e of w.enemies.all) {
      if (!e.active || e.dying) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d > radius) continue;
      const k = (1 - e.resist) * force * (1 - d / (radius * 1.4));
      e.kvx += (dx / d) * k;
      e.kvy += (dy / d) * k;
      e.squash = 1;
    }
    w.enemyShots.clear();
  }

  private onPlayerDied(): void {
    const w = this.w;
    if (this.state === 'dying' || this.state === 'dead') return;
    this.state = 'dying';
    this.joystick.release();
    w.combatActive = false;
    w.player.playDeath();
    this.timeScale = 0.3;
    this.slowLeft = 0.7;
    services.audio.play('defeat', { volume: 0.8 });
    w.fx.shake(0.5);
    this.time.delayedCall(700, () => {
      this.timeScale = 1;
      this.state = 'dead';
      const data: GameOverSceneData = {
        run: this.run,
        canRevive: !this.run.revived,
        onRevive: () => this.revive(),
      };
      this.scene.pause();
      this.scene.launch(SCENES.gameOver, data);
    });
  }

  private revive(): void {
    const w = this.w;
    const run = this.run;
    revivePlayer(run, 0.5);
    run.revived = true;
    w.player.revive();
    const p = w.player;
    w.fx.flash(0xffffff, 0.5, 0.35);
    w.fx.ring(p.x, p.y, 20, 460, 0.7, 0xffffff, 1);
    w.fx.ring(p.x, p.y, 10, 300, 0.5, COLORS.heal, 0.9);
    w.fx.emit('spark', p.x, p.y - 12, 26, 0, TAU, 120, 520, 0.5, 1, 1.6, 0.1, 0xfff0a0, 80, true);
    this.shockwave(520, 2200);
    this.state = 'fight';
    this.timeScale = 1;
    this.slowLeft = 0;
    this.scene.resume();
    this.needStopOverlays = 3;
    this.scene.stop(SCENES.gameOver);
  }

  // ---- debug --------------------------------------------------------------------------------------

  /** Debug: drops `n` mixed enemies into the room right now (crowd screenshots). */
  private debugSpawn(n: number): void {
    const ids = ['slime', 'bat', 'skeleton', 'skeleton_archer', 'goblin_armored'];
    for (let i = 0; i < n; i++) {
      this.w.enemies.pickSpawnPoint(this.spawnPoint, 160);
      const e = this.w.enemies.spawnNow(ENEMY_BY_ID[ids[i % ids.length]], this.spawnPoint.x, this.spawnPoint.y, i % 9 === 0);
      if (e) e.spawnT = 0.3;
    }
  }

  private debugKillAll(): void {
    this.spawnIdx = this.spawnQ.length;
    for (const e of this.w.enemies.all) {
      if (!e.active || e.dying) continue;
      if (e.isBoss) this.w.combat.kill(e);
      else e.release();
    }
    this.w.enemyShots.clear();
  }
}
