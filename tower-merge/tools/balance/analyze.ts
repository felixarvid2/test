/** Aggregation of RunRecords into the report sections (all return plain text). */
import { SYNERGIES } from '../../src/data/synergies';
import { UPGRADES } from '../../src/data/upgrades';
import { EVENTS } from '../../src/data/events';
import { TOWER_IDS } from '../../src/data/types';
import type { RunRecord } from './run';
import { fmt, groupBy, mean, median, pct, percentile, signed, stdErr, table } from './stats';

const MIN = 60;
const group = (r: RunRecord): string => `${r.cfg.policy}|${r.cfg.meta}`;

/** Policy x meta matrix of median wave and average minutes. */
export function matrixSection(recs: RunRecord[]): string {
  const policies = [...new Set(recs.map((r) => r.cfg.policy))];
  const metas = [...new Set(recs.map((r) => r.cfg.meta))];
  const rows = policies.map((p) => [
    p,
    ...metas.map((m) => {
      const g = recs.filter((r) => r.cfg.policy === p && r.cfg.meta === m);
      if (g.length === 0) return '-';
      const w = g.map((r) => r.wave);
      return `${fmt(median(w), 1)} [${percentile(w, 0.1).toFixed(0)}-${percentile(w, 0.9).toFixed(0)}] ${fmt(mean(g.map((r) => r.seconds)) / MIN)}m`;
    }),
  ]);
  return `Median wave [p10-p90] and mean minutes per policy and meta level (n per cell: ${recs.length / (policies.length * metas.length) | 0})\n${
    table(['policy', ...metas], rows)}`;
}

/** Death wave histogram per meta level (greedy-like policies pooled with the given filter). */
export function deathSection(recs: RunRecord[], policy = 'greedy'): string {
  const out: string[] = [];
  for (const [meta, g] of groupBy(recs.filter((r) => r.cfg.policy === policy), (r) => r.cfg.meta)) {
    const max = Math.max(...g.map((r) => r.wave));
    const rows: (string | number)[][] = [];
    let cum = 0;
    for (let w = 1; w <= max; w++) {
      const n = g.filter((r) => r.wave === w).length;
      cum += n;
      const entered = g.filter((r) => r.wave >= w).length;
      if (n === 0 && w > 3 && w % 5 !== 0) continue;
      rows.push([w, n, '#'.repeat(Math.round((n / g.length) * 40)), pct(cum / g.length), entered > 0 ? pct(n / entered) : '-']);
    }
    out.push(`Death wave, ${policy} / ${meta} (n=${g.length})\n${table(['wave', 'deaths', '', 'cumulative', 'hazard'], rows)}`);
  }
  return out.join('\n\n');
}

/** Boss waves: how many runs entered them, what share died there and how much the boss wave hurt. */
export function bossSection(recs: RunRecord[], policy = 'greedy'): string {
  const names: Record<number, string> = { 5: 'Goblin King', 10: 'Stone Golem', 15: 'Dragon', 20: 'Goblin King x2', 25: 'Stone Golem x2', 30: 'Dragon x2' };
  const rows: (string | number)[][] = [];
  for (const [meta, g] of groupBy(recs.filter((r) => r.cfg.policy === policy), (r) => r.cfg.meta)) {
    for (const bw of [5, 10, 15, 20, 25, 30]) {
      const entered = g.filter((r) => r.wave >= bw);
      if (entered.length < 3) continue;
      const died = entered.filter((r) => r.wave === bw);
      const hpLeft = mean(entered.map((r) => r.samples.find((s) => s.wave === bw)).filter((s) => s).map((s) => s!.hp / s!.maxHp));
      const lost = mean(entered.map((r) => (r.waveDamage[bw] ?? 0) / (r.samples.find((s) => s.wave === bw)?.maxHp ?? 100)));
      const breath = entered.reduce((a, r) => a + (r.bossWaveSources[bw]?.['dragon:fireBreath'] ?? 0), 0);
      const all = entered.reduce((a, r) => a + (r.waveDamage[bw] ?? 0), 0);
      const dis = mean(entered.map((r) => r.bossDisabled[bw] ?? 0));
      rows.push([meta, `${bw} ${names[bw]}`, entered.length, died.length, pct(died.length / entered.length), pct(hpLeft), pct(lost), bw % 15 === 0 ? pct(breath / Math.max(1, all)) : '-', fmt(dis, 1)]);
    }
  }
  return `Boss walls, ${policy}: runs that entered the boss wave, deaths in it, castle damage taken in it\n${
    table(['meta', 'boss wave', 'entered', 'died', 'death rate', 'castle hp on entry', 'hp lost in wave', 'fire breath share', 'tower-s disabled'], rows)}`;
}

