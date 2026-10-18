import type { HeroId, RunSummary } from '../core/types';
import type { Platform } from '../platform/Platform';
import {
  SAVE_VERSION,
  type DailyResult,
  type LifetimeStats,
  type RewardLedger,
  type SaveData,
  type Settings,
} from './schema';

const HERO_IDS: readonly HeroId[] = ['knight', 'ranger', 'mage'];
const DEBOUNCE_MS = 500;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_DAILY_DAYS = 30;
export const MAX_CLAIMS = 200;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MODES = ['normal', 'daily'] as const;

type Obj = Record<string, unknown>;

// ---------- defaults ----------

function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function defaultStats(): LifetimeStats {
  return {
    runs: 0, totalKills: 0, totalGold: 0, bestRoom: 0, bestRoomByHero: {}, legendariesTotal: 0,
    bossesDefeated: {}, bestNoDamageRooms: 0, bestKillsInRun: 0, bestLevel: 0, maxSynergiesInRun: 0,
    dailyCompleted: 0,
  };
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    gold: 0,
    meta: {},
    heroes: ['knight'],
    selectedHero: 'knight',
    unlocks: [],
    achievements: {},
    stats: defaultStats(),
    settings: {
      musicVolume: 0.6,
      sfxVolume: 0.8,
      screenShake: true,
      reducedMotion: prefersReducedMotion(),
      damageNumbers: true,
      joystick: 'floating',
    },
    daily: {},
    rewards: { day: '', claimsToday: 0, claimed: {}, tokens: 0 },
    cosmetics: { owned: [], equipped: {} },
    lastRun: null,
    pendingRun: null,
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

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0))];
}

function isHero(v: unknown): v is HeroId {
  return typeof v === 'string' && (HERO_IDS as readonly string[]).includes(v);
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

/** Keeps the newest MAX_CLAIMS claims (by timestamp). */
export function pruneClaimed(claimed: Record<string, number>): Record<string, number> {
  const entries = Object.entries(claimed);
  if (entries.length <= MAX_CLAIMS) return claimed;
  // Newest first; on equal timestamps the later-inserted claim wins.
  const order = new Map(entries.map(([k], i) => [k, i]));
  entries.sort((a, b) => b[1] - a[1] || (order.get(b[0]) ?? 0) - (order.get(a[0]) ?? 0));
  return Object.fromEntries(entries.slice(0, MAX_CLAIMS));
}

function sanitizeStats(v: unknown, def: LifetimeStats): LifetimeStats {
  const s = isObj(v) ? v : {};
  const bestRoomByHero: LifetimeStats['bestRoomByHero'] = {};
  if (isObj(s.bestRoomByHero)) {
    for (const h of HERO_IDS) {
      const r = s.bestRoomByHero[h];
      if (typeof r === 'number' && Number.isFinite(r) && r > 0) bestRoomByHero[h] = Math.floor(r);
    }
  }
  return {
    runs: int(s.runs, def.runs),
    totalKills: int(s.totalKills, def.totalKills),
    totalGold: int(s.totalGold, def.totalGold),
    bestRoom: int(s.bestRoom, def.bestRoom),
    bestRoomByHero,
    legendariesTotal: int(s.legendariesTotal, def.legendariesTotal),
    bossesDefeated: record(s.bossesDefeated, (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.floor(x) : undefined)),
    bestNoDamageRooms: int(s.bestNoDamageRooms, def.bestNoDamageRooms),
    bestKillsInRun: int(s.bestKillsInRun, def.bestKillsInRun),
    bestLevel: int(s.bestLevel, def.bestLevel),
    maxSynergiesInRun: int(s.maxSynergiesInRun, def.maxSynergiesInRun),
    dailyCompleted: int(s.dailyCompleted, def.dailyCompleted),
  };
}

function sanitizeSettings(v: unknown, def: Settings): Settings {
  const s = isObj(v) ? v : {};
  return {
    musicVolume: num(s.musicVolume, def.musicVolume, 0, 1),
    sfxVolume: num(s.sfxVolume, def.sfxVolume, 0, 1),
    screenShake: bool(s.screenShake, def.screenShake),
    reducedMotion: bool(s.reducedMotion, def.reducedMotion),
    damageNumbers: bool(s.damageNumbers, def.damageNumbers),
    joystick: s.joystick === 'fixed' || s.joystick === 'floating' ? s.joystick : def.joystick,
  };
}

function sanitizeDaily(v: unknown): Record<string, DailyResult> {
  const all = record<DailyResult>(v, (x, key) => {
    if (!DAY_RE.test(key) || !isObj(x)) return undefined;
    return { bestRoom: int(x.bestRoom, 0), kills: int(x.kills, 0), attempts: int(x.attempts, 0) };
  });
  const keys = Object.keys(all).sort().slice(-MAX_DAILY_DAYS);
  const out: Record<string, DailyResult> = {};
  for (const k of keys) out[k] = all[k];
  return out;
}

function sanitizeRewards(v: unknown): RewardLedger {
  const r = isObj(v) ? v : {};
  const claimed = record(r.claimed, (x) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : undefined));
  return {
    day: typeof r.day === 'string' && DAY_RE.test(r.day) ? r.day : '',
    claimsToday: int(r.claimsToday, 0),
    claimed: pruneClaimed(claimed),
    tokens: int(r.tokens, 0),
  };
}

