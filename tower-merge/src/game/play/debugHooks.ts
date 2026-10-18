import type Phaser from 'phaser';
import type { WorldApi } from '../../sim/api';

export interface TmHooks {
  game: Phaser.Game;
  scene: Phaser.Scene;
  world: () => WorldApi;
  speed: (n: number) => void;
}

declare global {
  interface Window {
    __tm?: TmHooks;
  }
}

/** window.__tm: always installed (harmless), used by QA smoke tests and manual debugging. */
export function installDebugHooks(game: Phaser.Game, scene: Phaser.Scene, world: () => WorldApi, setSpeed: (n: number) => void): void {
  if (typeof window === 'undefined') return;
  window.__tm = { game, scene, world, speed: setSpeed };
}

/** Kept installed across scene restarts (a restart re-installs it in create()); nothing to remove. */
export function clearDebugHooks(_scene: Phaser.Scene): void {
  /* intentionally empty: window.__tm must never flicker out while a scene restarts */
}

/** URL flags: ?stress=1 (heavy scenario + fps log), ?q=0|1|2 (pin quality). */
export function readFlags(): { stress: boolean; quality: number | null } {
  if (typeof location === 'undefined') return { stress: false, quality: null };
  const p = new URLSearchParams(location.search);
  const q = p.get('q');
  return { stress: p.get('stress') === '1', quality: q !== null && q !== '' && !Number.isNaN(Number(q)) ? Number(q) : null };
}

/**
 * Stress scenario (debug only): twelve level 5 towers, an immortal castle and ~130 slow, tough enemies
 * topped up every half second, so the renderer's worst case can be measured.
 */
export async function startStress(world: WorldApi, log: (msg: string) => void): Promise<() => void> {
  const { spawnEnemy } = await import('../../sim/enemies');
  const s = (world as unknown as { s: Record<string, unknown> }).s as {
    slots: { unlocked: boolean }[]; coins: number; castleHp: number; castleMaxHp: number; wave: number;
    plan: { entries: unknown[] } | null; alive: number; grid: { rebuild(): void };
  };
  for (const sl of s.slots) sl.unlocked = true;
  s.coins = 1e6;
  s.castleMaxHp = s.castleHp = 1e9;
  const types = ['arrow', 'cannon', 'frost', 'lightning', 'fire', 'poison', 'sniper', 'magic'] as const;
  for (let i = 0; i < 12; i++) world.grantTower(types[i % types.length], 5);
  world.startWaveNow();
  const kinds = ['goblin', 'bat', 'orc', 'rat', 'skeleton', 'shaman', 'troll'] as const;
  let n = 0;
  const topUp = (): void => {
    if (s.plan) s.plan.entries.length = 0;
    let guard = 0;
    while (s.alive < 130 && guard++ < 200) {
      const e = (spawnEnemy as unknown as (st: unknown, k: string, o: Record<string, unknown>) => { baseSpeed: number } | null)(
        s, kinds[n++ % kinds.length], { progress: 40 + ((n * 37) % 2200), hpMult: 4e5 },
      );
      if (!e) break;
      e.baseSpeed *= 0.05;
    }
    s.grid.rebuild();
  };
  topUp();
  const id = setInterval(topUp, 500);
  log('stress scenario started');
  return () => clearInterval(id);
}