/** What took the castle down: damage by source in the death wave, and over the whole run. */
export function killerSection(recs: RunRecord[], policy = 'greedy'): string {
  const out: string[] = [];
  for (const [meta, g] of groupBy(recs.filter((r) => r.cfg.policy === policy && !r.survived), (r) => r.cfg.meta)) {
    const death: Record<string, number> = {};
    const total: Record<string, number> = {};
    let dmg = 0;
    for (const r of g) {
      for (const [k, v] of Object.entries(r.deathWaveDamage)) { death[k] = (death[k] ?? 0) + v; dmg += v; }
      for (const [k, v] of Object.entries(r.castleDamage)) total[k] = (total[k] ?? 0) + v;
    }
    const totSum = Object.values(total).reduce((a, b) => a + b, 0);
    const keys = Object.keys(total).sort((a, b) => (death[b] ?? 0) - (death[a] ?? 0)).slice(0, 8);
    const rows = keys.map((k) => [k, pct((death[k] ?? 0) / dmg), pct(total[k] / totSum)]);
    out.push(`Castle damage by source, ${policy} / ${meta} (n=${g.length} deaths)\n${table(['source', 'share in death wave', 'share of all damage'], rows)}`);
  }
  return out.join('\n\n');
}

/** Run length buckets. */
export function lengthSection(recs: RunRecord[]): string {
  const rows: (string | number)[][] = [];
  for (const [k, g] of groupBy(recs, group)) {
    const m = g.map((r) => r.seconds / MIN);
    rows.push([k, fmt(mean(m)), fmt(percentile(m, 0.1)), fmt(percentile(m, 0.9)), pct(m.filter((x) => x < 2.5).length / m.length), pct(m.filter((x) => x > 7).length / m.length), fmt(mean(g.map((r) => r.gems)), 0)]);
  }
  return `Run length in simulated minutes (and gems per run)\n${table(['policy|meta', 'mean', 'p10', 'p90', '< 2.5 min', '> 7 min', 'gems'], rows)}`;
}

/** Tower value: damage share, kill share, and damage per slot-second relative to the other towers at the same level. */
export function towerSection(recs: RunRecord[]): string {
  const pools = recs.filter((r) => r.cfg.pool.length >= 8);
  const subject = pools.length >= 8 ? pools : recs;
  const dmg: Record<string, number> = {};
  const kills: Record<string, number> = {};
  const slotSec: Record<string, number> = {};
  const byTL = new Map<string, { d: number; s: number }>();
  let totalD = 0;
  let totalK = 0;
  let totalS = 0;
  for (const r of subject) {
    for (const [t, v] of Object.entries(r.towerDamage)) { dmg[t] = (dmg[t] ?? 0) + v; totalD += v; }
    for (const [t, v] of Object.entries(r.towerKills)) { kills[t] = (kills[t] ?? 0) + v; totalK += v; }
    for (const [tl, s] of Object.entries(r.slotSecondsByTL)) {
      const t = tl.split(':')[0];
      slotSec[t] = (slotSec[t] ?? 0) + s;
      totalS += s;
      const e = byTL.get(tl) ?? { d: 0, s: 0 };
      e.d += r.damageByTL[tl] ?? 0;
      e.s += s;
      byTL.set(tl, e);
    }
  }
  // relative damage per slot-second against the mean over all types at the same level
  const levelMean = new Map<number, { d: number; s: number }>();
  for (const [tl, e] of byTL) {
    const l = Number(tl.split(':')[1]);
    const m = levelMean.get(l) ?? { d: 0, s: 0 };
    m.d += e.d;
    m.s += e.s;
    levelMean.set(l, m);
  }
  const rows: (string | number)[][] = [];
  for (const t of TOWER_IDS) {
    let w = 0;
    let rel = 0;
    for (const [tl, e] of byTL) {
      const [tt, ls] = tl.split(':');
      if (tt !== t || e.s < 5) continue;
      const m = levelMean.get(Number(ls))!;
      rel += (e.d / e.s) / (m.d / m.s) * e.s;
      w += e.s;
    }
    rows.push([t, pct((slotSec[t] ?? 0) / totalS), pct((dmg[t] ?? 0) / totalD), pct((kills[t] ?? 0) / totalK), w > 0 ? pct(rel / w) : '-']);
  }
  return `Tower value over ${subject.length} runs (pools with all 8 towers when available)\n${
    table(['tower', 'board share', 'damage share', 'kill share', 'dmg/slot vs avg at same level'], rows)}`;
}

/**
 * Lift of a pick: final wave of runs that took an item at wave w minus the mean final wave of
 * comparable runs (same policy and meta, still alive after w, item not taken by then). Averaged
 * over all occurrences, which removes the survivorship bias of late picks.
 */
