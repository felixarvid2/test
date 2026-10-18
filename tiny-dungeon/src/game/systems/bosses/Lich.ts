import Phaser from 'phaser';
import { ENEMY_BY_ID } from '../../../data/enemies';
import { COLORS, EXTRA_KEY } from '../../assets';
import { FX_GLOW, FX_RING } from '../Effects';
import { PLAY, TAU, clamp } from '../layout';
import type { AttackCtx, BossController, BossModule } from '../BossController';
import { countAlive, pickSpot, reroute, stateFor, type Spot } from './shared';

const CYAN = 0x6ae8ff;
const FROST = 0xbff2ff;
const SOUL = 0xb455f0;
/** Additive glows of bolts are kept dim: bright cyan on the red floor washes out to white. */
const SOUL_GLOW = 0x103a4c;
const MAX_GHOSTS = 6;

/** Radius the frost nova reaches, shown in full by its telegraph. */
const NOVA_RADIUS = 330;

interface State {
  t: number;
  glow: Phaser.GameObjects.Image | null;
}

const states = new WeakMap<BossController, State>();
const stateOf = (c: BossController): State => stateFor(states, c, () => ({ t: 0, glow: null }));

/** Bobbing and the cyan glow around the floating body. */
function float(c: BossController, dt: number): void {
  const b = c.boss;
  const w = c.w;
  const st = stateOf(c);
  st.t += dt;
  b.lift = 20 + Math.sin(st.t * 2.2) * 8;
  if (!st.glow) {
    st.glow = c.track(w.scene.add.image(b.x, b.y, FX_GLOW).setTint(CYAN).setBlendMode(Phaser.BlendModes.ADD).setDepth(99));
  }
  const pulse = 0.5 + 0.5 * Math.sin(st.t * 3);
  st.glow.setPosition(b.sprite.x, b.sprite.y).setScale(2.9 + pulse * 0.35).setAlpha((0.26 + pulse * 0.1) * b.alpha);
  if (b.alpha > 0.5 && Math.random() < dt * 7) {
    w.fx.emit('spark', b.x + (Math.random() - 0.5) * b.radius * 1.6, b.y - b.lift * 0.5, 1, -1.57, 0.6, 20, 60, 0.6, 1, 1.1, 0.1, CYAN, -30, true);
  }
}

// ---- attacks -------------------------------------------------------------------------------------

/** Fades out leaving a frost burst, then reappears at the marked spot, never on top of the hero. */
function blink({ c, boss, w, tune, dmg }: AttackCtx): number {
  const windup = tune.windup;
  const ox = boss.x;
  const oy = boss.y;
  const burst = 105;
  const away = 0.6;
  const dest: Spot = pickSpot(w, [{ x: ox, y: oy }], 180, 270, 90);
  const id = boss.id;
  // the frost burst goes off when the marker is full (the fade-out ticks first, so it cannot override the vanish)
  const tele = w.tele.circle(ox, oy, burst, windup, COLORS.danger, () => {
    if (boss.id !== id || !boss.active || boss.dying) return;
    boss.shake = 0;
    boss.alpha = 0;
    boss.untargetable = true;
    w.fx.ring(ox, oy, burst * 0.2, burst * 1.15, 0.4, FROST);
    w.fx.ring(ox, oy, burst * 0.1, burst * 0.8, 0.3, 0xffffff, 0.8);
    w.fx.emit('ice_shard', ox, oy - 10, 10, 0, TAU, 120, 320, 0.35, 0.65, 1.6, 0.4, 0xffffff, 260, false);
    w.fx.emit('puff', ox, oy, 6, 0, TAU, 40, 160, 0.3, 0.55, 1.6, 0.4, FROST, 0, false, 0.8);
    w.fx.shake(0.3);
    c.hitCircle(ox, oy, burst, dmg);
    boss.x = dest.x;
    boss.y = dest.y;
    w.tele.circle(dest.x, dest.y, 56, away, CYAN, () => {
      if (boss.id !== id || !boss.active || boss.dying) return;
      boss.untargetable = false;
      w.fx.ring(dest.x, dest.y, 10, 90, 0.35, CYAN);
      w.fx.emit('spark', dest.x, dest.y - 10, 12, 0, TAU, 60, 220, 0.3, 0.55, 1.3, 0.1, CYAN, -40, true);
      boss.squash = 0.8;
      c.run(0.25, (p) => { boss.alpha = p; }, () => { boss.alpha = 1; });
    }, 0.5);
  });
  tele.tick = (t, p) => {
    t.x = ox;
    t.y = oy;
    boss.alpha = 1 - 0.8 * p * p;
    boss.shake = 1 + p * 4;
  };
  return windup + away + 0.7;
}

