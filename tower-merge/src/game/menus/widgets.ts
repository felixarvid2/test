import Phaser from 'phaser';
import { services } from '../../services';
import { SceneKeys } from '../scenes/keys';
import {
  DEPTH, H, MIN_TOUCH, PALETTE, W, clamp, createButton, createIconButton, createPill, crispText, fadeToScene, fitText,
  playSfx, reducedMotion, uiIcon, type UIButton, type UIPill,
} from '../ui';
import { iconKey } from '../assetKeys';
import { NO_SCROLL } from './scroll';

export const HEADER_H = 156;

/** Full-screen menu backdrop: bg_menu with a dark veil so cards stay readable. */
export function menuBackground(scene: Phaser.Scene, veil = 0.6): void {
  if (scene.textures.exists('bg_menu')) scene.add.image(W / 2, H / 2, 'bg_menu').setDisplaySize(W, H).setDepth(DEPTH.background);
  else scene.cameras.main.setBackgroundColor(PALETTE.bg);
  scene.add.rectangle(W / 2, H / 2, W, H, PALETTE.bg, veil).setDepth(DEPTH.background + 1);
}

export interface Header {
  title: Phaser.GameObjects.Text;
  gemPill?: UIPill;
  back: () => void;
}

/**
 * Top bar with a back button (returns to the menu, also on Esc), a title and optionally the gem
 * counter. The bar swallows taps so list items scrolled underneath it cannot be pressed.
 */
export function createHeader(scene: Phaser.Scene, title: string, opts: { gems?: boolean; onBack?: () => void } = {}): Header {
  const bar = scene.add.graphics().setDepth(DEPTH.hud - 6);
  bar.fillStyle(PALETTE.shadow, 0.28).fillRect(0, HEADER_H, W, 14);
  bar.fillStyle(PALETTE.panelDark, 0.96).fillRect(0, 0, W, HEADER_H);
  bar.fillStyle(0xffffff, 0.05).fillRect(0, 0, W, HEADER_H / 2.4);
  bar.fillStyle(PALETTE.outline, 1).fillRect(0, HEADER_H - 6, W, 6);
  bar.fillStyle(PALETTE.gold, 1).fillRect(0, HEADER_H - 10, W, 4);
  scene.add.rectangle(W / 2, HEADER_H / 2, W, HEADER_H, 0x000000, 0).setDepth(DEPTH.hud - 5).setInteractive();

  const back = opts.onBack ?? ((): void => fadeToScene(scene, SceneKeys.Menu));
  const backBtn = createIconButton(scene, 70, 80, { size: 92, onClick: back, depth: DEPTH.hud });
  const chev = scene.add.graphics();
  chev.lineStyle(14, PALETTE.outline, 1).beginPath().moveTo(8, -20).lineTo(-10, 0).lineTo(8, 20).strokePath();
  chev.lineStyle(8, 0xffffff, 1).beginPath().moveTo(8, -20).lineTo(-10, 0).lineTo(8, 20).strokePath();
  backBtn.container.add(chev);
  scene.input.keyboard?.on('keydown-ESC', back);

  let gemPill: UIPill | undefined;
  let right = W - 30;
  if (opts.gems) {
    gemPill = createPill(scene, W - 24, 80, { icon: iconKey('gem'), value: services.save.data.gems, align: 'right', height: 68, color: PALETTE.info, minWidth: 150 });
    right = W - 24 - gemPill.width - 14;
  }
  const left = 136;
  const t = crispText(scene, (left + right) / 2, 80, title, { preset: 'heading', size: 46 }).setDepth(DEPTH.hud);
  fitText(t, right - left);
  if (!reducedMotion()) {
    t.setAlpha(0).setY(60);
    scene.tweens.add({ targets: t, alpha: 1, y: 80, duration: 280, ease: 'Back.Out' });
  }
  return { title: t, gemPill, back };
}

/** Tweens a pill's number from `from` to `to` (a counter ticking down or up). */
export function tickPill(scene: Phaser.Scene, pill: UIPill, from: number, to: number, duration = 520): void {
  if (reducedMotion() || from === to) { pill.setValue(to); return; }
  const s = { v: from };
  scene.tweens.add({
    targets: s, v: to, duration, ease: 'Sine.Out',
    onUpdate: () => pill.setValue(Math.round(s.v)),
    onComplete: () => { pill.setValue(to); pill.pulse(); },
  });
}

