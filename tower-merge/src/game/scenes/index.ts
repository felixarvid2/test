import type Phaser from 'phaser';
// Every scene after Boot/Preload (main.ts registers those two itself).
import { AchievementsScene } from './AchievementsScene';
import { CollectionScene } from './CollectionScene';
import { DailyScene } from './DailyScene';
import { EventScene } from './EventScene';
import { GameOverScene } from './GameOverScene';
import { GameScene } from './GameScene';
import { MenuScene } from './MenuScene';
import { PauseScene } from './PauseScene';
import { RewardScene } from './RewardScene';
import { SettingsScene } from './SettingsScene';
import { ShopScene } from './ShopScene';
import { StatsScene } from './StatsScene';
import { UpgradeScene } from './UpgradeScene';

// Order matters for rendering: overlays after GameScene so they draw on top.
export const GAME_SCENES: Array<new () => Phaser.Scene> = [
  MenuScene,
  ShopScene,
  CollectionScene,
  AchievementsScene,
  SettingsScene,
  StatsScene,
  DailyScene,
  GameScene,
  UpgradeScene,
  EventScene,
  RewardScene,
  PauseScene,
  GameOverScene,
];
