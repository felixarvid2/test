import { ENEMY_BY_ID } from '../../../data/enemies';
import { COLORS, EXTRA_KEY } from '../../assets';
import { PICKUP_COIN } from '../../entities/PickupPool';
import { PLAY, TAU, clamp } from '../layout';
import type { AttackCtx, BossController, BossModule } from '../BossController';
import { type Spot, countAlive, pickSpot, reroute, stateFor } from './shared';

const GOLD = 0xffd860;
const TONGUE = 0xe0405a;
const TONGUE_DARK = 0x6a1024;
const PURPLE = 0xb455f0;
const MAX_MIMICS = 5;
/** Coins that miss and land on the floor: at most this many per attack become 1-gold pickups. */
const COIN_PICKUPS = 4;

interface State {
  hopping: boolean;
  ht: number;
  wait: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  dur: number;
  dir: number;
  t: number;
}

const states = new WeakMap<BossController, State>();
const stateOf = (c: BossController): State => stateFor(states, c, () => ({
  hopping: false, ht: 0, wait: 0.6, sx: 0, sy: 0, tx: 0, ty: 0, dur: 0.4, dir: 1, t: 0,
}));

// ---- hopping -------------------------------------------------------------------------------------

/** Advances a hop in flight (it finishes even if an attack starts) and flaps the lid while resting. */
function hopStep(c: BossController, dt: number): void {
  const b = c.boss;
  const w = c.w;
  const st = stateOf(c);
  st.t += dt;
  if (st.hopping) {
    st.ht += dt;
    const p = Math.min(1, st.ht / st.dur);
    b.x = st.sx + (st.tx - st.sx) * p;
    b.y = st.sy + (st.ty - st.sy) * p;
    b.lift = Math.sin(Math.PI * p) * 56;
    if (!c.attacking) b.squash = p < 0.25 ? -0.25 : 0.1;
    if (p >= 1) {
      st.hopping = false;
      b.lift = 0;
      b.squash = 0.8;
      st.wait = (0.35 + Math.random() * 0.3) / c.speedMult;
      w.fx.emit('puff', b.x, b.y + b.radius * 0.4, 4, 0, TAU, 40, 140, 0.25, 0.45, 1.3, 0.3, 0xc8b8a0, 0, false, 0.8);
      w.fx.shake(0.08);
    }
  } else if (!c.attacking) {
    b.squash = 0.14 * Math.sin(st.t * 13) * (0.6 + 0.4 * Math.sin(st.t * 2));
  }
}

/** Starts the next hop: closer when far away, sideways when near. Never lands on the hero. */
function hop(c: BossController, dt: number): void {
  const b = c.boss;
  const p = c.w.player;
  const st = stateOf(c);
  if (st.hopping) return;
  st.wait -= dt;
  if (st.wait > 0) return;
  const dx = p.x - b.x;
  const dy = p.y - b.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / d;
  const ny = dy / d;
  let mx: number;
  let my: number;
  if (d > 260) {
    const step = Math.min(150 * c.speedMult, d - 220);
    mx = nx * step;
    my = ny * step;
  } else {
    if (Math.random() < 0.4) st.dir = -st.dir;
    mx = -ny * st.dir * 140 - nx * (d < 190 ? 60 : 0);
    my = nx * st.dir * 140 - ny * (d < 190 ? 60 : 0);
  }
  st.sx = b.x;
  st.sy = b.y;
  st.tx = clamp(b.x + mx, PLAY.left + b.radius, PLAY.right - b.radius);
  st.ty = clamp(b.y + my, PLAY.top + b.radius, PLAY.bottom - b.radius);
  st.hopping = true;
  st.ht = 0;
  st.dur = 0.42 / c.speedMult;
}

// ---- attacks -------------------------------------------------------------------------------------

/** End of a straight run of length `len` from the boss along `ang`, kept inside the room. */
function runEnd(boss: { x: number; y: number; radius: number }, ang: number, len: number, out: Spot): void {
  out.x = clamp(boss.x + Math.cos(ang) * len, PLAY.left + boss.radius, PLAY.right - boss.radius);
  out.y = clamp(boss.y + Math.sin(ang) * len, PLAY.top + boss.radius, PLAY.bottom - boss.radius);
}