/** Small icons that fly along a curve from one point to another, then call `onArrive` per icon. */
export function flyIcons(
  scene: Phaser.Scene, from: { x: number; y: number }, to: { x: number; y: number }, key: string, count: number,
  opts: { size?: number; onArrive?: (i: number) => void; delay?: number } = {},
): void {
  const size = opts.size ?? 44;
  for (let i = 0; i < count; i++) {
    const img = uiIcon(scene, from.x, from.y, key, size).setDepth(DEPTH.toast - 10);
    if (reducedMotion()) { img.destroy(); opts.onArrive?.(i); continue; }
    img.setAlpha(0).setScale(0.4);
    const delay = (opts.delay ?? 0) + i * 55;
    const midX = (from.x + to.x) / 2 + Phaser.Math.Between(-120, 120);
    const midY = (from.y + to.y) / 2 + Phaser.Math.Between(-60, 60);
    const t = { v: 0 };
    scene.tweens.add({
      targets: t, v: 1, delay, duration: 520, ease: 'Sine.InOut',
      onStart: () => img.setAlpha(1),
      onUpdate: () => {
        const u = t.v;
        const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
        img.setPosition(a * from.x + b * midX + c * to.x, a * from.y + b * midY + c * to.y);
        img.setScale(0.4 + 0.8 * Math.sin(Math.min(1, u * 1.2) * Math.PI * 0.6));
      },
      onComplete: () => { img.destroy(); opts.onArrive?.(i); },
    });
  }
}

/** Star/spark burst at a point (unlocks, purchases, merges). */
export function burst(scene: Phaser.Scene, x: number, y: number, color: number, count = 14, depth: number = DEPTH.fx + 30): void {
  if (reducedMotion() || !scene.textures.exists('fx_spark')) return;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const d = 70 + Math.random() * 90;
    const s = scene.add.image(x, y, 'fx_spark').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth)
      .setScale(0.5 + Math.random() * 0.6).setAlpha(1);
    scene.tweens.add({
      targets: s, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d - 20, alpha: 0, scale: 0.1,
      duration: 480 + Math.random() * 260, ease: 'Cubic.Out', onComplete: () => s.destroy(),
    });
  }
  if (scene.textures.exists('fx_ring')) {
    const ring = scene.add.image(x, y, 'fx_ring').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth).setScale(0.3);
    scene.tweens.add({ targets: ring, scale: 2.6, alpha: 0, duration: 520, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
  }
}

/** Slides cards in from below one after another (only the first few; the rest just appear). */
export function staggerIn(scene: Phaser.Scene, objs: Phaser.GameObjects.Container[], opts: { delay?: number; step?: number; max?: number; dy?: number } = {}): void {
  if (reducedMotion()) return;
  const step = opts.step ?? 45;
  const dy = opts.dy ?? 46;
  objs.slice(0, opts.max ?? 9).forEach((c, i) => {
    const y = c.y;
    c.setAlpha(0).setY(y + dy);
    scene.tweens.add({ targets: c, alpha: 1, y, delay: (opts.delay ?? 80) + i * step, duration: 320, ease: 'Back.Out' });
  });
}

/** Pop-in with overshoot. */
export function popIn(scene: Phaser.Scene, obj: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, delay = 0, to = 1): void {
  if (reducedMotion()) { (obj as unknown as Phaser.GameObjects.Image).setScale(to); return; }
  (obj as unknown as Phaser.GameObjects.Image).setScale(0);
  scene.tweens.add({ targets: obj, scale: to, delay, duration: 420, ease: 'Back.Out' });
}

/** Square icon/sprite image from a texture key, or a grey disc if the texture is missing. */
export function spriteFit(scene: Phaser.Scene, x: number, y: number, key: string, size: number): Phaser.GameObjects.Image | Phaser.GameObjects.Arc {
  return uiIcon(scene, x, y, key, size);
}

/** Flat dark silhouette (locked towers, undiscovered bosses). */
export function silhouette(obj: Phaser.GameObjects.Image | Phaser.GameObjects.Arc, color = 0x141a38): void {
  if (obj instanceof Phaser.GameObjects.Image) obj.setTintFill(color);
  else obj.setFillStyle(color);
}

// ---------- pips ----------

export interface Pips {
  readonly container: Phaser.GameObjects.Container;
  setLevel(level: number, animate?: boolean): void;
}

