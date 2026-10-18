import type Phaser from 'phaser';
import type { Rng } from '../../core/rng';
import type { RoomPlan, RunState } from '../../core/types';
import type { Enemy } from '../entities/Enemy';
import type { EnemyPool } from '../entities/EnemyPool';
import type { PickupPool } from '../entities/PickupPool';
import type { Player } from '../entities/Player';
import type { ProjectilePool } from '../entities/ProjectilePool';
import type { AbilitySystem } from './AbilitySystem';
import type { BossController } from './BossController';
import type { CombatSystem } from './CombatSystem';
import type { DamageNumbers } from './DamageNumbers';
import type { Effects } from './Effects';
import type { SpatialGrid } from './SpatialGrid';
import type { StatusSystem } from './StatusSystem';
import type { Telegraphs } from './Telegraphs';
import type { WeaponSystem } from './WeaponSystem';

/** Events the systems raise; GameScene implements them. */
export interface WorldHooks {
  levelUp(levels: number): void;
  bossKilled(boss: Enemy): void;
  playerDied(): void;
  phoenix(): void;
  playerHurt(taken: number): void;
}

/**
 * Everything the gameplay systems share. Plain fields assigned once by GameScene; systems keep a
 * reference to the World and read `run`, `plan` and the other systems from it.
 */
export class World {
  scene!: Phaser.Scene;
  run!: RunState;
  plan!: RoomPlan;
  rng!: Rng;     // combat randomness (crits, statuses, spawn positions)
  loot!: Rng;    // drops and eggs
  player!: Player;
  grid!: SpatialGrid;
  enemies!: EnemyPool;
  playerShots!: ProjectilePool;
  enemyShots!: ProjectilePool;
  pickups!: PickupPool;
  numbers!: DamageNumbers;
  fx!: Effects;
  tele!: Telegraphs;
  combat!: CombatSystem;
  status!: StatusSystem;
  abilities!: AbilitySystem;
  weapons!: WeaponSystem;
  boss: BossController | null = null;
  hooks!: WorldHooks;
  /** Simulation seconds since the room started (slow-motion aware). */
  roomTime = 0;
  /** False while a banner / intro / transition freezes combat. */
  combatActive = false;
}
