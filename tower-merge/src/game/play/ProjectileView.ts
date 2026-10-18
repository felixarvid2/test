import Phaser from 'phaser';
import type { ProjectileKind, WorldApi } from '../../sim/api';
import { projKey } from '../assetKeys';
import { TOWER_COLORS } from '../ui/theme';
import { D } from './constants';
import type { Effects } from './Effects';
import { IdMirror, type QualityMeter } from './logic';
import { TEX } from './textures';

const MAX_PROJECTILES = 320;
const MAX_ZONES = 12;

const SIZE: Record<ProjectileKind, number> = {
  arrow: 50, cannonball: 32, frostShard: 40, fireball: 42, poisonGlob: 32, magicOrb: 38, shard: 28, bomblet: 24, meteor: 150,
};
const SPINS: Partial<Record<ProjectileKind, number>> = { cannonball: 8, bomblet: 12, poisonGlob: 5 };
const TRAIL: Partial<Record<ProjectileKind, number>> = { fireball: 0xff8a3a, magicOrb: 0xe879f9, meteor: 0xff7a2b, frostShard: 0xbfeeff };

interface PSlot {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image | null;
  trailT: number;
  kind: ProjectileKind | '';
  size: number;
}

/** Pooled projectile sprites mirrored by index: rotation, lob arcs with ground shadows, cheap trails. */
export class ProjectileLayer {
  private readonly slots: PSlot[] = [];
  private readonly mirror = new IdMirror(MAX_PROJECTILES);

  constructor(private readonly scene: Phaser.Scene, private readonly fx: Effects, private readonly quality: QualityMeter) {
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const sprite = scene.add.image(0, 0, projKey('arrow')).setDepth(D.proj).setVisible(false);
      this.slots.push({ sprite, shadow: null, trailT: 0, kind: '', size: 40 });
    }
  }

  update(world: WorldApi, time: number, dt: number): void {
    const list = world.projectiles;
    const n = Math.min(list.length, MAX_PROJECTILES);
    const trails = this.quality.preset.trails;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      const s = this.slots[i];
      const change = this.mirror.sync(i, p.active, p.id);
      if (change === 'idle') continue;
      if (change === 'despawn') {
        s.sprite.setVisible(false);
        s.shadow?.setVisible(false);
        continue;
      }
      if (change === 'spawn') {
        s.kind = p.kind;
        s.size = SIZE[p.kind] ?? 36;
        s.sprite.setTexture(projKey(p.kind)).setVisible(true);
        s.sprite.setScale(s.size / s.sprite.frame.width);
        s.sprite.setDepth(p.kind === 'meteor' ? D.fxTop : D.proj);
        s.trailT = 0;
        const tc = p.towerType ? TOWER_COLORS[p.towerType] : undefined;
        if (tc !== undefined && (p.kind === 'magicOrb' || p.kind === 'arrow')) s.sprite.clearTint();
      }
      const lob = p.arcHeight > 0;
      const lift = lob ? Math.sin(Math.PI * p.arcT) * p.arcHeight : 0;
      const spin = SPINS[p.kind];
      s.sprite.setPosition(p.x, p.y - lift);
      s.sprite.setRotation(spin ? time * spin : p.angle);
      if (lob) {
        if (!s.shadow) s.shadow = this.scene.add.image(0, 0, TEX.shadow).setDepth(D.ground + 0.2);
        const k = 1 - Math.min(1, lift / 120) * 0.45;
        s.shadow.setVisible(true).setPosition(p.x, p.y + 2).setScale((34 * k) / s.shadow.frame.width, (16 * k) / s.shadow.frame.height).setAlpha(0.8);
      } else if (s.shadow && s.shadow.visible) {
        s.shadow.setVisible(false);
      }
      const tc = TRAIL[p.kind];
      if (trails && tc !== undefined) {
        s.trailT -= dt;
        if (s.trailT <= 0) {
          s.trailT = p.kind === 'meteor' ? 0.02 : 0.045;
          if (p.kind === 'meteor') {
            this.fx.sparks(p.x - 20, p.y - 60, 0xffb040, 2);
            this.fx.puffs(p.x - 10, p.y - 40, 1, 0x5a4a44);
            this.fx.embers(p.x, p.y - 20, 1);
          } else {
            this.fx.ember.setParticleTint(tc);
            this.fx.ember.emitParticleAt(p.x, p.y - lift, 1);
          }
        }
      }
    }
  }

  destroy(): void {
    for (const s of this.slots) { s.sprite.destroy(); s.shadow?.destroy(); }
    this.slots.length = 0;
  }
}

interface ZSlot {
  glow: Phaser.GameObjects.Image;
  flames: Phaser.GameObjects.Image[];
  phase: number;
}

/** Burning ground patches from world.fireZones: a soft glow and flickering flame tongues. */
export class FireZoneLayer {
  private readonly slots: ZSlot[] = [];
  private readonly mirror = new IdMirror(MAX_ZONES);

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < MAX_ZONES; i++) {
      const glow = scene.add.image(0, 0, 'fx_glow').setDepth(D.zone).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff6a2b).setVisible(false);
      const flames: Phaser.GameObjects.Image[] = [];
      for (let k = 0; k < 4; k++) {
        flames.push(scene.add.image(0, 0, TEX.flame).setDepth(D.zone + 0.1).setBlendMode(Phaser.BlendModes.ADD).setTint(k % 2 ? 0xffb03b : 0xff5a2b).setVisible(false));
      }
      this.slots.push({ glow, flames, phase: i * 1.3 });
    }
  }

  update(world: WorldApi, time: number): void {
    const list = world.fireZones;
    for (let i = 0; i < Math.min(list.length, MAX_ZONES); i++) {
      const z = list[i];
      const s = this.slots[i];
      const c = this.mirror.sync(i, z.active, z.id);
      if (c === 'idle') continue;
      if (c === 'despawn') {
        s.glow.setVisible(false);
        for (const f of s.flames) f.setVisible(false);
        continue;
      }
      const fade = Math.min(1, Math.max(0, z.timeLeft / 0.6));
      s.glow.setVisible(true).setPosition(z.x, z.y).setScale((z.radius * 2.3) / s.glow.frame.width, (z.radius * 1.7) / s.glow.frame.height)
        .setAlpha((0.45 + 0.15 * Math.sin(time * 8 + s.phase)) * fade);
      for (let k = 0; k < s.flames.length; k++) {
        const f = s.flames[k];
        const a = (k / s.flames.length) * Math.PI * 2 + s.phase;
        const rr = z.radius * (k === 0 ? 0 : 0.5);
        const flick = 0.75 + 0.25 * Math.sin(time * 13 + k * 2 + s.phase);
        const h = z.radius * 0.95 * flick;
        f.setVisible(true).setPosition(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * 0.6 + 6)
          .setOrigin(0.5, 0.85).setScale(h / f.frame.width, h * 1.15 / f.frame.height).setAlpha(0.9 * fade);
      }
    }
  }

  destroy(): void {
    for (const s of this.slots) { s.glow.destroy(); for (const f of s.flames) f.destroy(); }
    this.slots.length = 0;
  }
}
