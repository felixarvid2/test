import Phaser from 'phaser';
import { SLOTS } from '../../data/map';
import type { MoveResult, TowerState, WorldApi } from '../../sim/api';
import { towerKey } from '../assetKeys';
import { COLOR_DANGER, D, DRAG_LIFT, DRAG_THRESHOLD, TOWER_DY, towerSize } from './constants';
import type { Effects } from './Effects';
import { Highlights } from './Highlights';
import {
  DragMachine, classifyTarget, pickTowerSlot, resolveDropSlot, type SlotPos, type TargetKind,
} from './logic';
import { TEX } from './textures';
import { TowerLayer, drawLevelBadge } from './TowerView';

/** Where the lifted tower was at the moment of the drop (the merge flies a copy into the target). */
export interface FlyerSnapshot {
  type: string;
  level: number;
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

/** The lifted tower: a container (shadow, sprite, badge) that follows the finger and flies on drop. */
export class DragVisual {
  readonly root: Phaser.GameObjects.Container;
  readonly sprite: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly badge: Phaser.GameObjects.Graphics;
  type = 'arrow';
  level = 1;

  constructor(scene: Phaser.Scene) {
    this.shadow = scene.add.image(10, DRAG_LIFT * 0.55, TEX.shadow).setDisplaySize(110, 46).setAlpha(0.55);
    this.sprite = scene.add.image(0, 0, towerKey('arrow', 1)).setOrigin(0.5, 0.875);
    this.badge = scene.add.graphics();
    this.root = scene.add.container(0, 0, [this.shadow, this.sprite, this.badge]).setDepth(D.dragged).setVisible(false);
  }

  show(type: string, level: number, x: number, y: number): void {
    this.type = type;
    this.level = level;
    this.sprite.setTexture(towerKey(type, level));
    this.sprite.setScale(towerSize(level) / this.sprite.frame.height);
    this.sprite.clearTint();
    drawLevelBadge(this.badge.clear(), 0, 22, level);
    this.shadow.setVisible(true).setAlpha(0.55);
    this.root.setPosition(x, y).setScale(1).setRotation(0).setAlpha(1).setVisible(true);
  }

  hide(): void {
    this.root.setVisible(false);
  }

  /** Shadow belongs to the board: fade it when the tower is about to land. */
  setShadow(visible: boolean): void {
    this.shadow.setVisible(visible);
  }

  tint(color: number | null): void {
    if (color === null) this.sprite.clearTint();
    else this.sprite.setTintFill(color);
  }

  destroy(): void {
    this.root.destroy();
  }
}

export interface DragHost {
  readonly scene: Phaser.Scene;
  readonly fx: Effects;
  readonly layer: TowerLayer;
  world(): WorldApi;
  /** Drain and dispatch simulation events right now (so a merge reaches its visuals this frame). */
  flush(): void;
  /** False while an overlay is open or the phase does not allow edits. */
  canEdit(): boolean;
  /** A press that did not start on a tower (locked slot unlock, closing the info card ...). */
  onBoardPress(x: number, y: number): void;
  /** Tap (no drag) on a tower. */
  onTowerTap(slot: number): void;
  /** A tower was lifted (close info card etc.). */
  onLift(slot: number): void;
  /** Press landed on UI that should keep the tap (e.g. the info card). */
  isUiHit(x: number, y: number): boolean;
}

const SLOT_POS: readonly SlotPos[] = SLOTS.map((s) => ({ id: s.id, x: s.x, y: s.y + TOWER_DY }));

/**
 * One-finger drag and drop of towers. Works from scene-level pointer events (never blocked by HUD
 * hit areas), lifts after an 8 px move, renders the tower 70 px above the finger, magnet-snaps to
 * slots, and resolves the drop through world.moveTower.
 */
export class DragController {
  private readonly machine = new DragMachine(DRAG_THRESHOLD);
  private readonly visual: DragVisual;
  private readonly highlights: Highlights;
  private kinds: TargetKind[] = [];
  private hover = -1;
  private tx = 0;
  private ty = 0;
  private vx = 0;
  private tilt = 0;
  private lastX = 0;
  private busy = false;
  private fromTower: TowerState | null = null;
  private pendingFlyer: FlyerSnapshot | null = null;
  private readonly towerSlots: SlotPos[] = [];

  constructor(private readonly host: DragHost) {
    const scene = host.scene;
    this.visual = new DragVisual(scene);
    this.highlights = new Highlights(scene);
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.input.on('gameout', this.onOut, this);
  }

  get dragging(): boolean { return this.machine.phase === 'dragging'; }
  get active(): boolean { return this.machine.phase !== 'idle'; }

