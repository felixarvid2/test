// Every scene after Boot/Preload. Gameplay owns Game/Hud/Pause; menus own the rest.
import { MenuScene } from './MenuScene';
import { HeroSelectScene } from './HeroSelectScene';
import { ShopScene } from './ShopScene';
import { SettingsScene } from './SettingsScene';
import { AchievementsScene } from './AchievementsScene';
import { GameScene } from './GameScene';
import { HudScene } from './HudScene';
import { UpgradeScene } from './UpgradeScene';
import { PauseScene } from './PauseScene';
import { GameOverScene } from './GameOverScene';

export const GAME_SCENES = [
  MenuScene, HeroSelectScene, ShopScene, SettingsScene, AchievementsScene,
  GameScene, HudScene, UpgradeScene, PauseScene, GameOverScene,
];
