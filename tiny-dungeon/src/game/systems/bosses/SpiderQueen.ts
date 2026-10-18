import type Phaser from 'phaser';
import { ENEMY_BY_ID } from '../../../data/enemies';
import { COLORS, EXTRA_KEY } from '../../assets';
import { PLAY, TAU, clamp } from '../layout';
import type { AttackCtx, BossController, BossModule } from '../BossController';
import { type Spot, countAlive, lob, pickSpot, reroute, stateFor } from './shared';

const SILK = 0xdce8f4;
const VENOM = 0x8ee04a;
const VENOM_GLOW = 0x2c5a18;
const EGG_PURPLE = 0xb455f0;

const WEB_RADIUS = 66;
const WEB_LIFE = 6;
const WEB_FADE = 1;
const MAX_WEBS = 6;
const WEB_SLOW = 0.45;
const MAX_EGGS = 6;

interface Web {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  r: number;
  t: number;
  life: number;
}

interface State {
  webs: Web[];
  t: number;
  dir: number;
  flip: number;
}

const states = new WeakMap<BossController, State>();
const stateOf = (c: BossController): State => stateFor(states, c, () => ({ webs: [], t: 0, dir: 1, flip: 1.2 }));

// ---- webs on the floor ---------------------------------------------------------------------------

function addWeb(c: BossController, x: number, y: number): void {
  const w = c.w;
  const st = stateOf(c);
  // at most MAX_WEBS patches count as active; the oldest ones fade out early
  let active = 0;
  for (const web of st.webs) if (web.life - web.t > WEB_FADE * 0.5) active++;
  for (const web of st.webs) {
    if (active < MAX_WEBS) break;
    if (web.life - web.t > WEB_FADE * 0.5) { web.life = web.t + WEB_FADE * 0.5; active--; }
  }
  const img = c.track(w.scene.add.image(x, y, EXTRA_KEY, 'web').setDepth(6).setRotation(w.rng.next() * TAU));
  const full = (WEB_RADIUS * 2.1) / img.frame.width;
  img.setScale(full * 0.5);
  st.webs.push({ img, x, y, r: WEB_RADIUS, t: 0, life: WEB_LIFE });
}

function updateWebs(c: BossController, dt: number): void {
  const st = stateOf(c);
  const p = c.w.player;
  let on = false;
  for (let i = st.webs.length - 1; i >= 0; i--) {
    const web = st.webs[i];
    web.t += dt;
    if (web.t >= web.life) {
      c.release(web.img);
      st.webs.splice(i, 1);
      continue;
    }
    const full = (WEB_RADIUS * 2.1) / web.img.frame.width;
    const pop = Math.min(1, web.t / 0.18);
    web.img.setScale(full * (0.5 + 0.5 * pop)).setAlpha(Math.min(0.92, ((web.life - web.t) / WEB_FADE) * 0.92));
    const dx = p.x - web.x;
    const dy = p.y - web.y;
    const rr = web.r + p.radius * 0.4;
    if (dx * dx + dy * dy < rr * rr) on = true;
  }
  if (on) {
    p.slow(WEB_SLOW, 0.15);
    if (Math.random() < dt * 8) c.w.fx.emit('puff', p.x, p.y - 4, 1, -1.57, 1, 10, 40, 0.3, 0.5, 0.5, 0.9, SILK, 0, false, 0.8);
  }
}

// ---- attacks -------------------------------------------------------------------------------------

/** Lobs web balls at (and around) the hero; each splatters, hurts, and leaves a slowing web. */
function web({ c, boss, w, tune, dmg }: AttackCtx): number {
  const windup = tune.windup;
  const n = Math.max(1, tune.hitsPerUse);
  const r = WEB_RADIUS;
  const gap = 0.2;
  const spread = w.rng.next() * TAU;
  for (let i = 0; i < n; i++) {
    c.at(i * gap, () => {
      let px = w.player.x;
      let py = w.player.y;
      if (i > 0) {
        const a = spread + (i / n) * TAU;
        const d = 120 + w.rng.next() * 70;
        px += Math.cos(a) * d;
        py += Math.sin(a) * d;
      }
      px = clamp(px, PLAY.left + r * 0.7, PLAY.right - r * 0.7);
      py = clamp(py, PLAY.top + r * 0.7, PLAY.bottom - r * 0.7);
      boss.squash = 0.6;
      w.fx.emit('puff', boss.x, boss.y - 10, 3, 0, TAU, 30, 100, 0.25, 0.4, 1, 1.8, SILK, 0, false, 0.8);
      lob(c, 'web_ball', 3.4, boss.x, boss.y - boss.radius * 0.6, px, py, windup, 230, 6);
      w.tele.circle(px, py, r, windup, COLORS.danger, () => {
        if (!boss.active || boss.dying) return;
        w.fx.ring(px, py, r * 0.3, r * 1.2, 0.35, SILK);
        w.fx.emit('puff', px, py, 8, 0, TAU, 50, 190, 0.35, 0.6, 1.5, 0.4, SILK, 0, false, 0.9);
        w.fx.shake(0.1);
        c.hitCircle(px, py, r, dmg);
        addWeb(c, px, py);
      });
    });
  }
  boss.shake = 1.5;
  c.at((n - 1) * gap + 0.1, () => { boss.shake = 0; });
  return windup + (n - 1) * gap + 0.7;
}