/** Rotating spiral arms of soul bolts. Each arm leaves wide gaps; phase 3 adds a counter-rotating one. */
function spiral({ c, boss, w, tune, dmg }: AttackCtx): number {
  const windup = tune.windup;
  const dual = c.phaseIdx >= 2;
  const arms = 3;
  const waves = tune.hitsPerUse * (dual ? 2 : 3);
  const interval = dual ? 0.2 : 0.17;
  const step = c.phaseIdx === 1 ? 0.11 : 0.1;
  const speed = 205;
  const tele = w.tele.circle(boss.x, boss.y, 90, windup, COLORS.danger, null, 0.25);
  tele.tick = (t, p) => {
    t.x = boss.x;
    t.y = boss.y;
    boss.shake = 3 * p;
    if (Math.random() < 0.5) w.fx.emit('spark', boss.x, boss.y, 1, Math.random() * TAU, 0.1, 40, 100, 0.25, 0.4, 1, 0.1, CYAN, 0, true);
  };
  const dir = w.rng.next() < 0.5 ? -1 : 1;
  const a0 = w.rng.next() * TAU;
  c.at(windup, () => {
    boss.shake = 0;
    for (let k = 0; k < waves; k++) {
      c.at(k * interval, () => {
        const ang = a0 + dir * k * step;
        for (let j = 0; j < arms; j++) {
          const a = ang + (j * TAU) / arms;
          fire(c, boss.x, boss.y, a, speed, dmg);
        }
        if (dual) {
          const back = a0 + TAU / arms / 2 - dir * k * step;
          for (let j = 0; j < arms; j++) fire(c, boss.x, boss.y, back + (j * TAU) / arms, speed, dmg);
        }
        if (k % 3 === 0) {
          boss.squash = 0.35;
          w.fx.ring(boss.x, boss.y, 24, 70, 0.22, CYAN, 0.6);
        }
      });
    }
  });
  return windup + waves * interval + 0.6;
}

function fire(c: BossController, x: number, y: number, a: number, speed: number, dmg: number): void {
  const p = c.shoot(x + Math.cos(a) * 34, y - 6 + Math.sin(a) * 34, a, speed, dmg, EXTRA_KEY, 'soul_bolt', 2.7, SOUL_GLOW, 9);
  if (p) p.tint = CYAN;
}

