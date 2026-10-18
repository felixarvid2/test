import { COLORS, EXTRA_KEY } from '../../assets';
import { PLAY, TAU, clamp } from '../layout';
import type { AttackCtx, BossController, BossModule } from '../BossController';

const FIRE = 0xff7a2f;

function breath({ c, boss, w, tune, dmg }: AttackCtx): number {
  const windup = tune.windup;
  const half = 0.5;
  const reach = 560;
  const tele = w.tele.cone(boss.x, boss.y + 24, Math.atan2(w.player.y - boss.y, w.player.x - boss.x), half, reach, windup, COLORS.danger, null);
  tele.tick = (t, p) => {
    t.x = boss.x;
    t.y = boss.y + 24;
    if (p < 0.7) t.angle = Math.atan2(w.player.y - boss.y - 24, w.player.x - boss.x);
    boss.shake = 3 * p;
    if (Math.random() < 0.4) w.fx.emit('spark', boss.x, boss.y + 30, 1, t.angle, 0.6, 60, 160, 0.2, 0.35, 1, 0.1, FIRE);
  };
  const stream = 1.2;
  const shots = 13;
  c.at(windup, () => {
    boss.shake = 0;
    const base = tele.angle;
    const dir = w.rng.next() < 0.5 ? -1 : 1;
    let sent = 0;
    w.fx.shake(0.2);
    c.run(stream, (p) => {
      // fireballs leave the mouth in a sweeping stream
      const target = Math.floor(p * shots);
      while (sent < target) {
        const ang = base + dir * (-half * 0.85 + (sent / (shots - 1)) * half * 1.7);
        c.fireball(boss.x + Math.cos(ang) * 40, boss.y + 24 + Math.sin(ang) * 40, ang, 330, dmg);
        w.fx.emit('spark', boss.x + Math.cos(ang) * 44, boss.y + 24 + Math.sin(ang) * 44, 3, ang, 0.8, 80, 200, 0.15, 0.3, 1.2, 0.1, FIRE);
        sent += 1;
      }
    });
  });
  return windup + stream + 0.5;
}

function tail({ c, boss, w, tune, dmg }: AttackCtx): number {
  const windup = tune.windup;
  const half = 1.35;
  const reach = 215;
  const tele = w.tele.cone(boss.x, boss.y, Math.atan2(w.player.y - boss.y, w.player.x - boss.x), half, reach, windup, COLORS.danger, null);
  tele.tick = (t, p) => {
    t.x = boss.x;
    t.y = boss.y;
    if (p < 0.55) t.angle = Math.atan2(w.player.y - boss.y, w.player.x - boss.x);
    boss.shake = 2.5 * p;
  };
  c.at(windup, () => {
    boss.shake = 0;
    const a = tele.angle;
    for (let k = -2; k <= 2; k++) {
      const ang = a + k * 0.55;
      w.fx.anim('slash', boss.x + Math.cos(ang) * reach * 0.6, boss.y + Math.sin(ang) * reach * 0.6, 0.26, 3, 7, 4.5, 9.5, 0xffd0a0, 0, ang, 1, 0, true);
    }
    c.slam(boss.x, boss.y, reach * 0.9, 0.45);
    c.hitCone(boss.x, boss.y, a, half, reach, dmg);
  });
  return windup + 0.6;
}

function meteors({ c, boss, w, tune, dmg }: AttackCtx): number {
  const windup = tune.windup;
  const count = 5;
  const r = 82;
  const id = boss.id;
  for (let i = 0; i < count; i++) {
    const px = clamp(i === 0 ? w.player.x : w.player.x + (w.rng.next() - 0.5) * 520, PLAY.left + 60, PLAY.right - 60);
    const py = clamp(i === 0 ? w.player.y : w.player.y + (w.rng.next() - 0.5) * 420, PLAY.top + 80, PLAY.bottom - 60);
    const img = w.scene.add.image(px, py - 900, EXTRA_KEY, 'meteor').setScale(5).setDepth(415).setRotation(Math.PI * 0.75);
    const dur = windup + i * 0.15;
    const tele = w.tele.circle(px, py, r, dur, COLORS.danger, () => {
      img.destroy();
      if (boss.id !== id) return;
      w.fx.ring(px, py, 20, r * 1.2, 0.4, FIRE);
      w.fx.emit('puff', px, py, 7, 0, TAU, 40, 200, 0.4, 0.7, 2, 0.5, 0x6a4030, 0, false, 0.8);
      w.fx.emit('spark', px, py, 12, 0, TAU, 100, 400, 0.3, 0.6, 1.5, 0.1, 0xffb050, 220, true);
      w.fx.shake(0.14);
      c.hitCircle(px, py, r, dmg);
    });
    tele.tick = (_t, p) => {
      img.setPosition(px + (1 - p * p) * -120, py - (1 - p * p) * 900);
    };
  }
  boss.shake = 3;
  c.at(windup, () => { boss.shake = 0; });
  return windup + count * 0.15 + 0.7;
}

function ring({ c, boss, w, tune, dmg }: AttackCtx): number {
  const windup = tune.windup;
  const rings = 3;
  const n = 12;
  const spacing = 0.55;
  const t = w.tele.circle(boss.x, boss.y, 150, windup, COLORS.danger, null, 0.25);
  t.tick = (tt, p) => {
    tt.x = boss.x;
    tt.y = boss.y;
    boss.shake = 4 * p;
  };
  for (let k = 0; k < rings; k++) {
    c.at(windup + k * spacing, () => {
      boss.shake = 0;
      const off = k * (TAU / n / 3) + (k % 2) * 0.13;
      for (let i = 0; i < n; i++) {
        const a = off + (i * TAU) / n;
        c.fireball(boss.x + Math.cos(a) * 60, boss.y + 20 + Math.sin(a) * 60, a, 235, dmg);
      }
      w.fx.ring(boss.x, boss.y + 20, 40, 240, 0.35, FIRE);
      w.fx.shake(0.18);
    });
  }
  return windup + (rings - 1) * spacing + 0.6;
}

/** The dragon hovers near the top of the room and drifts after the hero's x position. */
function hover(c: BossController, dt: number): void {
  const b = c.boss;
  const targetX = clamp(c.w.player.x, 190, 530);
  const targetY = 330 + Math.sin(c.w.roomTime * 1.4) * 22;
  const step = b.speed * c.speedMult * dt * 1.5;
  b.x += clamp(targetX - b.x, -step, step);
  b.y += (targetY - b.y) * Math.min(1, dt * 1.4);
}

export const DRAGON: BossModule = {
  attacks: { dragonBreath: breath, dragonTailSwipe: tail, dragonMeteors: meteors, dragonRing: ring },
  move: hover,
};
