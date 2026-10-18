import { ENEMY_BY_ID } from '../../../data/enemies';
import { COLORS, TILES_KEY, TILE_FRAMES } from '../../assets';
import { PLAY, TAU, clamp } from '../layout';
import type { AttackCtx, BossModule } from '../BossController';

const GREEN = 0x63e0a0;

function jump({ c, boss, w, tune, dmg }: AttackCtx): number {
  const windup = tune.windup;
  const r = 112;
  const tele = w.tele.circle(w.player.x, w.player.y, r, windup, COLORS.danger, null);
  tele.tick = (t, p, dt) => {
    // The marker keeps tracking the hero for the first part of the windup, then locks.
    if (p < 0.55) {
      const k = 1 - Math.exp(-7 * dt);
      t.x += (clamp(w.player.x, PLAY.left + 40, PLAY.right - 40) - t.x) * k;
      t.y += (clamp(w.player.y, PLAY.top + 40, PLAY.bottom - 40) - t.y) * k;
    }
    boss.squash = 0.15 + 0.45 * p;
    boss.shake = p * 3;
  };
  const air = 0.62;
  c.at(windup, () => {
    boss.shake = 0;
    const sx = boss.x;
    const sy = boss.y;
    const tx = tele.x;
    const ty = tele.y;
    c.run(air, (p) => {
      boss.x = sx + (tx - sx) * p;
      boss.y = sy + (ty - sy) * p;
      boss.lift = Math.sin(Math.PI * p) * 200;
      boss.squash = p < 0.2 ? 0.4 * (1 - p / 0.2) : -0.15;
    }, () => {
      boss.lift = 0;
      boss.squash = 1;
      c.slam(tx, ty, r, 0.6);
      w.fx.emit('puff', tx, ty, 10, 0, TAU, 80, 300, 0.4, 0.7, 2.2, 0.4, GREEN, 0, false, 0.9);
      c.hitCircle(tx, ty, r * 0.95, dmg);
    });
  });
  return windup + air + 0.6;
}

function burst({ c, boss, w, tune, dmg }: AttackCtx): number {
  const windup = tune.windup;
  const hits = Math.max(1, tune.hitsPerUse);
  const n = 11;
  const tele = w.tele.circle(boss.x, boss.y, boss.radius * 2.6, windup, COLORS.danger, null, 0.25);
  tele.tick = (t, p) => {
    t.x = boss.x;
    t.y = boss.y;
    boss.shake = 2 + p * 5;
    boss.squash = 0.3 * Math.sin(p * 30);
  };
  for (let k = 0; k < hits; k++) {
    c.at(windup + k * 0.34, () => {
      boss.shake = 0;
      boss.squash = 0.9;
      const off = k * (TAU / n / 2) + w.rng.next() * 0.2;
      for (let i = 0; i < n; i++) {
        const a = off + (i * TAU) / n;
        const sx = boss.x + Math.cos(a) * boss.radius * 0.8;
        const sy = boss.y - 6 + Math.sin(a) * boss.radius * 0.8;
        c.shoot(sx, sy, a, 215, dmg, TILES_KEY, TILE_FRAMES.slime, 1.5, 0x63c74d, 14, 0.0001);
      }
      w.fx.ring(boss.x, boss.y, boss.radius * 0.8, boss.radius * 2.2, 0.3, GREEN, 0.9);
      w.fx.shake(0.15);
    });
  }
  return windup + (hits - 1) * 0.34 + 0.5;
}

function spawnSlimes(a: AttackCtx, count: number, summoned: boolean): void {
  const { boss, w } = a;
  const def = ENEMY_BY_ID.slime;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * TAU + w.rng.next() * 0.6;
    const e = w.enemies.spawnNow(def, boss.x + Math.cos(ang) * boss.radius, boss.y + Math.sin(ang) * boss.radius, false, summoned);
    if (e) {
      e.kvx = Math.cos(ang) * 1100;
      e.kvy = Math.sin(ang) * 1100;
      e.squash = 1;
    }
  }
  w.fx.ring(boss.x, boss.y, boss.radius, boss.radius * 2.4, 0.35, GREEN);
  w.fx.emit('puff', boss.x, boss.y, 8, 0, TAU, 60, 220, 0.4, 0.7, 2, 0.4, GREEN, 0, false, 0.9);
}

function split(a: AttackCtx): number {
  const { c, boss, w, tune } = a;
  const windup = tune.windup;
  const count = Math.min(3, tune.summon?.count ?? 3);
  const tele = w.tele.circle(boss.x, boss.y, boss.radius * 2.2, windup, 0xb455f0, null, 0.3);
  tele.tick = (t, p) => {
    t.x = boss.x;
    t.y = boss.y;
    boss.squash = -0.2 + 0.5 * Math.sin(p * 18);
    boss.shake = 3;
  };
  c.at(windup, () => {
    boss.shake = 0;
    boss.squash = 1;
    spawnSlimes(a, count, true);
  });
  return windup + 0.6;
}

export const GIANT_SLIME: BossModule = {
  attacks: { slimeJump: jump, slimeBurst: burst, slimeSplit: split },
  onDeath(c) {
    // The corpse bursts into four slimes that must be cleared too.
    const a: AttackCtx = { c, boss: c.boss, w: c.w, tune: { damage: 0, windup: 0, hitsPerUse: 0 }, dmg: 0 };
    spawnSlimes(a, 4, true);
  },
};
