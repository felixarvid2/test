import { defaultRunOptions } from '../../src/sim/bot';
import type { RunOptions, SimEvent, WorldApi } from '../../src/sim/api';
import type { Effect, TowerId, UpgradeDef } from '../../src/data/types';
import type { Enemy, SimState } from '../../src/sim/state';
import { spawnEnemy } from '../../src/sim/enemies';
import type { SpawnOpts } from '../../src/sim/enemies';
import { World, createWorld } from '../../src/sim/World';
import type { WorldContent } from '../../src/sim/World';
import type { BossId, EnemyId } from '../../src/data/types';

export { defaultRunOptions };

/** Direct access to the simulation internals for white-box tests. */
export const internals = (w: WorldApi): SimState => (w as unknown as { s: SimState }).s;

export const NO_CONTENT: WorldContent = { upgrades: [], synergies: [], events: [] };

/** Advances the world by `seconds` of game time and returns every event emitted meanwhile. */
export function advance(w: WorldApi, seconds: number, into: SimEvent[] = []): SimEvent[] {
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < steps; i++) {
    w.update(0.05);
    for (const e of w.drainEvents()) into.push(e);
    if (w.phase !== 'wave' && w.phase !== 'prewave') break;
  }
  return into;
}

/** A world with a clean board: no starting tower, 12 open slots, optional run-wide effects. */
export interface ArenaOptions {
  effects?: Effect[];
  opts?: Partial<RunOptions>;
  content?: WorldContent;
  towers?: { type: TowerId; level: number }[];
  /** Keeps the wave alive with a frozen, practically immortal enemy far from the towers. */
  idle?: boolean;
}

/**
 * Starts wave 1 with an empty plan so tests can place enemies by hand. Towers are granted into the
 * first free slots in unlock order (5, 8, 4, 6, ...).
 */
export function arena(a: ArenaOptions = {}): { w: World; s: SimState } {
  const over: Partial<RunOptions> = {
    startingSlots: 12,
    towerPool: ['arrow', 'cannon', 'frost', 'lightning', 'fire', 'poison', 'sniper', 'magic'],
    ...a.opts,
  };
  if (a.effects) over.daily = { effects: a.effects };
  const w = createWorld(defaultRunOptions(7, over), a.content ?? NO_CONTENT);
  w.sellTower(5);
  for (const t of a.towers ?? []) w.grantTower(t.type, t.level);
  const s = internals(w);
  w.startWaveNow();
  s.plan!.entries.length = 0;
  if (a.idle) {
    const e = spawnEnemy(s, 'goblin', { progress: 5, hpMult: 1e9 });
    if (e) e.frozenTime = 1e9;
    s.grid.rebuild();
  }
  w.drainEvents();
  return { w, s };
}

/** Places an enemy on the ground path. Progress 480 is at (360, 300), close to slot 5. */
export function spawn(s: SimState, kind: EnemyId | BossId, progress: number, o: SpawnOpts = {}): Enemy {
  const e = spawnEnemy(s, kind, { progress, ...o });
  if (!e) throw new Error('enemy cap');
  s.grid.rebuild();
  return e;
}

export const flag = (f: Extract<Effect, { kind: 'flag' }>['flag'], value: number, tower?: TowerId[]): Effect =>
  tower ? { kind: 'flag', flag: f, value, tower } : { kind: 'flag', flag: f, value };

export const stat = (
  s: Extract<Effect, { kind: 'stat' }>['stat'], op: 'flat' | 'pct' | 'mul', value: number, tower?: TowerId[],
): Effect => (tower ? { kind: 'stat', stat: s, op, value, tower } : { kind: 'stat', stat: s, op, value });

export const upgradeDef = (id: string, over: Partial<UpgradeDef> = {}): UpgradeDef => ({
  id, name: id, description: id, rarity: 'common', icon: 'damage', effects: [], maxStacks: 1, ...over,
});

export const countEvents = (evs: SimEvent[], type: SimEvent['type']): number => evs.filter((e) => e.type === type).length;

/** Plays the current wave to its end (phase leaves 'wave'/'prewave'). Returns the events. */
export function playToEnd(w: WorldApi, maxSeconds = 300): SimEvent[] {
  const evs: SimEvent[] = [];
  advance(w, maxSeconds, evs);
  return evs;
}

/** Options that make the default board shred every wave (damage x300, attack speed x3). */
export const GODLIKE: Effect[] = [
  { kind: 'stat', stat: 'damage', op: 'mul', value: 300 },
  { kind: 'stat', stat: 'fireRate', op: 'mul', value: 3 },
];

export interface PlayHooks {
  onUpgrade?: (w: WorldApi) => string | undefined;
  onEvent?: (w: WorldApi) => string | undefined;
  onEvents?: (evs: SimEvent[], w: WorldApi) => void;
}

/**
 * Plays until the world is about to start wave `untilWave` (or the run ends). Upgrade screens pick
 * the first choice and events pick the last option unless hooks say otherwise.
 */
export function playWaves(w: WorldApi, untilWave: number, hooks: PlayHooks = {}): SimEvent[] {
  const all: SimEvent[] = [];
  let guard = 0;
  while (guard++ < 200000 && w.phase !== 'over') {
    const evs = w.drainEvents();
    if (evs.length > 0) {
      for (const e of evs) all.push(e);
      hooks.onEvents?.(evs, w);
    }
    if (w.phase === 'defeated') break;
    if (w.phase === 'upgrade') {
      const pick = hooks.onUpgrade?.(w) ?? w.upgradeChoices[0].id;
      w.chooseUpgrade(pick);
      continue;
    }
    if (w.phase === 'event') {
      const ev = w.pendingEvent!;
      w.resolveEvent(hooks.onEvent?.(w) ?? ev.options[ev.options.length - 1].id);
      continue;
    }
    if (w.wave >= untilWave && w.phase === 'prewave') break;
    w.update(0.1);
  }
  for (const e of w.drainEvents()) all.push(e);
  return all;
}

export function godWorld(seed = 11, over: Partial<RunOptions> = {}, content: WorldContent = NO_CONTENT): World {
  return createWorld(defaultRunOptions(seed, { daily: { effects: GODLIKE }, ...over }), content);
}
