/**
 * Data passed between scenes. GameScene owns the World and launches overlay scenes on top of
 * itself (scene.launch); an overlay never stops GameScene, it only calls World methods and then
 * stops itself. GameScene watches world.phase each frame and launches the matching overlay once.
 *
 *   phase 'upgrade'   -> Upgrade  (pick 1 of 3; optional reroll via the 'reroll' reward)
 *   phase 'event'     -> Event    (resolve the random event)
 *   phase 'defeated'  -> GameOver (offers the one 'revive' reward first; otherwise forfeit + results)
 *   bossDefeated evt  -> Reward { kind: 'rareTower' }       (optional, skippable)
 *   prewave of a boss wave (wave % 5 === 0) -> Reward { kind: 'emergencyPower' } (optional, once per run)
 *   pause button / host pause -> Pause
 */
import type { DailyModifier } from '../../data/types';
import type { WorldApi } from '../../sim/api';

/** Shared by every in-run overlay. */
export interface RunContext {
  world: WorldApi;
  /** Unique per run; RewardService ClaimContext.runId and finishRun's runId. */
  runId: string;
  /** Daily challenge key when this run is the daily challenge. */
  daily?: { key: string; modifiers: DailyModifier[] };
}

export interface GameSceneData {
  /** Omit for a normal run. */
  daily?: { key: string; seed: number; modifiers: DailyModifier[] };
}

export type UpgradeSceneData = RunContext;
export type EventSceneData = RunContext;
export type PauseSceneData = RunContext;
export type GameOverSceneData = RunContext;

export interface RewardSceneData extends RunContext {
  kind: 'rareTower' | 'emergencyPower';
  /** Boss wave number (claim key for rareTower). */
  wave: number;
}

/** Events overlays emit on the GameScene's event emitter (scene.get(SceneKeys.Game).events). */
export const OverlayEvents = {
  /** An overlay closed and the run continues. */
  Closed: 'overlay-closed',
  /** Player chose to restart from the game-over screen. */
  Restart: 'overlay-restart',
} as const;
