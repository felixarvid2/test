import { BALANCE, type BossAttackTuning } from '../../config/balance';
import type { BossAttackId, BossDef } from '../../core/types';
import { COLORS, EXTRA_KEY } from '../assets';
import type { Enemy } from '../entities/Enemy';
import { angleDiff, clamp } from './layout';
import type { World } from './World';

/** What an attack function receives. It schedules telegraphs / timelines and returns how long the boss is busy. */
export interface AttackCtx {
  c: BossController;
  boss: Enemy;
  w: World;
  tune: BossAttackTuning;
  /** Raw damage of one hit of this attack (boss damage x attack multiplier). */
  dmg: number;
}

export type AttackFn = (a: AttackCtx) => number;

/** One module per boss: its attacks, how it idles, what happens when it dies. */
export interface BossModule {
  attacks: Partial<Record<BossAttackId, AttackFn>>;
  /** Idle movement between attacks. Defaults to walking toward the hero. */
  move?(c: BossController, dt: number): void;
  onDeath?(c: BossController): void;
}

interface Timed {
  t: number;
  fn: () => void;
}

interface Process {
  t: number;
  dur: number;
  step: (p: number, dt: number) => void;
  end: (() => void) | null;
}

/**
 * Drives a boss from its BossDef phases: picks attacks, runs their timelines, switches phase by HP
 * fraction (roar), and exposes helpers for damage zones and projectiles. Everything runs on simulation
 * time so slow-motion and hitstop apply to attacks too.
 */
export class BossController {
  readonly boss: Enemy;
  phaseIdx = 0;
  /** Seconds the current attack still occupies the boss. */
  busy = 1.2;
  /** Seconds until the next attack may start. */
  cooldown = 1.4;
  private last: BossAttackId | null = null;
  private readonly timers: Timed[] = [];
  private readonly processes: Process[] = [];
  private readonly info = { name: '', title: '', hp: 0, maxHp: 1 };

  constructor(readonly w: World, readonly def: BossDef, private readonly mod: BossModule, boss: Enemy) {
    this.boss = boss;
    boss.bossCtrl = this;
    this.info.name = def.name;
    this.info.title = def.title;
  }

  get phase(): BossDef['phases'][number] {
    return this.def.phases[this.phaseIdx];
  }

  get speedMult(): number {
    return this.phase.speedMult;
  }

  /** Snapshot for the HUD (mutated in place; the registry holds the same object). */
  hudInfo(): { name: string; title: string; hp: number; maxHp: number } {
    this.info.hp = Math.max(0, this.boss.hp);
    this.info.maxHp = this.boss.maxHp;
    return this.info;
  }

  // ---- scheduling helpers for attack modules -----------------------------------------------------

  at(delay: number, fn: () => void): void {
    this.timers.push({ t: delay, fn });
  }

  /** Runs `step(progress 0..1, dt)` for `dur` seconds, then `end`. */
  run(dur: number, step: (p: number, dt: number) => void, end: (() => void) | null = null): void {
    this.processes.push({ t: 0, dur, step, end });
  }

  /** True while the boss should stand still (attacking). */
  get attacking(): boolean {
    return this.busy > 0;
  }

  // ---- damage zones ------------------------------------------------------------------------------

  hitCircle(x: number, y: number, r: number, dmg: number): boolean {
    const p = this.w.player;
    const dx = p.x - x;
    const dy = p.y - 6 - y;
    const rr = r + p.radius * 0.6;
    if (dx * dx + dy * dy <= rr * rr) return p.hurt(dmg);
    return false;
  }

