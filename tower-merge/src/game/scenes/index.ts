import type Phaser from 'phaser';
// Every scene after Boot/Preload (main.ts registers those two itself). Scene agents append here.
import { MenuScene } from './MenuScene';

export const GAME_SCENES: Array<new () => Phaser.Scene> = [
  MenuScene,
];