/** Row of level pips, left edge at (x, y). Filled pips are gold. */
export function createPips(scene: Phaser.Scene, x: number, y: number, level: number, max: number, width: number): Pips {
  const gap = 6;
  const pw = Math.min(30, (width - gap * (max - 1)) / max);
  const container = scene.add.container(x, y);
  const pips: Phaser.GameObjects.Graphics[] = [];
  const draw = (g: Phaser.GameObjects.Graphics, on: boolean): void => {
    g.clear();
    g.fillStyle(PALETTE.outline, 1).fillRoundedRect(-pw / 2 - 3, -13, pw + 6, 26, 9);
    if (on) {
      g.fillStyle(PALETTE.goldDark, 1).fillRoundedRect(-pw / 2, -10, pw, 20, 7);
      g.fillStyle(PALETTE.gold, 1).fillRoundedRect(-pw / 2, -10, pw, 14, 7);
      g.fillStyle(0xffffff, 0.45).fillRoundedRect(-pw / 2 + 3, -8, pw - 6, 4, 2);
    } else {
      g.fillStyle(PALETTE.panelDark, 1).fillRoundedRect(-pw / 2, -10, pw, 20, 7);
    }
  };
  for (let i = 0; i < max; i++) {
    const g = scene.add.graphics().setPosition(pw / 2 + i * (pw + gap), 0);
    draw(g, i < level);
    pips.push(g);
    container.add(g);
  }
  return {
    container,
    setLevel(l, animate = false) {
      pips.forEach((g, i) => {
        const on = i < l;
        draw(g, on);
        if (animate && i === l - 1 && !reducedMotion()) {
          g.setScale(1.9);
          scene.tweens.add({ targets: g, scale: 1, duration: 420, ease: 'Back.Out' });
        }
      });
    },
  };
}

// ---------- tabs ----------

export interface Tabs {
  select(index: number, silent?: boolean): void;
  readonly buttons: UIButton[];
}

/** Two or three pill tabs side by side centred on x; the selected one is gold. */
export function createTabs(scene: Phaser.Scene, y: number, labels: string[], onSelect: (i: number) => void, initial = 0): Tabs {
  const gap = 14;
  const w = Math.min(300, (W - 48 - gap * (labels.length - 1)) / labels.length);
  const buttons: UIButton[] = [];
  let current = initial;
  const apply = (): void => buttons.forEach((b, i) => b.setStyle(i === current ? 'primary' : 'ghost'));
  labels.forEach((label, i) => {
    const x = W / 2 + (i - (labels.length - 1) / 2) * (w + gap);
    buttons.push(createButton(scene, x, y, {
      label, width: w, height: 80, fontSize: 30, style: i === current ? 'primary' : 'ghost', sound: true,
      onClick: () => { if (i !== current) { current = i; apply(); onSelect(i); } },
    }));
  });
  return { buttons, select(i, silent) { current = i; apply(); if (!silent) onSelect(i); } };
}

// ---------- switch & slider ----------

export interface Switch {
  readonly container: Phaser.GameObjects.Container;
  set(on: boolean, animate?: boolean): void;
}

/** Toggle switch graphic (no input of its own: the row around it handles taps). Centre at (x, y). */
export function createSwitch(scene: Phaser.Scene, x: number, y: number, on: boolean): Switch {
  const w = 128, h = 66;
  const container = scene.add.container(x, y);
  const track = scene.add.graphics();
  const knob = scene.add.graphics();
  container.add([track, knob]);
  const state = { k: on ? 1 : 0 };
  const draw = (): void => {
    const k = state.k;
    const col = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(PALETTE.disabledDark), Phaser.Display.Color.ValueToColor(PALETTE.successDark), 1, k);
    const colNum = Phaser.Display.Color.GetColor(col.r, col.g, col.b);
    track.clear();
    track.fillStyle(PALETTE.outline, 1).fillRoundedRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, h / 2 + 4);
    track.fillStyle(colNum, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    track.fillStyle(0x000000, 0.2).fillRoundedRect(-w / 2 + 6, -h / 2 + 6, w - 12, 14, 7);
    const kx = -w / 2 + h / 2 + k * (w - h);
    knob.clear();
    knob.fillStyle(PALETTE.shadow, 0.3).fillCircle(kx, 4, h / 2 - 4);
    knob.fillStyle(PALETTE.outline, 1).fillCircle(kx, 0, h / 2 - 2);
    knob.fillStyle(k > 0.5 ? PALETTE.success : 0xc9cfe6, 1).fillCircle(kx, 0, h / 2 - 7);
    knob.fillStyle(0xffffff, 0.45).fillEllipse(kx - 4, -10, 26, 10);
  };
  draw();
  return {
    container,
    set(v, animate = true) {
      scene.tweens.killTweensOf(state);
      const target = v ? 1 : 0;
      if (!animate || reducedMotion()) { state.k = target; draw(); return; }
      scene.tweens.add({ targets: state, k: target, duration: 160, ease: 'Sine.Out', onUpdate: draw });
    },
  };
}

export interface Slider {
  readonly container: Phaser.GameObjects.Container;
  setValue(v: number): void;
}