/** A ring fills out to its full radius; then a frost shockwave sweeps outward. Be outside it, or take the hit. */
function nova({ c, boss, w, tune, dmg }: AttackCtx): number {
  const windup = tune.windup;
  const expand = 1.05;
  const band = 38;
  const tele = w.tele.circle(boss.x, boss.y, NOVA_RADIUS, windup, COLORS.danger, null, 0.28);
  tele.tick = (t, p) => {
    t.x = boss.x;
    t.y = boss.y;
    boss.shake = 1 + 4 * p;
    boss.squash = -0.25 * p;
    const a = Math.random() * TAU;
    const r = NOVA_RADIUS * (0.9 - 0.7 * p);
    w.fx.emit('spark', boss.x + Math.cos(a) * r, boss.y + Math.sin(a) * r, 1, a + Math.PI, 0.05, r * 1.4, r * 1.7, 0.4 * (1 - p) + 0.12, 0.5 * (1 - p) + 0.15, 1.2, 0.1, CYAN, 0, true);
  };
  c.at(windup, () => {
    boss.shake = 0;
    boss.squash = 1;
    const cx = boss.x;
    const cy = boss.y;
    w.fx.flash(0xbff2ff, 0.2, 0.18);
    w.fx.shake(0.4);
    const ring = c.track(w.scene.add.image(cx, cy, FX_RING).setTint(CYAN).setBlendMode(Phaser.BlendModes.ADD).setDepth(42));
    let hit = false;
    c.run(expand, (p) => {
      const rf = NOVA_RADIUS * p;
      ring.setScale(Math.max(0.05, rf / 60)).setAlpha(0.95 - 0.35 * p);
      const a = Math.random() * TAU;
      w.fx.emit('ice_shard', cx + Math.cos(a) * rf, cy + Math.sin(a) * rf, 2, a, 0.6, 30, 120, 0.25, 0.45, 1.1, 0.3, 0xffffff, 0, false);
      if (hit) return;
      const pl = w.player;
      const d = Math.hypot(pl.x - cx, pl.y - 6 - cy);
      if (d <= rf + pl.radius * 0.6 && d >= rf - band && pl.hurt(dmg)) {
        hit = true;
        pl.slow(0.5, 1.8);
        w.fx.emit('ice_shard', pl.x, pl.y - 14, 8, 0, TAU, 80, 220, 0.3, 0.55, 1.2, 0.3, 0xffffff, 240, false);
      }
    }, () => c.release(ring));
  });
  return windup + expand + 0.6;
}

/** Purple circles on the floor, then ghosts rise from them. */
function raise(a: AttackCtx): number {
  const { c, boss, w, tune } = a;
  const def = ENEMY_BY_ID[tune.summon?.enemy ?? 'ghost'];
  const count = Math.min(tune.summon?.count ?? 3, MAX_GHOSTS - countAlive(w, def.id));
  if (count <= 0) return reroute(a, 'lichSpiral', spiral);
  const windup = tune.windup;
  const id = boss.id;
  const spots: Spot[] = [];
  boss.shake = 2;
  c.at(windup, () => { boss.shake = 0; boss.squash = 0.8; });
  for (let i = 0; i < count; i++) {
    const s = pickSpot(w, spots, 110, 150, 60, 420);
    spots.push(s);
    const tele = w.tele.circle(s.x, s.y, 40, windup, SOUL, () => {
      if (boss.id !== id || !boss.active || boss.dying) return;
      const e = w.enemies.spawnNow(def, s.x, s.y, false, true);
      if (e) e.squash = 0.9;
      w.fx.emit('spark', s.x, s.y - 6, 10, -1.57, 1.6, 80, 260, 0.35, 0.6, 1.3, 0.1, SOUL, -60, true);
      w.fx.ring(s.x, s.y, 8, 64, 0.3, SOUL);
      boss.squash = 0.8;
    }, 0.5);
    tele.tick = (_t, p) => {
      if (Math.random() < 0.5) w.fx.emit('spark', s.x + (Math.random() - 0.5) * 50, s.y, 1, -1.57, 0.3, 40, 110 + 90 * p, 0.3, 0.5, 1, 0.1, SOUL, 0, true);
      boss.squash = -0.2 * p;
    };
  }
  return windup + 0.7;
}

/** Keeps its distance and drifts around the upper room. */
function drift(c: BossController, dt: number): void {
  const b = c.boss;
  const p = c.w.player;
  const dx = p.x - b.x;
  const dy = p.y - b.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const sp = b.speed * c.speedMult * (b.slowTime > 0 ? 1 - b.slowAmt : 1);
  const towards = d > 440 ? 1 : d < 270 ? -1.4 : 0;
  b.x += ((dx / d) * towards + (-dy / d) * 0.35 * Math.sin(c.w.roomTime * 0.6)) * sp * dt;
  b.y += ((dy / d) * towards) * sp * dt + (400 - b.y) * Math.min(1, dt * 0.5);
  b.x = clamp(b.x, PLAY.left + 70, PLAY.right - 70);
  b.shake = 0;
}

function stop(c: BossController): void {
  c.boss.alpha = 1;
  c.boss.untargetable = false;
}

export const LICH: BossModule = {
  attacks: { lichBlink: blink, lichSpiral: spiral, lichNova: nova, lichRaise: raise },
  move: drift,
  update: float,
  onStop: stop,
};