/** Lays egg sacs around the room; each hatches into spiders unless it is destroyed first. */
function eggs(a: AttackCtx): number {
  const { c, boss, w, tune } = a;
  const def = ENEMY_BY_ID[tune.summon?.enemy ?? 'spider_egg'];
  const have = countAlive(w, def.id);
  const want = Math.min(tune.summon?.count ?? 3, MAX_EGGS - have);
  if (want <= 0) {
    // the nest is full: spit webs instead
    return reroute(a, 'spiderWeb', web);
  }
  const windup = tune.windup;
  const spots: Spot[] = [];
  for (const e of w.enemies.all) if (e.active && !e.dying && e.def.id === def.id) spots.push({ x: e.x, y: e.y });
  const id = boss.id;
  boss.shake = 2.5;
  c.at(windup, () => { boss.shake = 0; });
  for (let i = 0; i < want; i++) {
    const s = pickSpot(w, spots, 130, 190, 70, 560);
    spots.push(s);
    c.at(i * 0.14, () => {
      boss.squash = 0.7;
      lob(c, 'egg_sac', 3.2, boss.x, boss.y + boss.radius * 0.2, s.x, s.y, windup, 200, 4);
      w.tele.circle(s.x, s.y, 40, windup, EGG_PURPLE, () => {
        if (boss.id !== id || !boss.active || boss.dying) return;
        const e = w.enemies.spawnNow(def, s.x, s.y, false, true);
        if (e) e.squash = 0.8;
        w.fx.ring(s.x, s.y, 8, 60, 0.3, EGG_PURPLE);
        w.fx.emit('puff', s.x, s.y, 6, 0, TAU, 40, 140, 0.3, 0.5, 1.3, 0.3, SILK, 0, false, 0.9);
      }, 0.5);
    });
  }
  return windup + (want - 1) * 0.14 + 0.6;
}

/** One leap: a shadow circle tracks the hero, locks, then she jumps and lands on it. */
function leap(a: AttackCtx, windup: number, onLanded: (() => void) | null): void {
  const { c, boss, w, dmg } = a;
  const r = 100;
  const tele = w.tele.circle(w.player.x, w.player.y, r, windup, COLORS.danger, null);
  tele.tick = (t, p, dt) => {
    if (p < 0.5) {
      const k = 1 - Math.exp(-8 * dt);
      t.x += (clamp(w.player.x, PLAY.left + 50, PLAY.right - 50) - t.x) * k;
      t.y += (clamp(w.player.y, PLAY.top + 50, PLAY.bottom - 50) - t.y) * k;
    }
    boss.squash = 0.15 + 0.45 * p;
    boss.shake = 1 + p * 3;
  };
  const air = 0.5;
  c.at(windup, () => {
    boss.shake = 0;
    const sx = boss.x;
    const sy = boss.y;
    const tx = tele.x;
    const ty = tele.y;
    c.run(air, (p) => {
      boss.x = sx + (tx - sx) * p;
      boss.y = sy + (ty - sy) * p;
      boss.lift = Math.sin(Math.PI * p) * 170;
      boss.squash = p < 0.2 ? 0.4 * (1 - p / 0.2) : -0.2;
    }, () => {
      boss.lift = 0;
      boss.squash = 1;
      c.slam(tx, ty, r, 0.55);
      w.fx.emit('puff', tx, ty, 8, 0, TAU, 60, 240, 0.35, 0.6, 2, 0.4, SILK, 0, false, 0.8);
      c.hitCircle(tx, ty, r * 0.95, dmg);
      onLanded?.();
    });
  });
}