/**
 * Horizontal slider with its track centred on (x, y), width `w`. Drag anywhere on the track.
 * `onChange` fires continuously while dragging, `onRelease` once at the end.
 */
export function createSlider(
  scene: Phaser.Scene, x: number, y: number, w: number, value: number,
  onChange: (v: number) => void, onRelease?: (v: number) => void,
): Slider {
  const container = scene.add.container(x, y);
  const gfx = scene.add.graphics();
  const zone = scene.add.zone(0, 0, w + 90, MIN_TOUCH + 12).setInteractive({ useHandCursor: true });
  zone.setData(NO_SCROLL, true);
  container.add([gfx, zone]);
  let v = clamp(value, 0, 1);
  let dragging = false;
  const draw = (): void => {
    const kx = -w / 2 + v * w;
    gfx.clear();
    gfx.fillStyle(PALETTE.outline, 1).fillRoundedRect(-w / 2 - 5, -18, w + 10, 36, 18);
    gfx.fillStyle(PALETTE.panelDark, 1).fillRoundedRect(-w / 2, -13, w, 26, 13);
    if (v > 0.001) {
      const fw = Math.max(26, v * w);
      gfx.fillStyle(PALETTE.goldDark, 1).fillRoundedRect(-w / 2, -13, fw, 26, 13);
      gfx.fillStyle(PALETTE.gold, 1).fillRoundedRect(-w / 2, -13, fw, 17, 13);
      gfx.fillStyle(0xffffff, 0.4).fillRoundedRect(-w / 2 + 10, -10, Math.max(0, fw - 20), 5, 3);
    }
    gfx.fillStyle(PALETTE.shadow, 0.3).fillCircle(kx, 5, 30);
    gfx.fillStyle(PALETTE.outline, 1).fillCircle(kx, 0, 31);
    gfx.fillStyle(0xfff3c4, 1).fillCircle(kx, 0, 25);
    gfx.fillStyle(PALETTE.gold, 1).fillCircle(kx, 3, 20);
    gfx.fillStyle(0xffffff, 0.5).fillEllipse(kx - 5, -9, 20, 8);
  };
  draw();
  const fromPointer = (p: Phaser.Input.Pointer): void => {
    const m = container.getWorldTransformMatrix();
    const next = clamp((p.x - m.tx + w / 2) / w, 0, 1);
    if (Math.abs(next - v) < 0.001) return;
    v = Math.round(next * 100) / 100;
    draw();
    onChange(v);
  };
  zone.on('pointerdown', (p: Phaser.Input.Pointer) => { dragging = true; fromPointer(p); });
  const move = (p: Phaser.Input.Pointer): void => { if (dragging && p.isDown) fromPointer(p); };
  const up = (): void => { if (dragging) { dragging = false; onRelease?.(v); } };
  scene.input.on('pointermove', move);
  scene.input.on('pointerup', up);
  scene.input.on('pointerupoutside', up);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.input?.off('pointermove', move);
    scene.input?.off('pointerup', up);
    scene.input?.off('pointerupoutside', up);
  });
  return { container, setValue(nv) { v = clamp(nv, 0, 1); draw(); } };
}

/** Plays the kit's click sound without a button (rows, cards). */
export const clickSound = (): void => playSfx('click');

/** Section title with a gold rule, centred on (W/2, y); returns the height it uses. */
export function sectionHeader(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, y: number, label: string, width = 664): number {
  const c = scene.add.container(W / 2, y + 30);
  const g = scene.add.graphics();
  g.fillStyle(PALETTE.outline, 1).fillRect(-width / 2 - 2, 28, width + 4, 8);
  g.fillStyle(PALETTE.gold, 1).fillRect(-width / 2, 30, width, 4);
  c.add([g, crispText(scene, -width / 2 + 4, 0, label, { preset: 'heading', size: 32, colorNum: PALETTE.goldLight }).setOrigin(0, 0.5)]);
  parent.add(c);
  return 80;
}

/** Cuts a wrapped Text to `maxLines` lines, ending with an ellipsis when something was dropped. */
export function clampLines(t: Phaser.GameObjects.Text, maxLines: number): Phaser.GameObjects.Text {
  const full = t.text;
  const lines = t.getWrappedText(full);
  if (lines.length <= maxLines) return t;
  const words = lines.slice(0, maxLines).join(' ').split(' ');
  while (words.length > 1) {
    t.setText(`${words.join(' ').replace(/[.,;:!\s]+$/, '')}…`);
    if (t.getWrappedText().length <= maxLines) break;
    words.pop();
  }
  return t;
}
