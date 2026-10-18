import { BALANCE } from '../../config/balance';
import {
  burnDps, chainDamage, chainJumps, chaosEffect, enemyGold, enemyXp, explodeChanceFor, poisonDps, rollHit, rollStatuses,
} from '../../core/combat';
import { healPlayer, registerKill } from '../../core/run';
import { services } from '../../services';
import { COLORS } from '../assets';
import type { Enemy } from '../entities/Enemy';
import { PICKUP_COIN, PICKUP_XP, PICKUP_XP_BIG } from '../entities/PickupPool';
import type { World } from './World';

// One place where a hit lands: crit roll, armor, numbers, flash, knockback, statuses, chain lightning
// and death (loot, soul wisps, life on kill, explosions queued without recursion).

export const HIT_WEAPON = 1;
export const HIT_ORBIT = 2;
export const HIT_THUNDER = 3;
export const HIT_METEOR = 4;
export const HIT_EXPLOSION = 5;
export const HIT_CHAIN = 6;
export const HIT_COMPANION = 7;
export const HIT_KIND_MASK = 15;
export const HIT_NOSTATUS = 16;

const FROZEN = { frozen: true };
const THAWED = { frozen: false };

const DEATH_TINT: Record<string, number> = {
  slime: 0x63c74d, fire_slime: 0xff7a2f, bat: 0xb455f0, ghost: 0xbfe8ff, spider: 0x8a6a5a,
  necromancer: 0xb455f0, goblin_armored: 0x63c74d, ogre: 0xc08a50, giant_slime: 0x63e0a0,
};

export class CombatSystem {
  private readonly list: Enemy[] = [];
  private readonly chainIds = new Int32Array(12);
  private statusBudget = 0;
  private lifeAcc = 0;
  private lifeT = 0;

  constructor(private readonly w: World) {}

  /** Call once per frame before anything can hit. */
  beginFrame(dt: number): void {
    this.statusBudget = BALANCE.limits.maxStatusAppliesPerFrame;
    if (this.lifeAcc > 0) {
      this.lifeT -= dt;
      if (this.lifeT <= 0) {
        const p = this.w.player;
        this.w.numbers.spawn(p.x, p.y - 50, `+${Math.round(this.lifeAcc)}`, COLORS.heal, 3);
        this.lifeAcc = 0;
        this.lifeT = 0.35;
      }
    }
  }

  /**
   * Deals one hit. `flags` = one HIT_* kind (+ HIT_NOSTATUS). (fromX, fromY) is where the hit came from
   * (knockback direction); `knock` is the knockback distance in px before the enemy's resistance.
   */
  hit(e: Enemy, base: number, flags: number, fromX: number, fromY: number, knock: number): void {
    if (!e.active || e.dying) return;
    const w = this.w;
    const stats = w.run.stats;
    const kind = flags & HIT_KIND_MASK;
    let amount: number;
    let crit = false;
    if (kind === HIT_WEAPON || (kind === HIT_CHAIN && stats.chainCanCrit > 0)) {
      const r = rollHit(stats, base, w.rng, e.freezeTime > 0 ? FROZEN : THAWED);
      amount = r.amount;
      crit = r.crit;
    } else {
      let a = base;
      if (e.freezeTime > 0 && stats.frostShatter > 0) a *= 1 + BALANCE.combat.shatterDamageBonus;
      amount = Math.max(1, Math.round(a));
    }
    if (e.armor > 0) amount = Math.max(1, amount - e.armor);
    e.hp -= amount;

    // feedback
    e.flash = crit ? 0.12 : 0.08;
    e.squash = crit ? 0.9 : 0.55;
    let color: number = 0xffffff;
    let numKind = 0;
    if (crit) { color = COLORS.crit; numKind = 1; }
    else if (kind === HIT_THUNDER || kind === HIT_CHAIN) color = COLORS.lightning;
    else if (kind === HIT_METEOR || kind === HIT_EXPLOSION) color = 0xffa040;
    else if (kind === HIT_ORBIT) color = 0xdce6ff;
    else if (kind === HIT_COMPANION) { color = 0xffc8ff; numKind = 2; }
    w.numbers.spawn(e.x, e.y - e.radius - 12, crit ? `${amount}!` : `${amount}`, color, numKind);
    const ang = Math.atan2(e.y - fromY, e.x - fromX);
    w.fx.hitSparks(e.x, e.y - e.radius * 0.3, crit ? COLORS.crit : kind === HIT_WEAPON ? 0xffffff : color, crit, ang);
    if (kind !== HIT_COMPANION) services.audio.play(crit ? 'crit' : 'hit', { volume: kind === HIT_WEAPON ? 1 : 0.6 });
    if (crit && kind === HIT_WEAPON) w.fx.hitstop(35);
    if (knock > 0 && e.resist < 1) {
      const dx = e.x - fromX;
      const dy = e.y - fromY;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const dist = knock * (1 - e.resist) * BALANCE.combat.knockbackScale;
      e.kvx += (dx / d) * dist * 10;
      e.kvy += (dy / d) * dist * 10;
    }

    const alive = e.hp > 0;
    if (alive && (flags & HIT_NOSTATUS) === 0 && (kind === HIT_WEAPON)) this.applyStatuses(e, amount, ang);
    if (!alive) this.kill(e);
  }

