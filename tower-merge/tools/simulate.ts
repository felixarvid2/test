/**
 * Balance simulator: plays many bot runs (all policies, tower pools and meta levels), collects
 * telemetry through BotHooks and prints a text report. See docs/BALANCE.md.
 *
 *   npm run sim                                  quick sweep (policy x meta, 10 runs per cell)
 *   npm run sim -- --runs 30 --pool all          the full report (slow: minutes)
 *   npm run sim -- --policy greedy --meta late   one cell
 *   npm run sim -- --probe synergy|upgrade|pool|towers|economy|all
 *
 * Flags: --runs N, --policy greedy|churn|random|noUpgrades|mergeHeavy|spreadOut|all, --meta fresh|mid|late|max|all,
 *        --pool natural|start|full|subset|all (or a comma list), --seed BASE, --maxwaves N, --workers N, --probe KIND,
 *        --probe-runs N, --probe-meta META, --set path=value,... (what-if overrides), --json FILE (raw run records), --sections a,b,c, --quiet.
 */
import { cpus } from 'node:os';
import { writeFileSync } from 'node:fs';
import type { BotPolicy } from '../src/sim/bot';
import { Rng } from '../src/sim/rng';
import type { TowerId } from '../src/data/types';
import {
  boardSection, bossSection, deathSection, economySection, eventSection, killerSection, lengthSection, matrixSection,
  synergySection, towerSection, upgradeSection,
} from './balance/analyze';
import { economyReport } from './balance/economy';
import { runJobs } from './balance/jobs';
import type { JobSpec } from './balance/jobs';
import { META_GEMS, describePreset, randomSubset, towersForMeta } from './balance/presets';
import type { MetaPreset } from './balance/presets';
import { applyOverrides, parseSet } from './balance/overrides';
import { probeReport, synergyProbe, towerProbe, upgradeProbe } from './balance/probes';
import { benchReport, runBench } from './balance/towerBench';

const POLICIES: (BotPolicy | 'churn')[] = ['greedy', 'churn', 'mergeHeavy', 'spreadOut', 'random', 'noUpgrades'];
const METAS: MetaPreset[] = ['fresh', 'mid', 'late'];
const SECTIONS = ['matrix', 'length', 'deaths', 'bosses', 'killers', 'towers', 'boards', 'economy', 'upgrades', 'synergies', 'events'];

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i];
    else out[a.slice(2)] = 'true';
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const num = (k: string, d: number): number => (args[k] !== undefined ? Number(args[k]) : d);
const workers = num('workers', Math.max(1, Math.min(4, cpus().length)));
const quiet = args.quiet === 'true';
const overrides = parseSet(args.set);
const log = (s: string): void => { if (!quiet) process.stderr.write(`${s}\n`); };
const heading = (s: string): void => console.log(`\n=== ${s} ===`);

function progress(label: string): (p: { done: number; total: number }) => void {
  let last = 0;
  return (p) => {
    const now = Date.now();
    if (now - last > 1500 || p.done === p.total) {
      last = now;
      log(`  ${label}: ${p.done}/${p.total}`);
    }
  };
}

