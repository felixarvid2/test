/**
 * Temporary overrides of data numbers for what-if runs: `balance.waves.hpGrowth=1.25`,
 * `enemies.troll.hp=300`, `towers.arrow.levels.1.damageMult=1.2`, `meta.metaDamage.valuePerLevel=0.05`.
 * Arrays are indexed by position or by `id`. apply() returns a function that restores the old values.
 */
import { BALANCE } from '../../src/data/balance';
import { BOSSES } from '../../src/data/bosses';
import { ENEMIES } from '../../src/data/enemies';
import { EVENTS } from '../../src/data/events';
import { META_UPGRADES } from '../../src/data/meta';
import { SYNERGIES } from '../../src/data/synergies';
import { TOWERS } from '../../src/data/towers';
import { UPGRADES } from '../../src/data/upgrades';

const ROOTS: Record<string, unknown> = {
  balance: BALANCE, enemies: ENEMIES, bosses: BOSSES, towers: TOWERS, meta: META_UPGRADES,
  upgrades: UPGRADES, synergies: SYNERGIES, events: EVENTS,
};

function child(node: unknown, key: string, path: string): unknown {
  if (Array.isArray(node)) {
    const byIndex = /^\d+$/.test(key) ? node[Number(key)] : undefined;
    const found = byIndex ?? node.find((x) => x && typeof x === 'object' && (x as { id?: string }).id === key);
    if (found === undefined) throw new Error(`override path "${path}": no element "${key}"`);
    return found;
  }
  const v = (node as Record<string, unknown>)[key];
  if (v === undefined) throw new Error(`override path "${path}": no field "${key}"`);
  return v;
}

export function applyOverrides(set: Record<string, number> | undefined): () => void {
  const undo: (() => void)[] = [];
  for (const [path, value] of Object.entries(set ?? {})) {
    const parts = path.split('.');
    let node: unknown = ROOTS[parts[0]];
    if (node === undefined) throw new Error(`override path "${path}": unknown root "${parts[0]}"`);
    for (let i = 1; i < parts.length - 1; i++) node = child(node, parts[i], path);
    const last = parts[parts.length - 1];
    const holder = node as Record<string, unknown>;
    if (typeof holder[last] !== 'number') throw new Error(`override path "${path}" is not a number`);
    const old = holder[last];
    holder[last] = value;
    undo.push(() => { holder[last] = old; });
  }
  return () => { for (let i = undo.length - 1; i >= 0; i--) undo[i](); };
}

/** "a.b=1,c.d=2" -> record. */
export function parseSet(text: string | undefined): Record<string, number> | undefined {
  if (!text) return undefined;
  const out: Record<string, number> = {};
  for (const part of text.split(',')) {
    const [k, v] = part.split('=');
    if (!k || v === undefined || Number.isNaN(Number(v))) throw new Error(`bad --set entry "${part}" (use path=number)`);
    out[k.trim()] = Number(v);
  }
  return out;
}
