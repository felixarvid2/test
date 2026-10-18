import { BALANCE } from '../../config/balance';
import { baseHitDamage, weaponStats, type WeaponStats } from '../../core/combat';
import type { Stats, WeaponId } from '../../core/types';
import { services } from '../../services';
import { COLORS, EXTRA_KEY } from '../assets';
import { HIT_WEAPON } from './CombatSystem';
import { TAU } from './layout';
import type { World } from './World';

const MAX_PENDING = 24;

/** Auto-fires every owned weapon at the nearest enemy on its own cooldown (stats come from core/combat). */
export class WeaponSystem {
  private cachedStats: Stats | null = null;
  private cachedCount = -1;
  private readonly ws: Partial<Record<WeaponId, WeaponStats>> = {};
  private base = 0;
  private readonly cd: Record<WeaponId, number> = { sword: 0.25, bow: 0.25, staff: 0.25 };
  private readonly near: import('../entities/Enemy').Enemy[] = [];
  /** Element look of projectiles: dominant element tint (-1 = none) and how many elements are active. */
  elemTint = -1;
  elemCount = 0;
  private chaos = false;
  // queued Double Strike repeats
  private readonly pt = new Float32Array(MAX_PENDING);
  private readonly pid: WeaponId[] = [];
  private readonly pm = new Float32Array(MAX_PENDING);
  private pn = 0;

  constructor(private readonly w: World) {}

  private refresh(): void {
    const run = this.w.run;
    if (this.cachedStats === run.stats && this.cachedCount === run.weapons.length) return;
    this.cachedStats = run.stats;
    this.cachedCount = run.weapons.length;
    for (const id of run.weapons) this.ws[id] = weaponStats(run, id);
    this.base = baseHitDamage(run);
    const s = run.stats;
    const scores: [number, number][] = [
      [s.burnDps > 0 ? s.burnChance : 0, COLORS.fire],
      [s.slowAmount > 0 ? s.slowChance : 0, COLORS.frost],
      [s.chainCount > 0 ? s.chainChance : 0, COLORS.lightning],
      [s.poisonDps > 0 ? s.poisonChance : 0, COLORS.poison],
    ];
    let best = 0;
    this.elemTint = -1;
    this.elemCount = 0;
    for (const [v, c] of scores) {
      if (v > 0) this.elemCount += 1;
      if (v > best) { best = v; this.elemTint = c; }
    }
    this.chaos = s.chaosLevel > 0;
    if (this.chaos) this.elemCount += 1;
  }

  /** Mean damage of the owned weapons: what abilities scale from. */
  get baseHit(): number {
    this.refresh();
    return this.base;
  }

  statsFor(id: WeaponId): WeaponStats | undefined {
    this.refresh();
    return this.ws[id];
  }

  reset(): void {
    this.pn = 0;
    this.cd.sword = this.cd.bow = this.cd.staff = 0.3;
  }

  update(dt: number): void {
    const w = this.w;
    this.refresh();
    if (!w.combatActive || w.player.dead) return;
    const run = w.run;
    for (let i = 0; i < run.weapons.length; i++) {
      const id = run.weapons[i];
      const ws = this.ws[id];
      if (!ws) continue;
      this.cd[id] -= dt;
      if (this.cd[id] > 0) continue;
      const target = this.target(id, ws);
      if (!target) { this.cd[id] = 0; continue; }
      this.cd[id] = ws.cooldown + Math.min(0, this.cd[id]);
      this.fire(id, ws, target.x, target.y, 1);
      const extra = Math.floor(run.stats.multiStrike);
      for (let k = 1; k <= extra && this.pn < MAX_PENDING; k++) {
        this.pt[this.pn] = 0.1 * k;
        this.pid[this.pn] = id;
        this.pm[this.pn] = BALANCE.weapons.multiStrikeDamage;
        this.pn += 1;
      }
    }
    // Double Strike repeats
    let i = 0;
    while (i < this.pn) {
      this.pt[i] -= dt;
      if (this.pt[i] > 0) { i++; continue; }
      const id = this.pid[i];
      const ws = this.ws[id];
      const target = ws ? this.target(id, ws) : null;
      if (ws && target) this.fire(id, ws, target.x, target.y, this.pm[i]);
      this.pn -= 1;
      this.pt[i] = this.pt[this.pn];
      this.pid[i] = this.pid[this.pn];
      this.pm[i] = this.pm[this.pn];
    }
  }

  private reach(ws: WeaponStats): number {
    return ws.range * Math.sqrt(ws.area);
  }

  private target(id: WeaponId, ws: WeaponStats): import('../entities/Enemy').Enemy | null {
    const p = this.w.player;
    return this.w.grid.nearest(p.x, p.y, id === 'sword' ? this.reach(ws) : ws.range);
  }

  private fire(id: WeaponId, ws: WeaponStats, tx: number, ty: number, mult: number): void {
    const p = this.w.player;
    const angle = Math.atan2(ty - p.y, tx - p.x);
    if (Math.abs(tx - p.x) > 6) p.facing = tx < p.x ? -1 : 1;
    if (id === 'sword') this.swing(ws, angle, mult);
    else if (id === 'bow') this.shootBow(ws, angle, mult);
    else this.castStaff(ws, angle, mult);
  }

  // ---- sword --------------------------------------------------------------------------------------

