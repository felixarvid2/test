import { BALANCE } from '../../config/balance';
import type { EnemyDef } from '../../core/types';
import { ENEMY_BY_ID } from '../../data/enemies';
import { services } from '../../services';
import { COLORS, EXTRA_KEY } from '../assets';
import { PLAY, TAU, clamp } from '../systems/layout';
import type { World } from '../systems/World';
import { AI_DASH, AI_RECOVER, AI_WALK, AI_WINDUP, type Enemy } from './Enemy';

const DASH_TIME = 0.26;
const RECOVER_TIME = 0.45;

function speedFactor(e: Enemy): number {
  if (e.freezeTime > 0) return 0;
  return e.slowTime > 0 ? Math.max(0.15, 1 - e.slowAmt) : 1;
}

function moveBy(e: Enemy, vx: number, vy: number, dt: number): void {
  e.x += vx * dt;
  e.y += vy * dt;
}

/** Keeps a ranged unit around `range`: approach, back off, or strafe. */
function keepDistance(e: Enemy, nx: number, ny: number, dist: number, range: number, sp: number, dt: number): void {
  if (dist > range * 0.95) moveBy(e, nx * sp, ny * sp, dt);
  else if (dist < range * 0.5) moveBy(e, -nx * sp * 0.9, -ny * sp * 0.9, dt);
  else {
    const side = Math.sin(e.phase * 3) > 0 ? 1 : -1;
    moveBy(e, -ny * side * sp * 0.45, nx * side * sp * 0.45, dt);
  }
}

const EGG_GREEN = 0x9be04a;

/** The sac cracks open: its young scatter, the shell bursts. Same path whatever the egg's `summon` is. */
function hatchEgg(w: World, e: Enemy, def: EnemyDef): void {
  const kid = def.summon ? ENEMY_BY_ID[def.summon] : undefined;
  const n = def.summonCount ?? 2;
  w.tele.cancelOwned(e.tele, e);
  e.tele = null;
  w.fx.ring(e.x, e.y, 10, 70, 0.32, EGG_GREEN);
  w.fx.emit('puff', e.x, e.y - 6, 7, 0, TAU, 40, 160, 0.3, 0.55, 1.6, 0.4, EGG_GREEN, 0, false, 0.9);
  w.fx.emit('spark', e.x, e.y - 6, 10, 0, TAU, 90, 280, 0.25, 0.5, 1.3, 0.1, 0xf4f0c8, 160, true);
  w.fx.shake(0.1);
  if (kid) {
    const a0 = Math.random() * TAU;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU;
      const k = w.enemies.spawnNow(kid, e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14, false, true);
      if (k) {
        k.kvx = Math.cos(a) * 700;
        k.kvy = Math.sin(a) * 700;
        k.squash = 1;
      }
    }
  }
  e.release();
}

