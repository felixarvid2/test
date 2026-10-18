import { ACHIEVEMENTS } from '../data/achievements';
import { META_UPGRADES } from '../data/meta';
import { TOWERS } from '../data/towers';
import { TOWER_IDS, type LifetimeStats, type TowerId } from '../data/types';
import { emptyLifetimeStats } from '../core/achievements';
import type { Platform } from '../platform/Platform';
import { REWARD_CONFIG } from '../rewards/config';
import {
  LOADOUT_SIZE, SAVE_VERSION, START_TOWERS,
  type BestRun, type DailyRecord, type RewardLedger, type SaveData, type Settings,
} from './schema';

const DEBOUNCE_MS = 500;
/** Smallest loadout a player may keep (or all unlocked towers when fewer). */
export const LOADOUT_MIN = 3;
/** YouTube: saved game MUST be < 3 MiB, SHOULD be < 500 KiB. */
const MAX_BYTES = 500 * 1024;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_GEMS = 1_000_000_000;
const MAX_META_LEVEL = 99;

type Obj = Record<string, unknown>;

/**
 * Ids that exist in the shipped content. An empty list means "unknown" (content not loaded), in
 * which case ids are kept rather than dropped.
 */
export interface Catalog {
  /** Meta upgrade id -> max level. */
  metaMax: Record<string, number>;
  achievementIds: readonly string[];
}

export function defaultCatalog(): Catalog {
  return {
    metaMax: Object.fromEntries(META_UPGRADES.map((m) => [m.id, m.maxLevel])),
    achievementIds: ACHIEVEMENTS.map((a) => a.id),
  };
}

// ---------- defaults ----------

function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    gems: 0,
    metaLevels: {},
    unlockedTowers: [...START_TOWERS],
    loadout: repairLoadout([], START_TOWERS),
    discoveredTowers: [],
    achievements: [],
    settings: {
      musicVolume: 0.6,
      sfxVolume: 0.8,
      muted: false,
      screenShake: true,
      reducedMotion: prefersReducedMotion(),
      damageNumbers: true,
      showRanges: true,
    },
    stats: emptyLifetimeStats(),
    bestRun: null,
    daily: null,
    rewards: { claimed: {}, counts: {} },
    tutorial: { firstRunDone: false, mergeHintShown: false },
  };
}

// ---------- migration ----------

/** Each entry upgrades a raw save of that version to the next one. Field repair happens afterwards. */
const MIGRATIONS: Record<number, (raw: Obj) => Obj> = {
  // Saves without a version predate the schema; their fields are repaired by sanitize().
  0: (raw) => ({ ...raw, version: 1 }),
};

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, def: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return def;
  return Math.min(max, Math.max(min, v));
}

function int(v: unknown, def: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return Math.floor(num(v, def, min, max));
}

function bool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def;
}

function isTower(v: unknown): v is TowerId {
  return typeof v === 'string' && (TOWER_IDS as readonly string[]).includes(v);
}

/** Valid, de-duplicated tower ids in first-seen order. */
function towerList(v: unknown): TowerId[] {
  return [...new Set((Array.isArray(v) ? v : []).filter(isTower))];
}

/** Copies the entries of a record whose values pass `map` (returns undefined to drop). */
function record<T>(v: unknown, map: (x: unknown, key: string) => T | undefined): Record<string, T> {
  const out: Record<string, T> = {};
  if (!isObj(v)) return out;
  for (const [k, x] of Object.entries(v)) {
    if (k === '__proto__') continue;
    const m = map(x, k);
    if (m !== undefined) out[k] = m;
  }
  return out;
}

/** Keeps the newest `max` claims (by timestamp). Returns the input when nothing needs dropping. */
export function pruneClaimed(claimed: Record<string, number>, max = REWARD_CONFIG.maxClaims): Record<string, number> {
  const entries = Object.entries(claimed);
  if (entries.length <= max) return claimed;
  // Newest first; on equal timestamps the later-inserted claim wins.
  const order = new Map(entries.map(([k], i) => [k, i]));
  entries.sort((a, b) => b[1] - a[1] || (order.get(b[0]) ?? 0) - (order.get(a[0]) ?? 0));
  return Object.fromEntries(entries.slice(0, max));
}

/** True when the tower can hit flyers (unknown towers count as not). */
export function towerHitsAir(id: TowerId): boolean {
  return TOWERS[id]?.hitsAir === true;
}

/**
 * Makes any loadout valid for the given unlocked towers: only unlocked, unique, valid ids, at most
 * LOADOUT_SIZE; topped up from the unlocked towers in TOWER_IDS order to `size` (default
 * min(LOADOUT_SIZE, unlocked)); and containing a tower that hits air (the last entry is swapped for
 * the first such unlocked tower).
 */
