import type { Rng } from '../../core/rng';
import type { Rarity, RunState } from '../../core/types';

// Data passed between the gameplay scene (Game) and the overlay scenes built on top of it.

export interface UpgradeSceneData {
  run: RunState;
  rng: Rng;                       // the run's upgrade stream, so daily runs stay deterministic
  reason: 'room' | 'boss' | 'bonus' | 'shrine' | 'treasure';
  minRarity?: Rarity;
  /** After a boss: offer the optional rewarded "extra upgrade" (one more pick) once. */
  offerExtra?: boolean;
  /** Called once the player has picked (and any extra pick is done). Game resumes itself. */
  onDone: () => void;
}

export interface GameOverSceneData {
  run: RunState;
  /** Revive is offered at most once per run; Game passes false once used. */
  canRevive: boolean;
  /** Restores the run (Game sets hp, invulnerability and resumes). */
  onRevive: () => void;
  /** True when the player quit from the pause menu instead of dying. */
  abandoned?: boolean;
}

export interface GameSceneData {
  hero: string;
  mode: 'normal' | 'daily';
}
