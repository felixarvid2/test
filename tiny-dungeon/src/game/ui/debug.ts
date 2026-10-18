import type Phaser from 'phaser';
import { services } from '../../services';
import { Rng, newSeed } from '../../core/rng';
import { applyUpgrade, createRun, synergyHintsFor } from '../../core/run';
import { UPGRADE_BY_ID } from '../../data/upgrades';
import type { GameMode, HeroId, Rarity, RunState } from '../../core/types';
import { SCENES } from '../scenes/keys';
import type { GameOverSceneData, UpgradeSceneData } from '../scenes/contracts';

export interface DebugRunOpts {
  hero?: HeroId;
  mode?: GameMode;
  room?: number;
  kills?: number;
  gold?: number;
  level?: number;
  seed?: number;
  runId?: string;
  rerolls?: number;
  /** Upgrade ids applied (one level each) before the scene opens. */
  upgrades?: string[];
}

/**
 * `window.__td`: a debug hook for the UI smoke test (tools/ui-smoke.mjs) to open the overlay scenes
 * without playing a run. Only installed in dev builds or with `?debug=1`.
 */
export function installDebugHook(scene: Phaser.Scene): void {
  const enabled = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
  if (!enabled) return;

  const makeRun = (o: DebugRunOpts = {}): RunState => {
    const save = services.save.data;
    const run = createRun({
      hero: o.hero ?? save.selectedHero,
      seed: o.seed ?? newSeed(),
      mode: o.mode ?? 'normal',
      meta: save.meta,
      unlocks: save.unlocks,
      runId: o.runId ?? `dbg-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`,
    });
    for (const id of o.upgrades ?? []) applyUpgrade(run, id);
    run.room = o.room ?? 1;
    run.kills = o.kills ?? 0;
    run.gold = o.gold ?? 0;
    run.level = o.level ?? 1;
    if (o.rerolls !== undefined) run.rerollsLeft = o.rerolls;
    return run;
  };

  const state = { upgradeDone: 0, revived: 0 };
  let speedK = 1;
  let timer: number | undefined;
  const apply = (): void => {
    for (const sc of scene.game.scene.getScenes(false)) {
      sc.tweens.timeScale = speedK;
      sc.time.timeScale = speedK;
    }
  };
  const api = {
    game: scene.game,
    services,
    scenes: SCENES,
    state,
    makeRun,
    upgrade(o: DebugRunOpts & { reason?: UpgradeSceneData['reason']; minRarity?: Rarity; offerExtra?: boolean } = {}): RunState {
      const run = makeRun(o);
      const data: UpgradeSceneData = {
        run,
        rng: new Rng(run.seed).fork('upgrades'),
        reason: o.reason ?? 'room',
        minRarity: o.minRarity,
        offerExtra: o.offerExtra,
        onDone: () => { state.upgradeDone += 1; },
      };
      scene.scene.launch(SCENES.upgrade, data);
      return run;
    },
    /** Opens the upgrade scene, then deals exactly these upgrade ids (to see every rarity / a synergy). */
    upgradeWith(ids: string[], o: DebugRunOpts & { reason?: UpgradeSceneData['reason']; offerExtra?: boolean } = {}): RunState {
      const run = api.upgrade(o);
      scene.time.delayedCall(80, () => {
        const sc = scene.scene.get(SCENES.upgrade) as unknown as {
          destroyCards(): void; deal(c: unknown[]): void; updateReroll(): void;
        };
        sc.destroyCards();
        sc.deal(ids.map((id) => {
          const def = UPGRADE_BY_ID[id];
          return { def, nextLevel: (run.upgrades[id] ?? 0) + 1, synergyHints: synergyHintsFor(run, def) };
        }));
      });
      return run;
    },
    gameOver(o: DebugRunOpts & { canRevive?: boolean; abandoned?: boolean } = {}): RunState {
      const run = makeRun(o);
      const data: GameOverSceneData = {
        run,
        canRevive: o.canRevive ?? false,
        abandoned: o.abandoned,
        onRevive: () => { state.revived += 1; },
      };
      scene.scene.launch(SCENES.gameOver, data);
      return run;
    },
    /** Runs every scene's tweens and timers k times faster (slow software-GL test browsers). */
    speed(k: number): void {
      speedK = k;
      apply();
      timer ??= window.setInterval(apply, 100);
    },
    open(key: string, data?: object): void {
      scene.scene.start(key, data);
    },
  };
  (window as unknown as { __td: typeof api }).__td = api;
}