export function repairLoadout(raw: unknown, unlocked: readonly TowerId[], size = LOADOUT_SIZE): TowerId[] {
  const out = towerList(raw).filter((id) => unlocked.includes(id)).slice(0, LOADOUT_SIZE);
  const target = Math.min(size, LOADOUT_SIZE, unlocked.length);
  for (const id of TOWER_IDS) {
    if (out.length >= target) break;
    if (unlocked.includes(id) && !out.includes(id)) out.push(id);
  }
  if (out.length > 0 && !out.some(towerHitsAir)) {
    const air = TOWER_IDS.find((id) => unlocked.includes(id) && towerHitsAir(id));
    if (air) out[out.length - 1] = air;
  }
  return out;
}

function sanitizeStats(v: unknown): LifetimeStats {
  const s = isObj(v) ? v : {};
  const out = emptyLifetimeStats();
  for (const key of Object.keys(out) as (keyof LifetimeStats)[]) {
    if (key === 'towerKills' || key === 'synergyCounts') continue;
    out[key] = int(s[key], 0);
  }
  const kills: LifetimeStats['towerKills'] = {};
  if (isObj(s.towerKills)) {
    for (const id of TOWER_IDS) {
      const n = s.towerKills[id];
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) kills[id] = Math.floor(n);
    }
  }
  out.towerKills = kills;
  out.synergyCounts = record(s.synergyCounts, (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.floor(x) : undefined));
  return out;
}

function sanitizeSettings(v: unknown, def: Settings): Settings {
  const s = isObj(v) ? v : {};
  return {
    musicVolume: num(s.musicVolume, def.musicVolume, 0, 1),
    sfxVolume: num(s.sfxVolume, def.sfxVolume, 0, 1),
    muted: bool(s.muted, def.muted),
    screenShake: bool(s.screenShake, def.screenShake),
    reducedMotion: bool(s.reducedMotion, def.reducedMotion),
    damageNumbers: bool(s.damageNumbers, def.damageNumbers),
    showRanges: bool(s.showRanges, def.showRanges),
  };
}

function sanitizeBestRun(v: unknown): BestRun | null {
  if (!isObj(v) || typeof v.wave !== 'number' || !Number.isFinite(v.wave) || v.wave < 1) return null;
  return {
    wave: int(v.wave, 1, 1),
    kills: int(v.kills, 0),
    merges: int(v.merges, 0),
    gems: int(v.gems, 0),
    date: typeof v.date === 'string' && DAY_RE.test(v.date) ? v.date : '',
  };
}

function sanitizeDaily(v: unknown): DailyRecord | null {
  if (!isObj(v) || typeof v.key !== 'string' || !DAY_RE.test(v.key)) return null;
  return { key: v.key, bestWave: int(v.bestWave, 0), attempts: int(v.attempts, 0) };
}

function sanitizeRewards(v: unknown): RewardLedger {
  const r = isObj(v) ? v : {};
  return {
    claimed: pruneClaimed(record(r.claimed, (x) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : undefined))),
    counts: record(r.counts, (x) => {
      if (!isObj(x) || typeof x.day !== 'string' || !DAY_RE.test(x.day)) return undefined;
      return { day: x.day, n: int(x.n, 0) };
    }),
  };
}

function sanitize(raw: Obj, catalog: Catalog): SaveData {
  const def = defaultSave();
  const metaKnown = Object.keys(catalog.metaMax).length > 0;
  const achKnown = catalog.achievementIds.length > 0;
  const ach = new Set(catalog.achievementIds);
  const tut = isObj(raw.tutorial) ? raw.tutorial : {};
  const unlockedTowers = [...new Set<TowerId>([...START_TOWERS, ...towerList(raw.unlockedTowers)])];
  return {
    version: SAVE_VERSION,
    gems: int(raw.gems, 0, 0, MAX_GEMS),
    metaLevels: record(raw.metaLevels, (x, id) => {
      if (typeof x !== 'number' || !Number.isFinite(x)) return undefined;
      if (metaKnown && !(id in catalog.metaMax)) return undefined;
      const level = Math.min(Math.floor(x), metaKnown ? catalog.metaMax[id] : MAX_META_LEVEL);
      return level > 0 ? level : undefined;
    }),
    unlockedTowers,
    // A missing field (old save) is filled to the full size; a stored one keeps the player's choice
    // down to the minimum of 3 that core/meta allows.
    loadout: repairLoadout(raw.loadout, unlockedTowers, Array.isArray(raw.loadout) ? LOADOUT_MIN : LOADOUT_SIZE),
    discoveredTowers: towerList(raw.discoveredTowers),
    achievements: [...new Set((Array.isArray(raw.achievements) ? raw.achievements : [])
      .filter((x): x is string => typeof x === 'string' && x.length > 0 && (!achKnown || ach.has(x))))],
    settings: sanitizeSettings(raw.settings, def.settings),
    stats: sanitizeStats(raw.stats),
    bestRun: sanitizeBestRun(raw.bestRun),
    daily: sanitizeDaily(raw.daily),
    rewards: sanitizeRewards(raw.rewards),
    tutorial: {
      firstRunDone: bool(tut.firstRunDone, false),
      mergeHintShown: bool(tut.mergeHintShown, false),
    },
  };
}