/** Behaviour of one regular enemy for one frame (movement and attack state machines). */
export function updateEnemyAI(w: World, e: Enemy, dt: number): void {
  if (e.spawnT < 0.25) return;
  const def = e.def as EnemyDef;
  const pl = w.player;
  const dx = pl.x - e.x;
  const dy = pl.y - e.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  const sp = e.speed * speedFactor(e);
  const t = w.roomTime;
  if (e.freezeTime > 0) return;
  e.cd -= dt;

  switch (def.behavior) {
    case 'chase':
    case 'tank': {
      let m = 1;
      if (def.behavior === 'chase') m = 0.15 + 1.75 * Math.abs(Math.sin(t * e.bobFreq + e.phase));
      moveBy(e, nx * sp * m, ny * sp * m, dt);
      break;
    }
    case 'erratic': {
      const weave = dist > 70 ? Math.sin(t * 5 + e.phase) * 1.1 : 0;
      const a = Math.atan2(dy, dx) + weave;
      const m = 0.9 + 0.3 * Math.sin(t * 3 + e.phase);
      moveBy(e, Math.cos(a) * sp * m, Math.sin(a) * sp * m, dt);
      break;
    }
    case 'lunge': {
      const range = def.attackRange ?? 90;
      if (e.ai === AI_WALK) {
        moveBy(e, nx * sp, ny * sp, dt);
        if (e.cd <= 0 && dist < range * 1.3) {
          e.ai = AI_WINDUP;
          e.t = 0;
          e.setMark(true);
          e.shake = 5;
        }
      } else if (e.ai === AI_WINDUP) {
        e.t += dt;
        if (e.t >= (def.windup ?? 0.5)) {
          e.dx = nx;
          e.dy = ny;
          e.ai = AI_DASH;
          e.t = 0;
          e.setMark(false);
          e.shake = 0;
          e.squash = 0.8;
          w.fx.puff(e.x, e.y + e.radius * 0.5, 0xd8d0c0, 3, 0.9);
        }
      } else if (e.ai === AI_DASH) {
        e.t += dt;
        const dashSpeed = (range * 1.5) / DASH_TIME;
        moveBy(e, e.dx * dashSpeed * speedFactor(e), e.dy * dashSpeed * speedFactor(e), dt);
        if (e.t >= DASH_TIME) { e.ai = AI_RECOVER; e.t = 0; }
      } else {
        e.t += dt;
        if (e.t >= RECOVER_TIME) { e.ai = AI_WALK; e.cd = def.attackCooldown ?? 2; }
      }
      break;
    }
    case 'ranged': {
      const range = def.attackRange ?? 300;
      const windup = def.windup ?? 0.6;
      if (e.ai === AI_WALK) {
        keepDistance(e, nx, ny, dist, range, sp, dt);
        if (e.cd <= 0 && dist < range * 1.05) {
          e.ai = AI_WINDUP;
          e.t = 0;
          e.dx = nx;
          e.dy = ny;
          const len = Math.min(range * 1.3, 460);
          const tele = w.tele.line(e.x, e.y - 8, e.x + nx * len, e.y - 8 + ny * len, 5, windup, 0xff3a3a, null);
          tele.owner = e;
          tele.fill = 0.7;
          e.tele = tele;
          e.shake = 2;
        }
      } else if (e.ai === AI_WINDUP) {
        e.t += dt;
        if (e.t < windup * 0.65) { e.dx = nx; e.dy = ny; }
        const tele = e.tele;
        if (tele && tele.owner === e) {
          const len = Math.min(range * 1.3, 460);
          tele.x = e.x; tele.y = e.y - 8; tele.x2 = e.x + e.dx * len; tele.y2 = e.y - 8 + e.dy * len;
        }
        if (e.t >= windup) {
          w.tele.cancelOwned(e.tele, e);
          e.tele = null;
          e.shake = 0;
          e.ai = AI_WALK;
          e.cd = def.attackCooldown ?? 2.4;
          const p = w.enemyShots.acquire();
          if (p) {
            const a = Math.atan2(e.dy, e.dx);
            w.enemyShots.launch(p, e.x + e.dx * 14, e.y - 8 + e.dy * 14, a, def.projectileSpeed ?? 260, EXTRA_KEY, 'enemy_arrow', 2.6, COLORS.danger);
            p.damage = e.dmg;
            p.radius = 9;
            p.life = 3.5;
            p.tint = 0xff6040;
            p.trail = 0;
            services.audio.play('shoot', { volume: 0.5, rate: 0.7 });
          }
        }
      }
      break;
    }
    case 'egg': {
      // Never moves. A green ring fills as it nears hatching; the sac wobbles faster and flashes.
      const hatch = def.windup ?? 4.5;
      if (!e.tele || e.tele.owner !== e || !e.tele.on) {
        const tele = w.tele.circle(e.x, e.y + e.radius * 0.3, e.radius + 34, hatch, EGG_GREEN, null, 0.3);
        tele.owner = e;
        tele.tick = (tt) => {
          tt.x = e.x;
          tt.y = e.y + e.radius * 0.3;
          tt.t = Math.min(tt.dur, e.t);
        };
        e.tele = tele;
      }
      e.t += dt;
      const k = Math.min(1, e.t / hatch);
      const wob = Math.sin(t * (6 + 30 * k * k) + e.phase);
      e.shake = 0.5 + 5 * k * k;
      e.squash = 0.04 + (0.08 + 0.2 * k) * (0.5 + 0.5 * wob);
      if (k > 0.55 && wob > 0.94) e.flash = 0.05;
      if (e.t >= hatch) hatchEgg(w, e, def);
      break;
    }
    case 'summoner': {
      const range = def.attackRange ?? 340;
      const windup = def.windup ?? 1.1;
      if (e.ai === AI_WALK) {
        keepDistance(e, nx, ny, dist, range, sp, dt);
        const room = BALANCE.limits.maxEnemiesAlive - w.enemies.aliveCount - w.enemies.pendingCount;
        const count = def.summonCount ?? 2;
        if (e.cd <= 0 && dist < range * 1.2 && room >= count) {
          e.ai = AI_WINDUP;
          e.t = 0;
          e.shake = 3;
          const summon = def.summon ? ENEMY_BY_ID[def.summon] : undefined;
          const id = e.id;
          for (let k = 0; k < count; k++) {
            const a = Math.random() * TAU;
            const r = 70 + Math.random() * 40;
            const px = clamp(e.x + Math.cos(a) * r, PLAY.left + 30, PLAY.right - 30);
            const py = clamp(e.y + Math.sin(a) * r, PLAY.top + 30, PLAY.bottom - 30);
            w.tele.circle(px, py, 34, windup, 0xb455f0, () => {
              if (e.id !== id || !e.active || e.dying || !summon) return;
              w.enemies.spawnNow(summon, px, py, false, true);
              w.fx.burst('spark', px, py, 8, 60, 200, 0.4, 1.3, 0.1, 0xb455f0, 0, true);
              w.fx.ring(px, py, 8, 50, 0.3, 0xb455f0);
            }, 0.5);
          }
        }
      } else if (e.ai === AI_WINDUP) {
        e.t += dt;
        if (Math.random() < dt * 14) w.fx.emit('spark', e.x, e.y - e.radius, 1, -1.57, 1, 30, 90, 0.4, 0.6, 1, 0.1, 0xb455f0, -40, true);
        if (e.t >= windup) {
          e.shake = 0;
          e.ai = AI_WALK;
          e.cd = def.attackCooldown ?? 6;
        }
      }
      break;
    }
  }
}

/** Clamp to the playfield (called after every move, including knockback). */
export function clampToPlayfield(e: Enemy): void {
  const r = e.radius;
  e.x = clamp(e.x, PLAY.left + r, PLAY.right - r);
  e.y = clamp(e.y, PLAY.top + r * 0.6, PLAY.bottom - 6);
}
