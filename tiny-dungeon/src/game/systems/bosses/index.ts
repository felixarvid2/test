import type { BossModule } from '../BossController';
import { DRAGON } from './Dragon';
import { GIANT_SLIME } from './GiantSlime';
import { SKELETON_KING } from './SkeletonKing';

export const BOSS_MODULES: Record<string, BossModule> = {
  giant_slime: GIANT_SLIME,
  skeleton_king: SKELETON_KING,
  dragon: DRAGON,
};