  /** Everything inside the circle takes the hit (explosions, meteors, thunder, shockwaves). */
  aoe(x: number, y: number, r: number, base: number, flags: number, knock: number): number {
    const n = this.w.grid.queryCircle(x, y, r, this.list);
    for (let i = 0; i < n; i++) this.hit(this.list[i], base, flags, x, y, knock);
    return n;
  }

  /** Damage over time: no crit, no knockback, small coloured number. */
  dot(e: Enemy, amount: number, color: number): void {
    if (!e.active || e.dying) return;
    e.hp -= amount;
    this.w.numbers.spawn(e.x, e.y - e.radius - 8, `${Math.max(1, Math.round(amount))}`, color, 2);
    if (e.hp <= 0) this.kill(e);
  }

  // ---- statuses ----------------------------------------------------------------------------------

  private applyStatuses(e: Enemy, hitDamage: number, ang: number): void {
    const w = this.w;
    const stats = w.run.stats;
    const roll = rollStatuses(stats, w.rng);
    if (this.statusBudget <= 0) return;
    this.statusBudget -= 1;
    if (roll.burn) w.status.burn(e, burnDps(stats, hitDamage), stats.burnMaxStacks);
    if (roll.poison) w.status.poison(e, poisonDps(stats, hitDamage));
    if (roll.slow || roll.freeze) w.status.slow(e, stats.slowAmount, BALANCE.status.slowDuration);
    if (roll.freeze) w.status.freeze(e, BALANCE.status.freezeDuration);
    if (roll.chain) this.chain(e, chainJumps(stats), chainDamage(stats, hitDamage));
    if (roll.chaos) {
      const c = chaosEffect(stats, hitDamage, roll.chaos);
      const tint = roll.chaos === 'fire' ? COLORS.fire : roll.chaos === 'frost' ? COLORS.frost : roll.chaos === 'poison' ? COLORS.poison : COLORS.lightning;
      w.fx.emit('spark', e.x, e.y - 10, 6, ang, 6.28, 80, 220, 0.2, 0.4, 1.2, 0.1, tint);
      if (roll.chaos === 'fire') w.status.burn(e, c.dps, stats.burnMaxStacks);
      else if (roll.chaos === 'poison') w.status.poison(e, c.dps);
      else if (roll.chaos === 'frost') w.status.slow(e, c.slow, BALANCE.status.slowDuration);
      else this.chain(e, c.chainJumps, c.chainDamage);
    }
  }