/** A line shows the run; the jaws chatter; then a fast lunge with snapping bites. */
function chomp({ c, boss, w, tune, dmg }: AttackCtx): number {
  const windup = tune.windup;
  const half = boss.radius + 8;
  const end: Spot = { x: 0, y: 0 };
  let ang = Math.atan2(w.player.y - boss.y, w.player.x - boss.x);
  const lenFor = (): number => clamp(Math.hypot(w.player.x - boss.x, w.player.y - boss.y) + 200, 340, 560);
  runEnd(boss, ang, lenFor(), end);
  const tele = w.tele.line(boss.x, boss.y, end.x, end.y, half, windup, COLORS.danger, null);
  tele.tick = (t, p) => {
    if (p < 0.55) {
      ang = Math.atan2(w.player.y - boss.y, w.player.x - boss.x);
      runEnd(boss, ang, lenFor(), end);
    }
    t.x = boss.x; t.y = boss.y; t.x2 = end.x; t.y2 = end.y;
    boss.shake = 1 + 3 * p;
    boss.squash = 0.3 * Math.sin(p * 40);
  };
  const speed = 840;
  c.at(windup, () => {
    boss.shake = 0;
    const sx = boss.x;
    const sy = boss.y;
    const ex = end.x;
    const ey = end.y;
    const dur = Math.max(0.2, Math.hypot(ex - sx, ey - sy) / speed);
    let hit = false;
    w.fx.emit('coin_0', sx, sy - 10, 6, ang + Math.PI, 1.6, 120, 320, 0.4, 0.7, 1.8, 1.4, 0xffffff, 500, false);
    c.run(dur, (p) => {
      boss.x = sx + (ex - sx) * p;
      boss.y = sy + (ey - sy) * p;
      boss.squash = 0.5 * Math.sin(p * dur * 46);
      if (Math.random() < 0.7) w.fx.emit('puff', boss.x, boss.y + boss.radius * 0.6, 1, ang + Math.PI, 1, 30, 120, 0.25, 0.45, 1.4, 0.3, 0xc8b8a0, 0, false, 0.7);
      if (!hit && c.hitCircle(boss.x, boss.y, boss.radius + 6, dmg)) hit = true;
    }, () => {
      boss.squash = 1;
      c.slam(boss.x, boss.y, 110, 0.45);
      w.fx.anim('slash', boss.x + Math.cos(ang) * 40, boss.y + Math.sin(ang) * 40, 0.24, 3.4, 8, 5, 11, 0xfff0c0, 0, ang, 1, 0, true);
    });
  });
  return windup + Math.max(0.2, Math.hypot(end.x - boss.x, end.y - boss.y) / speed) + 0.8;
}

/** Fan telegraph, then waves of gold coins. Coins that miss drop on the floor; a few can be picked up (1 gold each). */
function coins({ c, boss, w, tune, dmg }: AttackCtx): number {
  const windup = tune.windup;
  const waves = Math.max(1, tune.hitsPerUse);
  const lanes = 5;
  const half = 0.55;
  const reach = 600;
  const aim = Math.atan2(w.player.y - boss.y, w.player.x - boss.x);
  const tele = w.tele.cone(boss.x, boss.y, aim, half, reach, windup, COLORS.danger, null);
  tele.tick = (t, p) => {
    t.x = boss.x;
    t.y = boss.y;
    if (p < 0.55) t.angle = Math.atan2(w.player.y - boss.y, w.player.x - boss.x);
    boss.shake = 1 + 3 * p;
    boss.squash = 0.35 * Math.sin(p * 34);
    if (Math.random() < 0.3) w.fx.emit('spark', boss.x, boss.y - 14, 1, t.angle, 0.6, 60, 160, 0.25, 0.4, 1, 0.1, GOLD);
  };
  // which of the coins can turn into a pickup if they land on the floor
  const picks = new Set<number>();
  const total = waves * lanes;
  while (picks.size < Math.min(COIN_PICKUPS, total)) picks.add(Math.floor(w.rng.next() * total));
  const gap = 0.28;
  c.at(windup, () => {
    boss.shake = 0;
    const base = tele.angle;
    for (let k = 0; k < waves; k++) {
      c.at(k * gap, () => {
        boss.squash = 0.8;
        const sweep = (k - (waves - 1) / 2) * 0.08;
        for (let j = 0; j < lanes; j++) {
          const a = base + sweep + (-half * 0.88 + (j / (lanes - 1)) * half * 1.76);
          const p = c.shoot(boss.x + Math.cos(a) * 44, boss.y - 6 + Math.sin(a) * 44, a, 260, dmg, EXTRA_KEY, 'coin_0', 2.4, -1, 11, 9);
          if (!p) continue;
          p.tint = GOLD;
          const real = picks.has(k * lanes + j);
          p.land = (lx, ly) => {
            w.fx.emit('spark', lx, ly, 3, 0, TAU, 30, 110, 0.2, 0.35, 1, 0.1, GOLD);
            if (real) w.pickups.spawn(PICKUP_COIN, 1, lx, ly, true, 0.35);
          };
        }
        w.fx.emit('coin_0', boss.x + Math.cos(base) * 40, boss.y + Math.sin(base) * 40, 4, base, half * 1.6, 120, 300, 0.3, 0.5, 1.6, 1, 0xffffff, 300, false);
        w.fx.shake(0.08);
      });
    }
  });
  return windup + (waves - 1) * gap + 0.8;
}