/** Validates a stored run summary (lastRun / pendingRun); null when it is not one. */
function sanitizeLastRun(v: unknown): RunSummary | null {
  if (!isObj(v) || typeof v.runId !== 'string' || !v.runId) return null;
  return {
    runId: v.runId,
    mode: (MODES as readonly unknown[]).includes(v.mode) ? (v.mode as RunSummary['mode']) : 'normal',
    hero: isHero(v.hero) ? v.hero : 'knight',
    roomsCleared: int(v.roomsCleared, 0),
    kills: int(v.kills, 0),
    gold: int(v.gold, 0),
    level: int(v.level, 1, 1),
    bossesDefeated: strList(v.bossesDefeated),
    synergies: strList(v.synergies),
    durationSec: num(v.durationSec, 0),
    noDamageRooms: int(v.noDamageRooms, 0),
    legendaries: int(v.legendaries, 0),
  };
}

function sanitize(raw: Obj): SaveData {
  const def = defaultSave();
  const heroes = (Array.isArray(raw.heroes) ? raw.heroes : []).filter(isHero);
  const unlocked = [...new Set<HeroId>(['knight', ...heroes])];
  const equipped: Partial<Record<HeroId, string>> = {};
  const cos = isObj(raw.cosmetics) ? raw.cosmetics : {};
  if (isObj(cos.equipped)) {
    for (const h of HERO_IDS) {
      const e = cos.equipped[h];
      if (typeof e === 'string' && e) equipped[h] = e;
    }
  }
  return {
    version: SAVE_VERSION,
    gold: int(raw.gold, 0),
    meta: record(raw.meta, (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.floor(x) : undefined)),
    heroes: unlocked,
    selectedHero: isHero(raw.selectedHero) && unlocked.includes(raw.selectedHero) ? raw.selectedHero : 'knight',
    unlocks: strList(raw.unlocks),
    achievements: record(raw.achievements, (x) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : undefined)),
    stats: sanitizeStats(raw.stats, def.stats),
    settings: sanitizeSettings(raw.settings, def.settings),
    daily: sanitizeDaily(raw.daily),
    rewards: sanitizeRewards(raw.rewards),
    cosmetics: { owned: strList(cos.owned), equipped },
    lastRun: sanitizeLastRun(raw.lastRun),
    pendingRun: sanitizeLastRun(raw.pendingRun),
  };
}

/** Turns anything (parsed JSON, a JSON string, garbage) into a valid, current SaveData. Never throws. */
export function migrate(raw: unknown): SaveData {
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
    return sanitize(obj);
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

  constructor(private readonly platform: Platform) {}

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
      this._data = migrate(parsed);
    }
    this.loaded = true;
    this.emit();
    return this._data;
  }

  /** Debounced (~500 ms); calls made while a write is pending share it. Resolves after the write. */
  save(): Promise<void> {
    this.emit();
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
