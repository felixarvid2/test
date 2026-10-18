import Phaser from 'phaser';
import { COLORS, EXTRA_KEY, PIXEL_SCALE } from '../assets';
import type { BossDef, EnemyDef, RoomPlan } from '../../core/types';
import { enemyHitDamage, enemyHp } from '../../core/combat';
import { textStyle } from '../ui/kit';
import type { BossController } from '../systems/BossController';
import { FX_RING } from '../systems/Effects';
import type { Tele } from '../systems/Telegraphs';
import { frameRef } from './frames';

export const AI_WALK = 0;
export const AI_WINDUP = 1;
export const AI_DASH = 2;
export const AI_RECOVER = 3;

const FLAME_FRAMES = ['flame_0', 'flame_1', 'flame_2', 'flame_3'];

/**
 * A pooled enemy (also used for bosses). Plain data plus four sprites; behaviour lives in EnemyAI /
 * BossController, damage in CombatSystem, ticking statuses in StatusSystem.
 */
export class Enemy {
  active = false;
  dying = false;
  id = 0;
  def!: EnemyDef | BossDef;
  isBoss = false;
  elite = false;
  summoned = false;
  x = 0; y = 0;
  kvx = 0; kvy = 0;          // knockback velocity (decays)
  hp = 0; maxHp = 0;
  radius = 14;
  speed = 0;
  dmg = 1;                    // raw damage of one hit, already scaled by the room
  armor = 0;
  resist = 0;                 // knockback resistance 0..1
  baseScale = PIXEL_SCALE;

  // behaviour state
  ai = AI_WALK;
  t = 0;
  cd = 0;
  dx = 0; dy = 0;             // locked attack direction
  phase = 0;                  // random per-enemy phase for weaving / hopping
  contactCd = 0;
  spawnT = 0;                 // pop-in timer
  bobFreq = 9;                // walk-cycle speed (slimes hop slower and harder)

  // statuses
  burnStacks = 0; burnTime = 0; burnDps = 0; burnTick = 0;
  poisonTime = 0; poisonDps = 0; poisonTick = 0;
  slowTime = 0; slowAmt = 0;
  freezeTime = 0;
  flash = 0;
  squash = 0;
  orbitCd = 0;
  lift = 0;                   // vertical offset (boss jump)
  shake = 0;                  // sprite jitter during a windup
  bossCtrl: BossController | null = null;
  tele: Tele | null = null;   // this enemy's telegraph (archer aim line)

  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
  readonly flame: Phaser.GameObjects.Image;
  readonly aura: Phaser.GameObjects.Image;
  private mark: Phaser.GameObjects.Text | null = null;
  private lastTint = -2;
  private lastFill = false;
  private shadowW = 1;

  constructor(private readonly scene: Phaser.Scene) {
    this.shadow = scene.add.image(0, 0, EXTRA_KEY, 'shadow').setVisible(false).setAlpha(0.55).setDepth(5);
    this.aura = scene.add.image(0, 0, FX_RING).setVisible(false).setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    this.sprite = scene.add.image(0, 0, EXTRA_KEY, 'skeleton').setVisible(false);
    this.flame = scene.add.image(0, 0, EXTRA_KEY, 'flame_0').setVisible(false).setScale(2.2).setDepth(300);
  }

  setup(def: EnemyDef | BossDef, x: number, y: number, plan: RoomPlan, elite: boolean, isBoss: boolean): void {
    this.def = def;
    this.isBoss = isBoss;
    this.elite = elite;
    this.active = true;
    this.dying = false;
    this.summoned = false;
    this.x = x; this.y = y;
    this.kvx = this.kvy = 0;
    this.maxHp = this.hp = enemyHp(def, plan, elite);
    this.dmg = enemyHitDamage(def, plan, elite);
    this.radius = def.radius * (elite ? 1.2 : 1);
    this.speed = def.speed;
    const ed = def as EnemyDef;
    this.armor = isBoss ? 0 : (ed.armor ?? 0);
    this.resist = isBoss ? 0.92 : (ed.knockbackResist ?? 0);
    this.ai = AI_WALK;
    this.t = 0;
    this.cd = isBoss ? 2 : 0.8 + Math.random() * 1.2;
    this.phase = Math.random() * 6.283;
    this.contactCd = 0;
    this.spawnT = 0;
    this.burnStacks = 0; this.burnTime = 0; this.burnDps = 0; this.burnTick = 0;
    this.poisonTime = 0; this.poisonDps = 0; this.poisonTick = 0;
    this.slowTime = 0; this.slowAmt = 0; this.freezeTime = 0;
    this.flash = 0; this.squash = 0; this.orbitCd = 0; this.lift = 0; this.shake = 0;
    this.bossCtrl = null;
    this.tele = null;
    this.bobFreq = isBoss ? 5 : ed.behavior === 'chase' ? 4.5 : ed.behavior === 'erratic' ? 15 : ed.behavior === 'tank' ? 6 : 9;

    const ref = frameRef(def.frame);
    const tex = this.scene.textures.get(ref.key);
    const fr = tex.get(ref.frame);
    if (isBoss) {
      // BossDef.scale is world px per art pixel; keep the sprite at least as big as its hitbox.
      this.baseScale = Math.max((def as BossDef).scale, (def.radius * 2.6) / fr.width);
    } else {
      this.baseScale = PIXEL_SCALE * (ed.scale ?? 1) * (elite ? 1.2 : 1);
    }
    this.sprite.setTexture(ref.key, ref.frame).setVisible(true).setAlpha(1).setFlipX(false).setRotation(0);
    this.sprite.setScale(this.baseScale);
    this.lastTint = -2;
    this.shadowW = Math.max(0.8, (this.radius * 2.6) / 16);
    this.shadow.setVisible(true).setScale(this.shadowW);
    this.flame.setVisible(false);
    if (elite) this.aura.setVisible(true).setTint(0xffcf40).setAlpha(0.8);
    else this.aura.setVisible(false);
    this.setMark(false);
  }