function pounce(a: AttackCtx): number {
  const { c, tune } = a;
  const windup = tune.windup;
  const air = 0.5;
  if (c.phaseIdx === 0) {
    leap(a, windup, null);
    return windup + air + 0.7;
  }
  // enraged: a second pounce, re-aimed with its own telegraph
  const second = Math.max(0.6, windup * 0.85);
  leap(a, windup, () => c.at(0.3, () => leap(a, second, null)));
  return windup + air + 0.3 + second + air + 0.7;
}

/** Cone of venom globs, several tight volleys down the same lanes. */
function venom({ c, boss, w, tune, dmg }: AttackCtx): number {
  const windup = tune.windup;
  const waves = Math.max(1, tune.hitsPerUse);
  const half = 0.5;
  const reach = 560;
  const lanes = 5;
  const aim = Math.atan2(w.player.y - boss.y, w.player.x - boss.x);
  const tele = w.tele.cone(boss.x, boss.y, aim, half, reach, windup, COLORS.danger, null);
  tele.tick = (t, p) => {
    t.x = boss.x;
    t.y = boss.y;
    if (p < 0.55) t.angle = Math.atan2(w.player.y - boss.y, w.player.x - boss.x);
    boss.shake = 3 * p;
    boss.squash = 0.4 * p;
    if (Math.random() < 0.35) w.fx.emit('puff', boss.x + Math.cos(t.angle) * 30, boss.y + Math.sin(t.angle) * 30, 1, t.angle, 0.5, 30, 90, 0.3, 0.5, 0.6, 1.1, VENOM, 0, false, 0.8);
  };
  const gap = 0.26;
  c.at(windup, () => {
    boss.shake = 0;
    const base = tele.angle;
    for (let k = 0; k < waves; k++) {
      c.at(k * gap, () => {
        boss.squash = 0.7;
        const sweep = (k - (waves - 1) / 2) * 0.05;
        for (let j = 0; j < lanes; j++) {
          const ang = base + sweep + (-half * 0.88 + (j / (lanes - 1)) * half * 1.76);
          const p = c.shoot(boss.x + Math.cos(ang) * 44, boss.y + Math.sin(ang) * 44, ang, 290, dmg, EXTRA_KEY, 'venom_glob', 3, VENOM_GLOW, 11);
          if (p) p.tint = VENOM;
        }
        w.fx.emit('puff', boss.x + Math.cos(base) * 46, boss.y + Math.sin(base) * 46, 4, base, half * 1.6, 60, 160, 0.25, 0.4, 0.9, 1.5, VENOM, 0, false, 0.85);
        w.fx.shake(0.08);
      });
    }
  });
  return windup + (waves - 1) * gap + 0.7;
}

/** She skitters: short fast scurries with pauses, circling the hero rather than ramming. */
function skitter(c: BossController, dt: number): void {
  const b = c.boss;
  const p = c.w.player;
  const st = stateOf(c);
  st.t += dt;
  st.flip -= dt;
  if (st.flip <= 0) {
    st.dir = -st.dir;
    st.flip = 1 + Math.random() * 1.2;
  }
  const dx = p.x - b.x;
  const dy = p.y - b.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / d;
  const ny = dy / d;
  // approach when far, back off when close, strafe in between
  let mx = -ny * st.dir * 0.8;
  let my = nx * st.dir * 0.8;
  if (d > 340) { mx += nx; my += ny; }
  else if (d < 200) { mx -= nx * 1.1; my -= ny * 1.1; }
  const burst = Math.max(0, Math.sin(st.t * 6.5));
  const sp = b.speed * c.speedMult * (0.12 + 2.3 * burst * burst) * (b.slowTime > 0 ? 1 - b.slowAmt : 1);
  const len = Math.sqrt(mx * mx + my * my) || 1;
  b.x += (mx / len) * sp * dt;
  b.y += (my / len) * sp * dt;
  const moving = burst > 0.15;
  b.shake = moving ? 1.6 : 0;
  b.squash = moving ? 0.06 + 0.07 * Math.sin(st.t * 45) : 0;
}

/** Hatch-prevention: the corpse's eggs vanish with her. */
function clearEggs(c: BossController): void {
  const w = c.w;
  for (const e of w.enemies.all) {
    if (!e.active || e.def.id !== 'spider_egg') continue;
    w.tele.cancelOwned(e.tele, e);
    w.fx.emit('puff', e.x, e.y, 4, 0, TAU, 30, 110, 0.3, 0.5, 1.1, 0.3, 0x9be04a, 0, false, 0.9);
    e.release();
  }
}

export const SPIDER_QUEEN: BossModule = {
  attacks: { spiderWeb: web, spiderEggs: eggs, spiderPounce: pounce, spiderVenom: venom },
  move: skitter,
  update: updateWebs,
  onStop: clearEggs,
};