  hitCone(x: number, y: number, angle: number, half: number, r: number, dmg: number): boolean {
    const p = this.w.player;
    const dx = p.x - x;
    const dy = p.y - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > r + p.radius * 0.6) return false;
    const margin = Math.atan2(p.radius * 0.7, Math.max(d, 1));
    if (Math.abs(angleDiff(angle, Math.atan2(dy, dx))) > half + margin) return false;
    return p.hurt(dmg);
  }

  hitLine(x1: number, y1: number, x2: number, y2: number, halfW: number, dmg: number): boolean {
    const p = this.w.player;
    const vx = x2 - x1;
    const vy = y2 - y1;
    const len2 = vx * vx + vy * vy || 1;
    const t = clamp(((p.x - x1) * vx + (p.y - y1) * vy) / len2, 0, 1);
    const cx = x1 + vx * t;
    const cy = y1 + vy * t;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const rr = halfW + p.radius * 0.6;
    if (dx * dx + dy * dy <= rr * rr) return p.hurt(dmg);
    return false;
  }

  /** Enemy projectile with the boss's outline treatment. */
  shoot(x: number, y: number, angle: number, speed: number, dmg: number, key: string, frame: string | number, scale: number, glow: number, radius: number, spin = 0): void {
    const w = this.w;
    const p = w.enemyShots.acquire();
    if (!p) return;
    w.enemyShots.launch(p, x, y, angle, speed * (1 + 0.06 * this.phaseIdx), key, frame, scale, glow, spin);
    p.damage = dmg;
    p.radius = radius;
    p.life = 4;
    p.tint = glow >= 0 ? glow : 0xff6040;
    p.trail = 0;
  }

  fireball(x: number, y: number, angle: number, speed: number, dmg: number): void {
    this.shoot(x, y, angle, speed, dmg, EXTRA_KEY, 'fireball', 2.6, 0xff6a20, 14, 0.001);
  }

  /** Expanding ring + dust, for landings and slams. */
  slam(x: number, y: number, r: number, shake = 0.5): void {
    const w = this.w;
    w.fx.ring(x, y, r * 0.2, r * 1.25, 0.4, 0xffffff, 0.8);
    w.fx.ring(x, y, r * 0.1, r, 0.3, COLORS.danger, 0.9);
    w.fx.emit('puff', x, y, 10, 0, 6.28, 60, r * 2.2, 0.35, 0.6, 2, 0.5, 0xc8b8a0, 0, false, 0.8);
    w.fx.shake(shake);
  }

  // ---- per-frame ---------------------------------------------------------------------------------

  updateMovement(dt: number): void {
    if (this.attacking) return;
    if (this.mod.move) { this.mod.move(this, dt); return; }
    const b = this.boss;
    const p = this.w.player;
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const sp = b.speed * this.speedMult * (b.slowTime > 0 ? 1 - b.slowAmt : 1);
    b.x += (dx / d) * sp * dt;
    b.y += (dy / d) * sp * dt;
  }

  update(dt: number): void {
    const b = this.boss;
    if (b.dying) return;
    // timeline
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) {
        this.timers.splice(i, 1);
        t.fn();
      }
    }
    for (let i = this.processes.length - 1; i >= 0; i--) {
      const pr = this.processes[i];
      pr.t += dt;
      const p = Math.min(1, pr.t / pr.dur);
      pr.step(p, dt);
      if (p >= 1) {
        this.processes.splice(i, 1);
        if (pr.end) pr.end();
      }
    }

    // phase by HP fraction
    const frac = b.hp / b.maxHp;
    let want = 0;
    for (let i = 0; i < this.def.phases.length; i++) if (frac <= this.def.phases[i].hpBelow) want = i;
    if (want > this.phaseIdx) {
      this.phaseIdx = want;
      this.roar();
    }

    if (this.busy > 0) this.busy -= dt;
    if (this.busy > 0) return;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    this.startAttack();
  }

  private roar(): void {
    const w = this.w;
    const b = this.boss;
    w.fx.shake(0.55);
    w.fx.flash(0xff4040, 0.3, 0.3);
    w.fx.ring(b.x, b.y, 30, 380, 0.6, COLORS.danger, 0.9);
    w.fx.ring(b.x, b.y, 10, 260, 0.45, 0xffffff, 0.7);
    w.numbers.spawn(b.x, b.y - b.sprite.displayHeight * 0.7, 'ENRAGED!', COLORS.danger, 3, true);
    b.squash = 1;
    b.flash = 0.3;
    this.busy = Math.max(this.busy, 0.9);
    this.cooldown = 0.5;
  }

  private startAttack(): void {
    const phase = this.phase;
    const list = phase.attacks;
    const w = this.w;
    let id = list[Math.floor(w.rng.next() * list.length)];
    for (let tries = 0; tries < 3 && list.length > 1 && id === this.last; tries++) id = list[Math.floor(w.rng.next() * list.length)];
    this.launchAttack(id);
    this.cooldown = phase.attackDelay / phase.speedMult;
  }

  /** Starts one attack right now (also used by the debug hook to inspect telegraphs). */
  launchAttack(id: BossAttackId): void {
    this.last = id;
    const fn = this.mod.attacks[id];
    const tune = BALANCE.bossAttacks[id];
    if (!fn) { this.cooldown = 0.5; return; }
    const dmg = Math.max(1, Math.round(this.boss.dmg * tune.damage));
    this.busy = fn({ c: this, boss: this.boss, w: this.w, tune, dmg });
  }

  /** Called when the boss dies: stops everything it had scheduled. */
  stop(): void {
    this.timers.length = 0;
    this.processes.length = 0;
    this.busy = 0;
    this.w.tele.clear();
    this.boss.setMark(false);
    this.boss.shake = 0;
  }

  onDeath(): void {
    this.mod.onDeath?.(this);
  }
}