  /** Jagged lightning arcing from `from` to the nearest unhit enemies. Never chains further itself. */
  chain(from: Enemy, jumps: number, damage: number): void {
    const w = this.w;
    const ids = this.chainIds;
    const max = Math.min(jumps, BALANCE.limits.maxChainJumpsPerHit, ids.length - 1);
    ids[0] = from.id;
    let n = 1;
    let cx = from.x;
    let cy = from.y;
    for (let j = 0; j < max; j++) {
      const next = w.grid.nearestExcluding(cx, cy, 200, ids, n);
      if (!next) break;
      ids[n++] = next.id;
      w.fx.lightning(cx, cy - 10, next.x, next.y - 10, COLORS.lightning);
      this.hit(next, damage, HIT_CHAIN | HIT_NOSTATUS, cx, cy, 40);
      cx = next.x;
      cy = next.y;
    }
  }

  // ---- death -------------------------------------------------------------------------------------

  kill(e: Enemy): void {
    if (e.dying) return;
    const w = this.w;
    const run = w.run;
    const stats = run.stats;
    e.dying = true;
    registerKill(run);
    if (e.isBoss) {
      w.hooks.bossKilled(e);
      return;
    }
    const burning = e.burnTime > 0;
    const poisoned = e.poisonTime > 0;
    const frozen = e.freezeTime > 0;
    let tint = DEATH_TINT[e.def.id] ?? 0xe0d8c8;
    if (burning) tint = COLORS.fire;
    else if (poisoned) tint = COLORS.poison;
    else if (frozen) tint = COLORS.frost;

    // visuals
    const sx = e.sprite.scaleX;
    w.fx.popSprite(e.sprite.texture.key, e.sprite.frame.name, e.sprite.x, e.sprite.y, sx, e.sprite.flipX, 0xffffff);
    w.fx.deathBurst(e.x, e.y - e.radius * 0.4, tint, e.elite);
    if (frozen) w.fx.emit('ice_shard', e.x, e.y - 10, 6, 0, 6.28, 90, 240, 0.35, 0.6, 1.4, 0.4, 0xffffff, 300, false);
    if (e.elite) {
      w.fx.ring(e.x, e.y, 20, 120, 0.35, 0xffd24a);
      w.fx.shake(0.14);
    }
    services.audio.play('enemyDeath');

    // loot
    this.dropLoot(e);

    // on-kill effects
    if (stats.lifeOnKill > 0) {
      const healed = healPlayer(run, stats.lifeOnKill);
      if (healed > 0) this.lifeAcc += healed;
    }
    if (stats.soulHarvest > 0) w.fx.wisp(e.x, e.y - 10, 0xb455f0);
    const chance = explodeChanceFor(stats, burning);
    if (chance > 0 && (chance >= 1 || w.rng.chance(chance))) w.abilities.queueExplosion(e.x, e.y, burning);
    if (poisoned && stats.poisonSpread > 0) w.status.spreadPoison(e);

    w.tele.cancelOwned(e.tele, e);
    e.release();
  }

  private dropLoot(e: Enemy): void {
    const w = this.w;
    const mult = e.summoned ? 0.4 : 1;
    const def = e.def;
    const xp = enemyXp(def, w.plan.index, e.elite) * mult;
    const x = e.x;
    const y = e.y - 4;
    const big = e.elite ? 3 : xp >= 14 ? 2 : 1;
    if (xp > 0) {
      const each = xp / big;
      for (let i = 0; i < big; i++) w.pickups.spawn(each >= 9 ? PICKUP_XP_BIG : PICKUP_XP, each, x, y);
    }
    if (!e.summoned) {
      const gold = enemyGold(def, w.plan, e.elite);
      if (gold > 0) {
        const coins = Math.min(e.elite ? 6 : 4, Math.max(1, Math.round(gold)));
        for (let i = 0; i < coins; i++) w.pickups.spawn(PICKUP_COIN, gold / coins, x, y);
      }
    }
  }
}
