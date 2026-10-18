import { ENEMY_BY_ID } from '../../../data/enemies';
import { COLORS } from '../../assets';
import { PLAY, TAU, clamp } from '../layout';
import type { AttackCtx, BossModule } from '../BossController';

const BONE = 0xe8e0d0;

function sweep({ c, boss, w, tune, dmg }: AttackCtx): number {
  const windup = tune.windup;
  const reach = 260;
  const half = 1.1;
  const aim = Math.atan2(w.player.y - boss.y, w.player.x - boss.x);
  const tele = w.tele.cone(boss.x, boss.y, aim, half, reach, windup, COLORS.danger, null);
  tele.tick = (t, p) => {
    t.x = boss.x;
    t.y = boss.y;
    if (p < 0.6) t.angle = Math.atan2(w.player.y - boss.y, w.player.x - boss.x);
    boss.shake = 3 * p;
    boss.squash = -0.1 * p;
  };
  c.at(windup, () => {
    boss.shake = 0;
    const a = tele.angle;
    boss.squash = 0.7;
    // huge slash arc
    for (let k = -1; k <= 1; k++) {
      const ang = a + k * 0.75;
      w.fx.anim('slash', boss.x + Math.cos(ang) * reach * 0.62, boss.y + Math.sin(ang) * reach * 0.62, 0.28, 4.2, 10, 6, 14, 0xffffff, 0, ang, 1, 0, true);
    }
    w.fx.ring(boss.x, boss.y, 40, reach * 1.1, 0.3, 0xffffff, 0.6);
    w.fx.shake(0.4);
    c.hitCone(boss.x, boss.y, a, half, reach, dmg);
  });
  return windup + 0.7;
}

function summon({ c, boss, w, tune }: AttackCtx): number {
  const windup = tune.windup;
  const def = ENEMY_BY_ID[tune.summon?.enemy ?? 'skeleton'];
  const count = (tune.summon?.count ?? 3) + (c.phaseIdx > 0 ? 1 : 0);
  const id = boss.id;
  boss.shake = 2;
  c.at(windup, () => { boss.shake = 0; });
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + w.rng.next();
    const r = 150 + w.rng.next() * 110;
    const px = clamp(w.player.x + Math.cos(a) * r, PLAY.left + 40, PLAY.right - 40);
    const py = clamp(w.player.y + Math.sin(a) * r, PLAY.top + 40, PLAY.bottom - 40);
    w.tele.circle(px, py, 38, windup, 0xb455f0, () => {
      if (boss.id !== id || !boss.active || boss.dying) return;
      w.enemies.spawnNow(def, px, py, false, true);
      w.fx.emit('puff', px, py, 6, 0, TAU, 40, 150, 0.3, 0.6, 1.6, 0.4, BONE, 0, false, 0.9);
      w.fx.ring(px, py, 8, 60, 0.3, 0xb455f0);
    }, 0.5);
  }
  return windup + 0.6;
}

function charge({ c, boss, w, tune, dmg }: AttackCtx): number {
  const windup = tune.windup;
  const half = boss.radius + 10;
  const aim = Math.atan2(w.player.y - boss.y, w.player.x - boss.x);
  // ray to the wall along the aim direction
  const lineEnd = (ang: number, out: { x: number; y: number; len: number }): void => {
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    let t = 4000;
    if (dx > 0.001) t = Math.min(t, (PLAY.right - boss.radius - boss.x) / dx);
    else if (dx < -0.001) t = Math.min(t, (PLAY.left + boss.radius - boss.x) / dx);
    if (dy > 0.001) t = Math.min(t, (PLAY.bottom - boss.radius - boss.y) / dy);
    else if (dy < -0.001) t = Math.min(t, (PLAY.top + boss.radius - boss.y) / dy);
    out.x = boss.x + dx * t;
    out.y = boss.y + dy * t;
    out.len = t;
  };
  const end = { x: 0, y: 0, len: 0 };
  lineEnd(aim, end);
  const tele = w.tele.line(boss.x, boss.y, end.x, end.y, half, windup, COLORS.danger, null);
  let ang = aim;
  tele.tick = (t, p) => {
    if (p < 0.5) {
      ang = Math.atan2(w.player.y - boss.y, w.player.x - boss.x);
      lineEnd(ang, end);
      t.x = boss.x; t.y = boss.y; t.x2 = end.x; t.y2 = end.y;
    }
    boss.shake = 4 * p;
  };
  const speed = 780;
  c.at(windup, () => {
    boss.shake = 0;
    lineEnd(ang, end);
    const sx = boss.x;
    const sy = boss.y;
    const ex = end.x;
    const ey = end.y;
    const dur = Math.max(0.2, end.len / speed);
    let hit = false;
    c.run(dur, (p) => {
      boss.x = sx + (ex - sx) * p;
      boss.y = sy + (ey - sy) * p;
      boss.squash = 0.25;
      if (Math.random() < 0.7) w.fx.emit('puff', boss.x, boss.y + boss.radius * 0.6, 1, ang + Math.PI, 1, 30, 120, 0.25, 0.45, 1.4, 0.3, BONE, 0, false, 0.7);
      if (!hit && c.hitCircle(boss.x, boss.y, boss.radius + 6, dmg)) hit = true;
    }, () => {
      c.slam(boss.x, boss.y, 130, 0.55);
      boss.squash = 1;
    });
  });
  const len = end.len;
  return windup + Math.max(0.2, len / speed) + 0.9;
}

export const SKELETON_KING: BossModule = {
  attacks: { kingSweep: sweep, kingSummon: summon, kingCharge: charge },
};
