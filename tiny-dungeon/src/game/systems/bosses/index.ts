import type { BossModule } from '../BossController';
import { DRAGON } from './Dragon';
import { GIANT_SLIME } from './GiantSlime';
import { LICH } from './Lich';
import { MIMIC_KING } from './MimicKing';
import { SKELETON_KING } from './SkeletonKing';
import { SPIDER_QUEEN } from './SpiderQueen';

export const BOSS_MODULES: Record<string, BossModule> = {
  giant_slime: GIANT_SLIME,
  skeleton_king: SKELETON_KING,
  dragon: DRAGON,
  spider_queen: SPIDER_QUEEN,
  lich: LICH,
  mimic_king: MIMIC_KING,
};
