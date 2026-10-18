/** Phaser helpers shared by the in-run overlay scenes (dim, close, particles, chips, textures). */
import Phaser from 'phaser';
import { OverlayEvents } from '../scenes/contracts';
import { SceneKeys } from '../scenes/keys';
import { DEPTH, H, PALETTE, W, crispText, playSfx, reducedMotion, uiIcon } from '../ui';

/** Emits an overlay event on the GameScene's event emitter (no-op when there is no Game scene). */
export function emitOnGame(scene: Phaser.Scene, event: string): void {
  const game = scene.scene.manager.getScene(SceneKeys.Game) as Phaser.Scene | null;
  game?.events.emit(event);
}

/** Overlay is done and the run continues: tell GameScene, then stop this scene. */
export function closeOverlay(scene: Phaser.Scene): void {
  emitOnGame(scene, OverlayEvents.Closed);
  scene.scene.stop();
}

/** Full-screen dim that swallows taps (so GameScene below never sees them) and fades in. */
export function addDim(scene: Phaser.Scene, alpha = 0.82): Phaser.GameObjects.Rectangle {
  const dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x050816, reducedMotion() ? alpha : 0)
    .setDepth(DEPTH.background).setInteractive();
  if (!reducedMotion()) scene.tweens.add({ targets: dim, fillAlpha: alpha, duration: 220 });
  return dim;
}

/** Tween a number (count-ups); reduced motion jumps straight to the end value. */
export function tweenNumber(
  scene: Phaser.Scene, from: number, to: number, duration: number, delay: number, onUpdate: (v: number) => void, onDone?: () => void,
): void {
  if (reducedMotion() || duration <= 0) {
    scene.time.delayedCall(0, () => { onUpdate(to); onDone?.(); });
    return;
  }
  onUpdate(from);
  scene.tweens.addCounter({
    from, to, duration, delay, ease: 'Cubic.Out',
    onUpdate: (tw) => onUpdate(Math.round(tw.getValue() ?? to)),
    onComplete: () => { onUpdate(to); onDone?.(); },
  });
}

// ---------------------------------------------------------------------------------------------
// Generated icons (not part of the sprite set)
// ---------------------------------------------------------------------------------------------

/** 'icon_ad' (play button) and 'icon_reroll' (circular arrow): made once, unless art provides them. */
export function ensureOverlayTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists('icon_ad')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(PALETTE.outline, 1).fillCircle(64, 64, 58);
    g.fillStyle(0xffffff, 1).fillCircle(64, 64, 50);
    g.fillStyle(0xdfe6ff, 1).fillCircle(64, 70, 44);
    g.fillStyle(0xffffff, 1).fillCircle(64, 64, 44);
    g.fillStyle(PALETTE.infoDark, 1).fillTriangle(50, 38, 50, 90, 94, 64);
    g.fillStyle(PALETTE.info, 1).fillTriangle(52, 44, 52, 70, 80, 60);
    g.generateTexture('icon_ad', 128, 128);
    g.destroy();
  }
  if (!scene.textures.exists('icon_reroll')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const cx = 64, cy = 64, r = 34;
    const a0 = 0.35 * Math.PI, a1 = 1.85 * Math.PI;
    const ex = cx + r * Math.cos(a1), ey = cy + r * Math.sin(a1);
    const tx = -Math.sin(a1), ty = Math.cos(a1);
    const nx = Math.cos(a1), ny = Math.sin(a1);
    const head = (grow: number) => {
      g.fillTriangle(
        ex + tx * (22 + grow), ey + ty * (22 + grow),
        ex + nx * (20 + grow), ey + ny * (20 + grow),
        ex - nx * (20 + grow), ey - ny * (20 + grow),
      );
    };
    g.lineStyle(24, PALETTE.outline, 1).beginPath().arc(cx, cy, r, a0, a1, false).strokePath();
    g.fillStyle(PALETTE.outline, 1);
    head(6);
    g.lineStyle(13, 0xffffff, 1).beginPath().arc(cx, cy, r, a0, a1, false).strokePath();
    g.fillStyle(0xffffff, 1);
    head(0);
    g.generateTexture('icon_reroll', 128, 128);
    g.destroy();
  }
}

// ---------------------------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------------------------

/** Radial burst of tinted sparks/stars that fly out and fade. */
export function burst(scene: Phaser.Scene, x: number, y: number, color: number, count = 14, spread = 150): void {
  if (reducedMotion()) return;
  const key = scene.textures.exists('fx_star') ? 'fx_star' : scene.textures.exists('fx_spark') ? 'fx_spark' : '';
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const dist = spread * (0.5 + Math.random() * 0.6);
    const size = 22 + Math.random() * 26;
    const p = key
      ? scene.add.image(x, y, key).setDisplaySize(size, size).setTint(color).setBlendMode(Phaser.BlendModes.ADD)
      : scene.add.circle(x, y, size / 3, color);
    p.setDepth(DEPTH.fx + 30).setAlpha(0.95);
    scene.tweens.add({
      targets: p, x: x + Math.cos(a) * dist, y: y + Math.sin(a) * dist + 20, alpha: 0, angle: Math.random() * 180 - 90,
      duration: 520 + Math.random() * 280, ease: 'Cubic.Out', onComplete: () => p.destroy(),
    });
  }
}