  private swing(ws: WeaponStats, angle: number, mult: number): void {
    const w = this.w;
    const p = w.player;
    const reach = this.reach(ws);
    const arc = (ws.arc * Math.PI) / 180;
    const full = arc >= TAU - 0.05;
    const n = w.grid.queryCircle(p.x, p.y, reach, this.near);
    for (let i = 0; i < n; i++) {
      const e = this.near[i];
      if (!full) {
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        let da = Math.atan2(dy, dx) - angle;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        if (Math.abs(da) > arc / 2 + Math.atan2(e.radius, d)) continue;
      }
      w.combat.hit(e, ws.damage * mult, HIT_WEAPON, p.x, p.y, ws.knockback);
    }
    // slash visuals: one crescent per ~120 degrees of arc
    const segs = Math.max(1, Math.ceil(arc / 2.1));
    const span = full ? TAU / segs : arc / segs;
    const start = full ? angle : angle - arc / 2;
    const R = reach * 0.92;
    const tint = this.elemTint >= 0 ? this.elemTint : 0xe8f0ff;
    const chord = 2 * R * Math.sin(Math.min(span, 3) / 2);
    const sy = Math.max(1.4, chord / 15);
    const sx = Math.max(sy * 0.42, (R * (1 - Math.cos(Math.min(span, 3) / 2)) * 1.7) / 26);
    for (let s = 0; s < segs; s++) {
      const a = full ? start + span * s : start + span * (s + 0.5);
      const dist = Math.max(14, R - 15 * sx);
      w.fx.anim('slash', p.x + Math.cos(a) * dist, p.y - 10 + Math.sin(a) * dist, 0.2, sx * 0.6, sy * 0.7, sx, sy, tint, 0, a, 1, 0, true);
    }
    if (full) w.fx.ring(p.x, p.y - 8, reach * 0.4, reach, 0.2, tint, 0.6);
    services.audio.play('swing', { rate: 0.95 + Math.random() * 0.15 });
  }

  // ---- bow ----------------------------------------------------------------------------------------

  private shootBow(ws: WeaponStats, angle: number, mult: number): void {
    const w = this.w;
    const p = w.player;
    const n = Math.max(1, Math.floor(ws.count));
    const spread = n > 1 ? Math.min(0.8, 0.13 * (n - 1)) : 0;
    for (let i = 0; i < n; i++) {
      const proj = w.playerShots.acquire();
      if (!proj) break;
      const a = n > 1 ? angle - spread / 2 + (spread * i) / (n - 1) : angle;
      w.playerShots.launch(proj, p.x + Math.cos(a) * 16, p.y - 12 + Math.sin(a) * 16, a, ws.projectileSpeed, EXTRA_KEY, 'arrow', 2.6, -1);
      proj.damage = ws.damage;
      proj.dmgMult = mult;
      proj.knock = ws.knockback;
      proj.pierce = ws.pierce;
      proj.bounces = 0;
      proj.radius = 10;
      proj.life = (ws.range * 1.35) / Math.max(1, ws.projectileSpeed) + 0.15;
      proj.homing = false;
      proj.noStatus = false;
      proj.companion = false;
      proj.tint = this.elemTint >= 0 ? this.elemTint : 0xffffff;
      proj.trail = this.elemTint >= 0 ? this.elemTint : 0;
      if (this.elemTint >= 0) proj.sprite.setTint(this.elemTint);
      else proj.sprite.clearTint();
    }
    services.audio.play('shoot', { rate: 0.95 + Math.random() * 0.2 });
  }

  // ---- staff --------------------------------------------------------------------------------------

  private castStaff(ws: WeaponStats, angle: number, mult: number): void {
    const w = this.w;
    const p = w.player;
    const n = Math.max(1, Math.floor(ws.count));
    const spread = n > 1 ? Math.min(0.9, 0.22 * (n - 1)) : 0;
    const tier = this.elemCount;
    const scale = 2.3 + Math.min(3, tier) * 0.28;
    for (let i = 0; i < n; i++) {
      const proj = w.playerShots.acquire();
      if (!proj) break;
      const a = n > 1 ? angle - spread / 2 + (spread * i) / (n - 1) : angle;
      const chaosTint = this.chaos ? [COLORS.fire, COLORS.frost, COLORS.lightning, COLORS.poison][(Math.random() * 4) | 0] : -1;
      const tint = chaosTint >= 0 ? chaosTint : this.elemTint;
      w.playerShots.launch(proj, p.x + Math.cos(a) * 14, p.y - 14 + Math.sin(a) * 14, a, ws.projectileSpeed, EXTRA_KEY, 'magic_bolt', scale, tint >= 0 ? tint : 0xc890ff, 4);
      proj.damage = ws.damage;
      proj.dmgMult = mult;
      proj.knock = ws.knockback;
      proj.pierce = ws.pierce;
      proj.bounces = ws.bounces;
      proj.radius = 13;
      proj.life = (ws.range * 1.9) / Math.max(1, ws.projectileSpeed) + 0.9;
      proj.homing = true;
      proj.noStatus = false;
      proj.companion = false;
      proj.tint = tint >= 0 ? tint : 0xc890ff;
      proj.trail = proj.tint;
      if (tint >= 0) proj.sprite.setTint(tint);
      else proj.sprite.clearTint();
    }
    w.fx.emit('spark', p.x + Math.cos(angle) * 18, p.y - 14 + Math.sin(angle) * 18, 3, angle, 0.8, 40, 120, 0.15, 0.3, 1, 0.1, this.elemTint >= 0 ? this.elemTint : 0xc890ff);
    services.audio.play('magic', { rate: 0.95 + Math.random() * 0.2 });
  }
}