/** Turns anything (parsed JSON, a JSON string, garbage) into a valid, current SaveData. Never throws. */
export function migrate(raw: unknown, catalog: Catalog = defaultCatalog()): SaveData {
  try {
    let value = raw;
    if (typeof value === 'string') value = JSON.parse(value);
    if (!isObj(value)) return defaultSave();
    let obj: Obj = value;
    let version = int(obj.version, 0);
    while (version < SAVE_VERSION) {
      const step = MIGRATIONS[version];
      if (!step) break;
      obj = step(obj);
      version += 1;
    }
    return sanitize(obj, catalog);
  } catch {
    return defaultSave();
  }
}

// ---------- manager ----------

export class SaveManager {
  private _data: SaveData = defaultSave();
  private loaded = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: { promise: Promise<void>; resolve: () => void } | undefined;
  private chain: Promise<void> = Promise.resolve();
  private listeners = new Set<(data: SaveData) => void>();

  constructor(private readonly platform: Platform, private readonly catalog: Catalog = defaultCatalog()) {}

  get data(): SaveData {
    return this._data;
  }

  async load(): Promise<SaveData> {
    let raw: string | null = null;
    try {
      raw = await this.platform.loadData();
    } catch (e) {
      this.platform.logWarning(`Save load failed, starting fresh: ${String(e)}`);
    }
    if (raw === null || raw === '') {
      this._data = defaultSave();
    } else {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        this.platform.logWarning('Save data is corrupted, starting from defaults');
        parsed = null;
      }
      this._data = migrate(parsed, this.catalog);
    }
    this.loaded = true;
    this.emit();
    return this._data;
  }

  /** Debounced (~500 ms); calls made while a write is pending share it. Resolves after the write. */
  save(): Promise<void> {
    this.emit();
    return this.schedule();
  }

  /** Applies `mutator` to the live data, notifies listeners and schedules a (debounced) save. */
  update(mutator: (d: SaveData) => void): Promise<void> {
    try {
      mutator(this._data);
    } finally {
      this.emit();
    }
    return this.schedule();
  }

  /** Writes now (used on pause and after reward claims). Waits for any write already in flight. */
  flush(): Promise<void> {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    return this.pending ? this.runPending() : this.enqueueWrite();
  }

  async reset(): Promise<void> {
    this._data = defaultSave();
    this.emit();
    await this.flush();
  }

  onChange(cb: (data: SaveData) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private schedule(): Promise<void> {
    if (!this.pending) {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => { resolve = r; });
      this.pending = { promise, resolve };
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.runPending();
      }, DEBOUNCE_MS);
    }
    return this.pending.promise;
  }

  private async runPending(): Promise<void> {
    const p = this.pending;
    this.pending = undefined;
    await this.enqueueWrite();
    p?.resolve();
  }

  /** Writes run one after another so two saveData calls never overlap. */
  private enqueueWrite(): Promise<void> {
    const run = this.chain.then(() => this.writeNow());
    this.chain = run;
    return run;
  }

  private async writeNow(): Promise<void> {
    if (!this.loaded) {
      this.platform.logWarning('Save requested before load finished; skipped to avoid overwriting progress');
      return;
    }
    try {
      const json = JSON.stringify(this._data);
      const bytes = new TextEncoder().encode(json).length;
      if (bytes > MAX_BYTES) {
        this.platform.logError(`Save is ${bytes} bytes, over the ${MAX_BYTES} byte limit; not written`);
        return;
      }
      await this.platform.saveData(json);
    } catch (e) {
      this.platform.logWarning(`Save failed: ${String(e)}`);
    }
  }

  private emit(): void {
    for (const cb of [...this.listeners]) {
      try {
        cb(this._data);
      } catch (e) {
        this.platform.logWarning(`Save listener threw: ${String(e)}`);
      }
    }
  }
}