/** A thin red tongue lashes out along the marked line and snaps back. */
function tongue({ c, boss, w, tune, dmg }: AttackCtx): number {
  const windup = tune.windup;
  const reach = 560;
  const halfW = 15;
  const mouthY = (): number => boss.y - boss.radius * 0.2;
  let ang = Math.atan2(w.player.y - mouthY(), w.player.x - boss.x);
  const tele = w.tele.line(boss.x, mouthY(), boss.x + Math.cos(ang) * reach, mouthY() + Math.sin(ang) * reach, halfW + 3, windup, COLORS.danger, () => { boss.squash = 0.8; });
  tele.tick = (t, p) => {
    if (p < 0.6) ang = Math.atan2(w.player.y - mouthY(), w.player.x - boss.x);
    t.x = boss.x; t.y = mouthY();
    t.x2 = boss.x + Math.cos(ang) * reach; t.y2 = mouthY() + Math.sin(ang) * reach;
    boss.shake = 1 + 2 * p;
    boss.squash = 0.25 * Math.sin(p * 30);
  };
  const out = 0.14;
  const hold = 0.12;
  const back = 0.3;
  c.at(windup, () => {
    boss.shake = 0;
    boss.squash = 0.8;
    const ox = boss.x;
    const oy = mouthY();
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const g = c.track(w.scene.add.graphics().setDepth(410));
    let hit = false;
    const total = out + hold + back;
    c.run(total, (p) => {
      const tt = p * total;
      const ext = tt < out ? 1 - (1 - tt / out) * (1 - tt / out) : tt < out + hold ? 1 : 1 - (tt - out - hold) / back;
      const len = reach * Math.max(0.02, ext);
      const tx = ox + dx * len;
      const ty = oy + dy * len;
      if (!hit && tt < out + hold && c.hitLine(ox, oy, tx, ty, halfW, dmg)) hit = true;
      g.clear();
      const px = -dy;
      const py = dx;
      const seg = 10;
      for (const [width, color] of [[17, TONGUE_DARK], [10, TONGUE]] as const) {
        g.lineStyle(width, color, 1);
        g.beginPath();
        for (let i = 0; i <= seg; i++) {
          const f = i / seg;
          const wob = Math.sin(f * 9 - tt * 40) * 4 * f * (1 - ext * 0.4);
          const x = ox + dx * len * f + px * wob;
          const y = oy + dy * len * f + py * wob;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokePath();
      }
      g.fillStyle(TONGUE_DARK, 1);
      g.fillCircle(tx, ty, 11);
      g.fillStyle(0xff7088, 1);
      g.fillCircle(tx, ty, 7);
    }, () => {
      c.release(g);
      boss.squash = 0.4;
    });
    w.fx.emit('spark', ox, oy, 6, ang, 0.6, 100, 260, 0.2, 0.4, 1.1, 0.1, TONGUE);
    w.fx.shake(0.12);
  });
  return windup + out + hold + back + 0.7;
}

/** The lid flaps open and little mimics pop up from the floor markers. */
function decoys(a: AttackCtx): number {
  const { c, boss, w, tune } = a;
  const def = ENEMY_BY_ID[tune.summon?.enemy ?? 'mimic'];
  const count = Math.min(tune.summon?.count ?? 2, MAX_MIMICS - countAlive(w, def.id));
  if (count <= 0) return reroute(a, 'mimicChomp', chomp);
  const windup = tune.windup;
  const id = boss.id;
  const spots: Spot[] = [];
  boss.shake = 2;
  c.at(windup, () => { boss.shake = 0; boss.squash = 0.9; });
  for (let i = 0; i < count; i++) {
    const s = pickSpot(w, spots, 100, 150, 60, 420);
    spots.push(s);
    const tele = w.tele.circle(s.x, s.y, 38, windup, PURPLE, () => {
      if (boss.id !== id || !boss.active || boss.dying) return;
      const e = w.enemies.spawnNow(def, s.x, s.y, false, true);
      if (e) e.squash = 0.9;
      w.fx.ring(s.x, s.y, 8, 62, 0.3, GOLD);
      w.fx.emit('puff', s.x, s.y, 6, 0, TAU, 40, 150, 0.3, 0.55, 1.4, 0.3, 0xe8d8b0, 0, false, 0.9);
      w.fx.emit('coin_0', s.x, s.y - 8, 5, -1.57, 1.8, 120, 320, 0.35, 0.6, 1.6, 1, 0xffffff, 600, false);
      boss.squash = 0.9;
    }, 0.5);
    tele.tick = () => { boss.squash = 0.3 * Math.sin(w.roomTime * 26); };
  }
  return windup + 0.7;
}

export const MIMIC_KING: BossModule = {
  attacks: { mimicChomp: chomp, mimicCoins: coins, mimicTongue: tongue, mimicDecoys: decoys },
  move: hop,
  update: hopStep,
};