function stratifiedLift(
  recs: RunRecord[], occurrences: (r: RunRecord) => { key: string; wave: number }[],
): Map<string, { n: number; lift: number; se: number }> {
  const out = new Map<string, number[]>();
  for (const [, g] of groupBy(recs, group)) {
    const taken = g.map((r) => {
      const m = new Map<string, number>();
      for (const o of occurrences(r)) if (!m.has(o.key)) m.set(o.key, o.wave);
      return m;
    });
    g.forEach((r, i) => {
      for (const [key, w] of taken[i]) {
        const ctrl = g.filter((c, j) => j !== i && c.wave > w && !((taken[j].get(key) ?? 1e9) <= w));
        if (ctrl.length < 3) continue;
        const arr = out.get(key) ?? [];
        arr.push(r.wave - mean(ctrl.map((c) => c.wave)));
        out.set(key, arr);
      }
    });
  }
  const res = new Map<string, { n: number; lift: number; se: number }>();
  for (const [k, a] of out) res.set(k, { n: a.length, lift: mean(a), se: stdErr(a) });
  return res;
}

export function upgradeSection(recs: RunRecord[]): string {
  const lift = stratifiedLift(recs, (r) => r.picks.map((p) => ({ key: p.id, wave: p.wave })));
  const rarity = new Map(UPGRADES.map((u) => [u.id, u.rarity]));
  const rows = [...lift.entries()].filter(([, v]) => v.n >= 8).sort((a, b) => b[1].lift - a[1].lift)
    .map(([id, v]) => [id, rarity.get(id) ?? 'fallback', v.n, signed(v.lift), `+-${fmt(v.se * 1.96, 2)}`]);
  const head = rows.slice(0, 8);
  const tail = rows.slice(-6);
  return `Observed pick lift in waves vs comparable runs (n picks >= 8; sorted; ${rows.length} upgrades; noisy, see the upgrade probe)\n${
    table(['upgrade', 'rarity', 'picks', 'lift', '95% ci'], [...head, ['...', '', '', '', ''], ...tail])}`;
}

export function synergySection(recs: RunRecord[]): string {
  const lift = stratifiedLift(recs, (r) => r.synergies.map((s) => ({ key: s.id, wave: s.wave })));
  const total = recs.length;
  const rows = SYNERGIES.map((s) => {
    const hit = recs.filter((r) => r.synergies.some((x) => x.id === s.id));
    const l = lift.get(s.id);
    return [s.id, pct(hit.length / total), fmt(mean(hit.map((r) => r.synergies.find((x) => x.id === s.id)!.wave)), 1), l ? signed(l.lift) : '-', l ? `+-${fmt(l.se * 1.96, 2)}` : '-'];
  });
  return `Synergies: share of runs activating them, mean activation wave, observed lift\n${table(['synergy', 'activated', 'at wave', 'lift', '95% ci'], rows)}`;
}

export function eventSection(recs: RunRecord[]): string {
  const lift = stratifiedLift(recs, (r) => r.events.map((e) => ({ key: e.id, wave: e.wave })));
  const rows = EVENTS.map((e) => {
    const all = recs.flatMap((r) => r.events.filter((x) => x.id === e.id));
    const l = lift.get(e.id);
    return [e.id, all.length, pct(all.filter((x) => x.tookFirst).length / Math.max(1, all.length)), l ? signed(l.lift) : '-'];
  });
  const perRun = mean(recs.map((r) => r.events.length));
  return `Events offered (${fmt(perRun, 1)} per run); the bot takes the first option when affordable\n${table(['event', 'offered', 'first option taken', 'lift'], rows)}`;
}

/** Economy: coins in hand when a wave starts, towers owned, merges. */
export function economySection(recs: RunRecord[], policy = 'greedy'): string {
  const out: string[] = [];
  for (const [meta, g] of groupBy(recs.filter((r) => r.cfg.policy === policy), (r) => r.cfg.meta)) {
    const rows: (string | number)[][] = [];
    for (let w = 1; w <= 30; w += w < 6 ? 1 : 3) {
      const s = g.map((r) => r.samples.find((x) => x.wave === w)).filter((x): x is NonNullable<typeof x> => !!x);
      if (s.length < 3) continue;
      rows.push([w, s.length, fmt(mean(s.map((x) => x.coins)), 0), fmt(mean(s.map((x) => x.towers)), 1), fmt(mean(s.map((x) => x.unlocked)), 1), fmt(mean(s.map((x) => x.merged)), 1), pct(mean(s.map((x) => x.hp / x.maxHp)))]);
    }
    out.push(`Economy at wave start, ${policy} / ${meta}\n${table(['wave', 'runs', 'coins in hand', 'towers', 'slots', 'merges', 'castle hp'], rows)}`);
  }
  return out.join('\n\n');
}

/** Most common final boards (type:level), for dominant-strategy hunting. */
export function boardSection(recs: RunRecord[]): string {
  const share: Record<string, number> = {};
  let n = 0;
  for (const r of recs) {
    for (const c of r.finalBoard) {
      const [t] = c.split(':');
      share[t] = (share[t] ?? 0) + 1;
      n++;
    }
  }
  const byType = Object.entries(share).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t} ${pct(c / n)}`).join(', ');
  const high = recs.map((r) => r.highestLevel);
  return `Final boards: tower type share of occupied slots: ${byType}\nHighest tower level reached: median ${median(high)}, p90 ${percentile(high, 0.9)}`;
}