  /**
   * The merge animation claims the lifted tower: returns where it is (a snapshot to fly into the
   * target) and hides the drag sprite so the next drag can start right away.
   */
  takeFlyer(): FlyerSnapshot | null {
    const f = this.pendingFlyer;
    this.pendingFlyer = null;
    if (f) this.visual.hide();
    return f;
  }

  // --- input ------------------------------------------------------------------------------------

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.host.canEdit() || this.busy) return;
    if (this.host.isUiHit(p.x, p.y)) return;
    const world = this.host.world();
    this.towerSlots.length = 0;
    for (const s of world.slots) if (s.tower) this.towerSlots.push(SLOT_POS[s.id]);
    const slot = p.y >= 110 ? pickTowerSlot(p.x, p.y, this.towerSlots) : -1;
    if (slot >= 0 && this.machine.press(p.id, slot, p.x, p.y)) return;
    if (p.y >= 110) this.host.onBoardPress(p.x, p.y);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const m = this.machine.move(p.id, p.x, p.y);
    if (m === 'lift') this.lift();
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const wasDragging = this.machine.phase === 'dragging';
    const r = this.machine.release(p.id, p.x, p.y);
    if (r.kind === 'none') return;
    if (r.kind === 'tap') {
      if (this.host.canEdit()) this.host.onTowerTap(r.slot);
      return;
    }
    if (wasDragging) this.drop(r.slot, p.x, p.y);
  }

  private onOut(): void {
    if (this.machine.phase === 'dragging') this.cancel();
    else this.machine.cancel();
  }

  // --- lift / follow ----------------------------------------------------------------------------

  private lift(): void {
    const world = this.host.world();
    const slot = this.machine.slot;
    const tw = world.slots[slot]?.tower;
    if (!tw) { this.machine.cancel(); return; }
    this.fromTower = tw;
    this.host.onLift(slot);
    const view = this.host.layer.views[slot];
    view.setGhost(true);
    const x = this.machine.x;
    const y = this.machine.y - DRAG_LIFT;
    this.tx = x;
    this.ty = y;
    this.lastX = x;
    this.vx = 0;
    this.tilt = 0;
    this.visual.show(tw.type, tw.level, view.x, view.y + TOWER_DY);
    // pop up to 1.15x while sliding from the slot to the finger
    this.host.scene.tweens.add({ targets: this.visual.root, scale: 1.15, duration: 110, ease: 'Back.Out' });
    this.host.fx.sfx('click', { volume: 0.35, rate: 1.4 });
    this.host.fx.puffs(view.x, view.y + TOWER_DY + 6, 3, 0xe6d5b0);
    this.kinds = SLOTS.map((s) => classifyTarget(slot, s.id, world.slots.map(toInfo), (a, b) => world.canMerge(a, b)));
    this.highlights.begin(this.kinds);
    this.hover = -1;
  }

  /** Called every frame by the scene. */
  update(dt: number, time: number): void {
    if (this.machine.phase !== 'dragging') {
      if (this.highlights.isActive && !this.busy) this.highlights.end();
      return;
    }
    const v = this.visual.root;
    const fx = this.machine.x;
    const fy = this.machine.y;
    const rawX = fx;
    const rawY = fy - DRAG_LIFT;
    this.hover = resolveDropSlot(rawX, rawY, fx, fy, SLOT_POS);
    let tx = rawX;
    let ty = rawY;
    if (this.hover >= 0 && this.kinds[this.hover] !== 'locked' && this.kinds[this.hover] !== 'self') {
      // magnet: pull the lifted tower toward the slot it would land on
      const a = SLOT_POS[this.hover];
      const d = Math.hypot(a.x - rawX, a.y - rawY);
      const pull = 0.55 * Math.max(0, 1 - d / 90);
      tx += (a.x - rawX) * pull;
      ty += (a.y - rawY) * pull;
    }
    const k = 1 - Math.exp(-dt * 34);
    this.tx += (tx - this.tx) * k;
    this.ty += (ty - this.ty) * k;
    v.setPosition(this.tx, this.ty);
    // tilt with horizontal velocity
    const vx = dt > 0 ? (this.tx - this.lastX) / dt : 0;
    this.lastX = this.tx;
    this.vx += (vx - this.vx) * (1 - Math.exp(-dt * 14));
    const want = Phaser.Math.Clamp(this.vx / 2600, -0.32, 0.32);
    this.tilt += (want - this.tilt) * (1 - Math.exp(-dt * 16));
    v.setRotation(this.tilt);
    this.highlights.update(time, this.hover);
  }

  // --- drop -------------------------------------------------------------------------------------

  private drop(from: number, fx: number, fy: number): void {
    const world = this.host.world();
    const layer = this.host.layer;
    const target = resolveDropSlot(fx, fy - DRAG_LIFT, fx, fy, SLOT_POS);
    this.highlights.end();
    const kind: TargetKind | 'none' = target < 0 ? 'none' : this.kinds[target];
    if (!this.host.canEdit() || !this.fromTower || world.slots[from]?.tower?.uid !== this.fromTower.uid) {
      this.returnHome(from, false);
      return;
    }
    if (target === from) {
      this.returnHome(from, false);
      return;
    }
    if (target < 0 || kind === 'locked' || kind === 'none') {
      this.returnHome(from, true);
      return;
    }
    this.busy = true;
    const v = this.visual.root;
    this.pendingFlyer = { type: this.visual.type, level: this.visual.level, x: v.x, y: v.y, rotation: v.rotation, scale: v.scale };
    const toView = layer.views[target];
    toView.hold = true; // keep the old tower on screen until the flyer lands
    const result: MoveResult = world.moveTower(from, target);
    this.host.flush();
    const unclaimed = this.pendingFlyer !== null;
    this.pendingFlyer = null;
    switch (result) {
      case 'merged':
        // MergeFx claimed the flyer during flush(); if nothing did, drop the sprite quietly
        if (unclaimed) {
          this.visual.hide();
          toView.release(world.slots[target]?.tower ?? null);
        }
        this.finish(from);
        break;
      case 'moved':
      case 'swapped': {
        if (result === 'swapped') layer.views[from].markSlide(toView.x, toView.y);
        const a = toView.anchor();
        this.visual.tint(null);
        this.host.scene.tweens.add({
          targets: this.visual.root, x: a.x, y: a.y, scale: 1, rotation: 0, duration: 120, ease: 'Cubic.Out',
          onComplete: () => {
            this.visual.hide();
            const w = this.host.world();
            toView.release(w.slots[target]?.tower ?? null);
            toView.land();
            this.host.fx.dust(a.x, a.y + 8, 4);
            this.host.fx.sfx('place', { volume: 0.8 });
            this.busy = false;
          },
        });
        this.finish(from, true);
        break;
      }
      default:
        toView.hold = false;
        this.returnHome(from, true);
    }
  }

  private finish(from: number, keepBusy = false): void {
    this.host.layer.views[from].setGhost(false);
    this.fromTower = null;
    if (!keepBusy) this.busy = false;
  }

  /** Tween the lifted tower back to its slot (red flash and shake when the drop was invalid). */
  private returnHome(from: number, invalid: boolean): void {
    const view = this.host.layer.views[from];
    const a = view.anchor();
    this.busy = true;
    if (invalid) {
      this.visual.tint(COLOR_DANGER);
      this.host.fx.shake(5, 160);
      this.host.fx.sfx('invalid');
      this.host.fx.glow(this.visual.root.x, this.visual.root.y - 30, COLOR_DANGER, 40, 150, 220, 0.8);
      this.host.fx.glow(a.x, a.y - 20, COLOR_DANGER, 60, 140, 260, 0.6);
    } else {
      this.host.fx.sfx('place', { volume: 0.5, rate: 0.9 });
    }
    this.host.scene.tweens.add({
      targets: this.visual.root, x: a.x, y: a.y, scale: 1, rotation: 0, duration: invalid ? 190 : 130, ease: 'Back.Out',
      onComplete: () => {
        this.visual.hide();
        this.visual.tint(null);
        view.setGhost(false);
        this.fromTower = null;
        this.busy = false;
      },
    });
  }

  /** Abort the current drag (phase change, overlay, lost pointer): the tower goes home quietly. */
  cancel(): void {
    const was = this.machine.phase;
    const slot = this.machine.slot;
    this.machine.cancel();
    this.highlights.end();
    if (was === 'dragging' && slot >= 0) this.returnHome(slot, false);
  }

  destroy(): void {
    const input = this.host.scene.input;
    input.off('pointerdown', this.onDown, this);
    input.off('pointermove', this.onMove, this);
    input.off('pointerup', this.onUp, this);
    input.off('pointerupoutside', this.onUp, this);
    input.off('gameout', this.onOut, this);
    this.highlights.destroy();
    this.visual.destroy();
  }
}

const toInfo = (s: { unlocked: boolean; tower: unknown }): { unlocked: boolean; hasTower: boolean } => ({
  unlocked: s.unlocked, hasTower: s.tower !== null,
});