  release(): void {
    this.active = false;
    this.dying = false;
    this.bossCtrl = null;
    this.sprite.setVisible(false);
    this.shadow.setVisible(false);
    this.flame.setVisible(false);
    this.aura.setVisible(false);
    this.setMark(false);
  }

  /** Red "!" over the head during an attack windup. */
  setMark(on: boolean): void {
    if (!on) {
      if (this.mark) this.mark.setVisible(false);
      return;
    }
    if (!this.mark) this.mark = this.scene.add.text(0, 0, '!', textStyle(52, COLORS.danger, { stroke: '#ffffff', strokeThickness: 6 })).setOrigin(0.5).setDepth(450);
    this.mark.setVisible(true);
  }

  private setLook(tint: number, fill: boolean): void {
    if (tint === this.lastTint && fill === this.lastFill) return;
    this.lastTint = tint;
    this.lastFill = fill;
    if (tint < 0) this.sprite.clearTint();
    else if (fill) this.sprite.setTintFill(tint);
    else this.sprite.setTint(tint);
  }

  /** Per-frame visuals: position, squash, tint priority (flash > freeze > burn > poison > slow > elite). */
  render(dt: number, time: number, playerX: number): void {
    if (this.flash > 0) this.flash -= dt;
    if (this.squash > 0) this.squash = Math.max(0, this.squash - dt * 4);
    if (this.spawnT < 0.25) this.spawnT += dt;
    const pop = Math.min(1, this.spawnT / 0.25);
    const popS = pop < 1 ? 0.3 + 0.7 * (1 - Math.pow(1 - pop, 3)) + Math.sin(pop * Math.PI) * 0.15 : 1;
    const sq = this.squash;
    // walking bob (slimes hop harder)
    const moving = this.ai === AI_WALK && this.freezeTime <= 0;
    const bob = moving ? Math.abs(Math.sin(time * this.bobFreq + this.phase)) : 0;
    const air = 1 + this.lift * 0.0009;
    const sx = this.baseScale * popS * air * (1 + sq * 0.35 - bob * 0.04);
    const sy = this.baseScale * popS * air * (1 - sq * 0.3 + bob * 0.06);
    const jx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const feetY = this.y;
    this.sprite.setPosition(this.x + jx, feetY - this.lift - this.radius * 0.35 - bob * 3 * (this.baseScale / 3));
    this.sprite.setScale(sx, sy);
    if (Math.abs(playerX - this.x) > 4) this.sprite.setFlipX(playerX < this.x);
    this.sprite.setDepth(100 + feetY * 0.1);
    this.shadow.setPosition(this.x, feetY + this.radius * 0.45).setAlpha(Math.max(0.2, 0.55 - this.lift * 0.002));
    this.shadow.setScale(this.shadowW * (1 - Math.min(0.5, this.lift * 0.002)) * popS, this.shadowW * popS);

    if (this.flash > 0) this.setLook(0xffffff, true);
    else if (this.freezeTime > 0) this.setLook(0xa8e4ff, false);
    else if (this.burnTime > 0) this.setLook(0xffa268, false);
    else if (this.poisonTime > 0) this.setLook(0x9bec5a, false);
    else if (this.slowTime > 0) this.setLook(0x93bfff, false);
    else if (this.elite) {
      const k = 0.5 + 0.5 * Math.sin(time * 6);
      const g = 0xff - Math.round(70 * k);
      const b = 0xff - Math.round(190 * k);
      this.setLook((0xff << 16) | (g << 8) | b, false);
    } else {
      const base = (this.def as EnemyDef).tint;
      this.setLook(base ?? -1, false);
    }

    if (this.burnTime > 0) {
      this.flame.setVisible(true)
        .setFrame(FLAME_FRAMES[((time * 10) | 0) & 3])
        .setPosition(this.x, this.sprite.y - this.sprite.displayHeight * 0.35)
        .setDepth(300 + feetY * 0.01)
        .setScale(1.4 + Math.min(this.burnStacks, 5) * 0.25);
    } else if (this.flame.visible) {
      this.flame.setVisible(false);
    }
    if (this.elite) {
      const k = 0.5 + 0.5 * Math.sin(time * 5);
      this.aura.setPosition(this.x, feetY + this.radius * 0.35).setScale((this.radius * 1.9) / 60 * (1 + k * 0.12), (this.radius * 1.9) / 60 * 0.55 * (1 + k * 0.12))
        .setAlpha(0.55 + 0.35 * k);
    }
    if (this.mark && this.mark.visible) {
      this.mark.setPosition(this.x, this.sprite.y - this.sprite.displayHeight * 0.5 - 24 + Math.sin(time * 30) * 2);
    }
  }
}
