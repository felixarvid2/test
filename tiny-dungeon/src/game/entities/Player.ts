import Phaser from 'phaser';
import { COLORS, EXTRA_KEY, PIXEL_SCALE } from '../assets';
import { damagePlayer, healPlayer } from '../../core/run';
import { COSMETICS } from '../../data/buffs';
import { HEROES } from '../../data/heroes';
import { services } from '../../services';
import { PLAY, ENTRY, clamp } from '../systems/layout';
import type { World } from '../systems/World';
import { frameRef } from './frames';

/** The hero: movement, walk animation, being hit (flash, invulnerability blink, dodge, phoenix). */
export class Player {
  x: number = ENTRY.x;
  y: number = ENTRY.y;
  radius = 14;
  invuln = 0;
  dead = false;
  moving = false;
  /** Vertical limits: the room opens the top at doors and the bottom while the hero walks in. */
  minY = PLAY.top + 14;
  maxY = PLAY.bottom - 14;
  /** Last non-zero movement direction, used for facing. */
  facing = 1;
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
  private flash = 0;
  private walkT = 0;
  private breathe = 0;
  private dying = false;
  private readonly baseTint: number;
  private lastFill = false;

  constructor(private readonly scene: Phaser.Scene, private readonly w: World) {
    const hero = HEROES[w.run.hero];
    const ref = frameRef(hero.frame);
    this.shadow = scene.add.image(0, 0, EXTRA_KEY, 'shadow').setAlpha(0.6).setDepth(5).setScale(3.2, 3);
    this.sprite = scene.add.image(0, 0, ref.key, ref.frame).setScale(PIXEL_SCALE);
    const skin = services.save.data.cosmetics.equipped[w.run.hero];
    const cosmetic = skin ? COSMETICS.find((c) => c.id === skin) : undefined;
    this.baseTint = cosmetic ? cosmetic.tint : 0xffffff;
    if (this.baseTint !== 0xffffff) this.sprite.setTint(this.baseTint);
    this.place(ENTRY.x, ENTRY.y);
  }

  place(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.syncSprite();
  }

  /** Moves by a direction vector (length 0..1). `speedScale` slows the walk-in during room entry. */
  update(dt: number, dirX: number, dirY: number, speedScale = 1): void {
    if (this.dying) return;
    const run = this.w.run;
    const mag = Math.sqrt(dirX * dirX + dirY * dirY);
    this.moving = mag > 0.05;
    if (this.moving) {
      const speed = run.stats.moveSpeed * speedScale * Math.min(1, mag);
      this.x += (dirX / mag) * speed * dt;
      this.y += (dirY / mag) * speed * dt;
      if (Math.abs(dirX) > 0.15) this.facing = dirX < 0 ? -1 : 1;
      this.walkT += dt;
    }
    this.x = clamp(this.x, PLAY.left + this.radius, PLAY.right - this.radius);
    this.y = clamp(this.y, this.minY, this.maxY);
    if (run.stats.regen > 0 && run.hp > 0) healPlayer(run, run.stats.regen * dt);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.flash > 0) this.flash -= dt;
    this.breathe += dt;
    this.syncSprite();
  }

  private syncSprite(): void {
    const bob = this.moving ? Math.abs(Math.sin(this.walkT * 13)) : 0;
    const sq = this.moving ? Math.sin(this.walkT * 26) * 0.06 : Math.sin(this.breathe * 3) * 0.025;
    this.sprite.setPosition(this.x, this.y - 18 - bob * 5);
    this.sprite.setScale(PIXEL_SCALE * (1 - sq), PIXEL_SCALE * (1 + sq));
    this.sprite.setFlipX(this.facing < 0);
    this.sprite.setDepth(100 + this.y * 0.1);
    this.shadow.setPosition(this.x, this.y + 4).setScale(3.2 - bob * 0.3, 3);
    if (!this.dying) {
      const blinkOff = this.invuln > 0 && (((this.breathe * 18) | 0) & 1) === 0;
      this.sprite.setAlpha(blinkOff ? 0.35 : 1);
      const fill = this.flash > 0;
      if (fill !== this.lastFill) {
        this.lastFill = fill;
        if (fill) this.sprite.setTintFill(0xffffff);
        else if (this.baseTint !== 0xffffff) this.sprite.setTint(this.baseTint);
        else this.sprite.clearTint();
      }
    }
  }

  /** Returns true when the hit landed (not dodged, not during invulnerability). */
  hurt(raw: number): boolean {
    if (this.invuln > 0 || this.dead || this.dying) return false;
    const w = this.w;
    const r = damagePlayer(w.run, raw, w.rng);
    if (r.dodged) {
      this.invuln = 0.25;
      w.numbers.spawn(this.x, this.y - 40, 'DODGE', COLORS.frost, 3);
      w.fx.puff(this.x, this.y - 10, 0xbfe8ff, 4, 1);
      return false;
    }
    this.invuln = w.run.stats.invulnTime;
    this.flash = 0.14;
    w.numbers.spawn(this.x, this.y - 44, `-${r.taken}`, COLORS.hp, 3, true);
    w.fx.hitSparks(this.x, this.y - 14, 0xff5060, true, 0);
    w.fx.shake(0.28);
    w.fx.flash(0xff2030, 0.22, 0.18);
    w.fx.hitstop(45);
    services.audio.play('playerHurt');
    w.hooks.playerHurt(r.taken);
    if (r.phoenix) {
      this.invuln = 2.2;
      w.hooks.phoenix();
    } else if (r.fatal) {
      this.dead = true;
      w.hooks.playerDied();
    }
    return true;
  }

  /** Death: flash white, fall over. */
  playDeath(): void {
    this.dying = true;
    this.sprite.setTintFill(0xffffff).setAlpha(1);
    this.scene.time.delayedCall(120, () => this.baseTint !== 0xffffff ? this.sprite.setTint(this.baseTint) : this.sprite.clearTint());
    this.scene.tweens.add({ targets: this.sprite, angle: this.facing < 0 ? -90 : 90, y: this.y - 2, duration: 420, ease: 'Bounce.Out', delay: 120 });
    this.scene.tweens.add({ targets: this.shadow, scaleX: 4, duration: 500, delay: 120 });
  }

  /** Revival: stand up again with a blink. */
  revive(): void {
    this.dying = false;
    this.dead = false;
    this.sprite.setAngle(0).setAlpha(1);
    if (this.baseTint !== 0xffffff) this.sprite.setTint(this.baseTint);
    else this.sprite.clearTint();
    this.lastFill = false;
    this.invuln = 3;
    this.syncSprite();
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