async function sweep(): Promise<void> {
  const policies = args.policy && args.policy !== 'all' ? (args.policy.split(',') as (BotPolicy | 'churn')[]) : POLICIES;
  const metas = args.meta && args.meta !== 'all' ? (args.meta.split(',') as MetaPreset[]) : METAS;
  const poolMode = args.pool ?? 'natural';
  const runs = num('runs', 10);
  const base = num('seed', 1000);
  const maxWaves = num('maxwaves', 40);
  const jobs: JobSpec[] = [];
  for (const meta of metas) {
    const modes = poolMode === 'all' ? ['start', 'full', 'subset'] : poolMode.split(',');
    for (const mode of modes) {
      for (const policy of policies) {
        for (let i = 0; i < runs; i++) {
          const seed = base + i;
          const pool: TowerId[] = mode === 'subset'
            ? randomSubset(new Rng(seed * 31 + 7))
            : towersForMeta(meta, mode === 'natural' ? 'mixed' : (mode as 'start' | 'full'));
          jobs.push({ seed, policy, meta, pool, poolLabel: mode, maxWaves, ...(overrides ? { set: overrides } : {}) });
        }
      }
    }
  }
  log(`sweep: ${jobs.length} runs on ${workers} worker(s)`);
  const t0 = Date.now();
  const recs = await runJobs(jobs, workers, progress('runs'));
  log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (args.json) writeFileSync(args.json, JSON.stringify(recs));

  // Report. Metas are labelled by preset; with --pool all the pool mode is part of the label.
  const labelled = poolMode === 'all' || poolMode.includes(',') ? recs.map((r) => ({ ...r, cfg: { ...r.cfg, meta: `${r.cfg.meta}/${r.cfg.poolLabel}` } })) : recs;
  const wanted = (args.sections ?? SECTIONS.join(',')).split(',');
  const has = (s: string): boolean => wanted.includes(s);
  heading('Presets');
  for (const m of metas) console.log(`${describePreset(m)}  (~${META_GEMS[m]} gems earned in total)`);
  console.log('Abilities: all four. Policies: greedy = rarity-first upgrade picks, merge whenever possible; churn = greedy + sells lonely level 1 towers to reroll when the board is full (tools/balance/churnBot.ts); mergeHeavy / spreadOut = merge-first / never merge; random = random upgrades and board; noUpgrades = only fallback cards.');
  if (has('matrix')) { heading('Policy x meta'); console.log(matrixSection(labelled)); }
  if (has('length')) { heading('Run length'); console.log(lengthSection(labelled)); }
  const focus = policies.includes('greedy') ? 'greedy' : policies[0];
  if (has('deaths')) { heading('Death distribution'); console.log(deathSection(labelled, focus)); }
  if (has('bosses')) { heading('Boss walls'); console.log(bossSection(labelled, focus)); }
  if (has('killers')) { heading('What killed the castle'); console.log(killerSection(labelled, focus)); }
  if (has('towers')) { heading('Towers'); console.log(towerSection(recs)); }
  if (has('boards')) { heading('Boards'); console.log(boardSection(recs.filter((r) => r.cfg.policy === focus))); }
  if (has('economy')) { heading('Economy'); console.log(economySection(labelled, focus)); }
  if (has('upgrades')) { heading('Upgrades'); console.log(upgradeSection(recs)); }
  if (has('synergies')) { heading('Synergies'); console.log(synergySection(recs)); }
  if (has('events')) { heading('Events'); console.log(eventSection(recs)); }
}

async function probes(kind: string): Promise<void> {
  const runs = num('probe-runs', 16);
  const meta = (args['probe-meta'] ?? 'fresh') as MetaPreset;
  const o = { set: overrides, runs, workers, seedBase: num('seed', 1000), meta, onProgress: progress('probe') };
  if (kind === 'towers' || kind === 'all') {
    heading('Tower benchmark');
    const revert = applyOverrides(overrides);
    console.log(benchReport(runBench()));
    revert();
  }
  if (kind === 'economy' || kind === 'all') {
    heading('Economy audit');
    const revert = applyOverrides(overrides);
    console.log(economyReport());
    revert();
  }
  if (kind === 'synergy' || kind === 'all') {
    log(`synergy probe: ${runs} paired seeds, greedy, ${meta}`);
    heading(`Synergy probe (greedy, ${meta}, ${runs} paired seeds): waves gained vs no synergies`);
    console.log(probeReport('', await synergyProbe(o)));
  }
  if (kind === 'pool' || kind === 'all') {
    log(`tower value probe: ${runs} paired seeds, greedy, ${meta}`);
    heading(`Tower value (greedy, ${meta}, ${runs} paired seeds): waves lost when the tower is removed from the pool`);
    console.log(probeReport('', await towerProbe(o)));
  }
  if (kind === 'upgrade' || kind === 'all') {
    log(`upgrade probe: ${runs} paired seeds, greedy, ${meta}`);
    heading(`Upgrade probe (greedy, ${meta}, ${runs} paired seeds): waves gained with one stack from the start`);
    console.log(probeReport('', await upgradeProbe(o), true));
  }
}

async function main(): Promise<void> {
  if (args.probe) await probes(args.probe);
  else await sweep();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