/** Coins (and a few gems) raining down the whole screen. */
export function coinShower(scene: Phaser.Scene, count = 34): void {
  if (reducedMotion()) return;
  playSfx('coin');
  for (let i = 0; i < count; i++) {
    const useGem = i % 6 === 0 && scene.textures.exists('icon_gem');
    const key = useGem ? 'icon_gem' : scene.textures.exists('fx_coin') ? 'fx_coin' : '';
    const size = useGem ? 52 : 44 + Math.random() * 14;
    const x = 30 + Math.random() * (W - 60);
    const p = key ? scene.add.image(x, -60, key).setDisplaySize(size, size) : scene.add.circle(x, -60, size / 2, PALETTE.gold);
    p.setDepth(DEPTH.toast - 10);
    scene.tweens.add({
      targets: p, y: H + 80, x: x + (Math.random() * 120 - 60), angle: Math.random() * 540 - 270,
      delay: Math.random() * 700, duration: 1100 + Math.random() * 700, ease: 'Quad.In', onComplete: () => p.destroy(),
    });
    if (i % 5 === 0) scene.time.delayedCall(Math.random() * 700, () => playSfx('coin'));
  }
}

/** Soft pulsing glow image behind something (tinted, additive). */
export function addGlow(scene: Phaser.Scene, x: number, y: number, size: number, color: number, alpha = 0.55): Phaser.GameObjects.Image | null {
  if (!scene.textures.exists('fx_glow')) return null;
  const glow = scene.add.image(x, y, 'fx_glow').setTint(color).setAlpha(alpha).setDisplaySize(size, size).setBlendMode(Phaser.BlendModes.ADD);
  if (!reducedMotion()) {
    scene.tweens.add({ targets: glow, alpha: alpha * 0.55, scale: glow.scale * 1.08, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }
  return glow;
}

/** Pop-in: scale from 0.6 and fade in (instant with reduced motion). */
export function popIn(scene: Phaser.Scene, target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Alpha, delay = 0, duration = 260): void {
  if (reducedMotion()) return;
  const sx = target.scaleX, sy = target.scaleY;
  target.setAlpha(0).setScale(sx * 0.6, sy * 0.6);
  scene.tweens.add({ targets: target, alpha: 1, scaleX: sx, scaleY: sy, delay, duration, ease: 'Back.Out' });
}

// ---------------------------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------------------------

export interface ChipItem {
  icon?: string;
  text: string;
  color?: number;
}

export interface ChipLayout {
  container: Phaser.GameObjects.Container;
  /** Height used below `top`. */
  height: number;
}

/**
 * Small rounded chips (icon + name) wrapped into centred rows of at most `maxW`. Items that do
 * not fit in `maxRows` rows collapse into a "+N" chip.
 */
export function layoutChips(
  scene: Phaser.Scene, items: ChipItem[], cx: number, top: number, maxW: number, maxRows = 2, chipH = 52,
): ChipLayout {
  const container = scene.add.container(0, 0).setDepth(DEPTH.panel + 5);
  const gap = 10;
  const iconSize = 34;
  interface Made { item: ChipItem; t: Phaser.GameObjects.Text; w: number; hasIcon: boolean }
  const make = (item: ChipItem): Made => {
    const t = crispText(scene, 0, 0, item.text, { preset: 'small', size: 22, colorNum: 0xffffff });
    const hasIcon = !!item.icon && scene.textures.exists(item.icon);
    const extra = 28 + (hasIcon ? iconSize + 6 : 0);
    const w = Math.min(maxW, t.width + extra);
    if (t.width > w - extra) t.setScale((w - extra) / t.width);
    return { item, t, w, hasIcon };
  };
  /** Greedy row fill; returns the rows and how many chips did not fit. */
  const flow = (list: Made[]): { rows: Made[][]; overflow: number } => {
    const rows: Made[][] = [[]];
    let cur = 0;
    let overflow = 0;
    for (const m of list) {
      const row = rows[rows.length - 1];
      if (row.length && cur + gap + m.w > maxW) {
        if (rows.length >= maxRows) { overflow += 1; continue; }
        rows.push([]);
        cur = 0;
      }
      const target = rows[rows.length - 1];
      cur += (target.length ? gap : 0) + m.w;
      target.push(m);
    }
    return { rows, overflow };
  };

  const all = items.map(make);
  let res = flow(all);
  if (res.overflow > 0) {
    // keep fewer chips until the "+N" chip fits too
    let keep = all.length - res.overflow;
    let more: Made | null = null;
    for (; keep >= 0; keep--) {
      more?.t.destroy();
      more = make({ text: `+${all.length - keep}`, color: PALETTE.textDim });
      res = flow([...all.slice(0, keep), more]);
      if (res.overflow === 0) break;
    }
    for (const m of all.slice(Math.max(0, keep))) m.t.destroy();
  }

  res.rows.forEach((row, ri) => {
    const total = row.reduce((s, m) => s + m.w, 0) + gap * Math.max(0, row.length - 1);
    let x = cx - total / 2;
    const y = top + chipH / 2 + ri * (chipH + 8);
    for (const m of row) {
      const g = scene.add.graphics();
      const border = m.item.color ?? PALETTE.gold;
      g.fillStyle(PALETTE.outline, 1).fillRoundedRect(x - 3, y - chipH / 2 - 3, m.w + 6, chipH + 6, chipH / 2 + 3);
      g.fillStyle(border, 1).fillRoundedRect(x, y - chipH / 2, m.w, chipH, chipH / 2);
      g.fillStyle(PALETTE.panelDark, 1).fillRoundedRect(x + 3, y - chipH / 2 + 3, m.w - 6, chipH - 6, chipH / 2 - 3);
      container.add(g);
      let tx = x + m.w / 2;
      if (m.hasIcon) {
        container.add(uiIcon(scene, x + 14 + iconSize / 2, y, m.item.icon as string, iconSize));
        tx = x + 14 + iconSize + 6 + (m.w - 28 - iconSize - 6) / 2;
      }
      m.t.setPosition(tx, y);
      container.add(m.t);
      x += m.w + gap;
    }
  });
  const height = res.rows.length * chipH + Math.max(0, res.rows.length - 1) * 8;
  return { container, height };
}
