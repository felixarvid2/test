/**
 * Dev-only overlay harness (loaded from main.ts in dev builds). Open the game with
 * `?overlay=<name>` and the matching overlay scene starts directly on top of a static backdrop,
 * driven by a fake WorldApi built from the real content data. Names:
 *
 *   upgrade  upgrade-legendary  upgrade-free  event-treasure  event-merchant  event-chest
 *   reward-tower  reward-tower-full  reward-power  pause
 *   gameover-revive  gameover-defeat  gameover-victory
 *
 * Extra query params: `gems=<n>` (save gems, for the gem-priced rewards), `mockads=auto|0|...`
 * (see BrowserPlatform), `loop=1` (restart the overlay each time it closes),
 * `reduced=1` (reduced motion: final states at once, handy for slow screenshot machines).
 */
import Phaser from 'phaser';
import { EVENTS } from '../../data/events';
import { SYNERGIES } from '../../data/synergies';
import { UPGRADES } from '../../data/upgrades';
import type { Rarity, UpgradeDef } from '../../data/types';
import { services } from '../../services';
import { OverlayEvents, type RunContext } from '../scenes/contracts';
import { SceneKeys } from '../scenes/keys';
import { H, W } from '../ui';
import { createFakeWorld, fakeRunStats, fakeSlots, type FakeWorld } from './fakeWorld';

const BACKDROP = 'DevBackdrop';

class DevBackdrop extends Phaser.Scene {
  constructor() { super(BACKDROP); }
  create(): void {
    if (this.textures.exists('bg_board')) this.add.image(W / 2, H / 2, 'bg_board').setDisplaySize(W, H);
    else this.cameras.main.setBackgroundColor(0x1d3a24);
    if (this.textures.exists('castle')) this.add.image(W / 2, 1060, 'castle').setDisplaySize(300, 200);
    for (let i = 0; i < 6; i++) {
      const key = `tower_arrow_${1 + (i % 3)}`;
      if (this.textures.exists(key)) this.add.image(130 + (i % 3) * 230, 700 + Math.floor(i / 3) * 150, key).setDisplaySize(130, 130);
    }
    this.add.text(12, 10, 'dev backdrop (GameScene)', { fontSize: '20px', color: '#ffffff' });
  }
}

function pick(rarity: Rarity, skip = 0): UpgradeDef {
  return UPGRADES.filter((u) => u.rarity === rarity)[skip];
}

function event(id: string, chestPicks?: number[]) {
  const def = EVENTS.find((e) => e.id === id);
  if (!def) throw new Error(`no event ${id}`);
  const options = chestPicks
    ? [...chestPicks.map((i) => def.options[i]), def.options[def.options.length - 1]]
    : def.options;
  return { id: def.id, name: def.name, description: def.description, options };
}

interface Scenario {
  key: string;
  world: FakeWorld;
  extra?: object;
}

function build(name: string): Scenario | null {
  const taken = ['rapidFire', 'rapidFire', 'heavyHitters', 'plunder', 'farSight', 'keenEye', 'fortifiedWalls', 'rapidFire',
    ...UPGRADES.filter((u) => u.rarity !== 'common').slice(0, 9).map((u) => u.id)];
  const synergies = SYNERGIES.slice(0, 4).map((s) => s.id);
  const stats = (over = {}) => fakeRunStats({ upgradesTaken: [...taken], synergiesActivated: synergies.slice(0, 3), ...over });
  switch (name) {
    case 'upgrade':
      return { key: SceneKeys.Upgrade, world: createFakeWorld({
        phase: 'upgrade', wave: 4, upgradeChoices: [pick('common'), pick('rare'), pick('epic')], stats: stats(), activeSynergies: synergies,
      }) };
    case 'upgrade-legendary':
      return { key: SceneKeys.Upgrade, world: createFakeWorld({
        phase: 'upgrade', wave: 9, upgradeChoices: [UPGRADES.find((u) => u.id === 'rapidFire') as UpgradeDef, pick('epic', 1), pick('legendary')],
        stats: stats(), activeSynergies: synergies, freeRerolls: 0,
      }) };
    case 'upgrade-free':
      return { key: SceneKeys.Upgrade, world: createFakeWorld({
        phase: 'upgrade', wave: 2, upgradeChoices: [pick('common', 1), pick('common', 2), pick('rare', 1)], stats: stats({ upgradesTaken: [] }), freeRerolls: 2,
      }) };
    case 'event-treasure':
      return { key: SceneKeys.Event, world: createFakeWorld({ phase: 'event', pendingEvent: event('treasure') }) };
    case 'event-merchant':
      return { key: SceneKeys.Event, world: createFakeWorld({ phase: 'event', coins: 100, pendingEvent: event('merchant') }) };
    case 'event-chest':
      return { key: SceneKeys.Event, world: createFakeWorld({ phase: 'event', pendingEvent: event('chest', [0, 3, 2]) }) };
    case 'reward-tower':
      return { key: SceneKeys.Reward, world: createFakeWorld({ phase: 'wave', wave: 5 }), extra: { kind: 'rareTower', wave: 5 } };
    case 'reward-tower-full':
      return { key: SceneKeys.Reward, world: createFakeWorld({ phase: 'wave', wave: 5, slots: fakeSlots(6, 6) }), extra: { kind: 'rareTower', wave: 5 } };
    case 'reward-power':
      return { key: SceneKeys.Reward, world: createFakeWorld({ phase: 'prewave', wave: 5 }), extra: { kind: 'emergencyPower', wave: 5 } };
    case 'pause':
      return { key: SceneKeys.Pause, world: createFakeWorld({ phase: 'wave', wave: 8, stats: stats({ wave: 8, enemiesKilled: 1234, towersMerged: 27 }) }) };
    case 'gameover-revive':
      return { key: SceneKeys.GameOver, world: createFakeWorld({ phase: 'defeated', wave: 7, stats: stats() }) };
    case 'gameover-defeat':
      return { key: SceneKeys.GameOver, world: createFakeWorld({ phase: 'defeated', revived: true, wave: 7, stats: stats() }) };
    case 'gameover-victory':
      return { key: SceneKeys.GameOver, world: createFakeWorld({
        phase: 'over', wave: 16, revived: true,
        stats: stats({ wave: 16, wavesCleared: 15, enemiesKilled: 2345, towersMerged: 64, highestTowerLevel: 5, coinsEarned: 48210, gemsEarned: 120, bossesKilled: ['goblinKing', 'stoneGolem', 'dragon'] }),
      }) };
    default:
      return null;
  }
}

function start(game: Phaser.Game, name: string, loop: boolean): void {
  const sc = build(name);
  if (!sc) { console.warn(`[overlay harness] unknown overlay "${name}"`); return; }
  const ctx: RunContext & Record<string, unknown> = { world: sc.world, runId: `dev-${name}-${Date.now()}`, ...sc.extra };
  (window as unknown as { __overlay?: unknown }).__overlay = { world: sc.world, ctx };
  game.scene.start(sc.key, ctx);
  console.info(`[overlay harness] started ${sc.key} (${name})`);
  void loop;
}

function boot(game: Phaser.Game, name: string, params: URLSearchParams): void {
  if (params.get('reduced') === '1') void services.save.update((d) => { d.settings.reducedMotion = true; });
  const gems = params.get('gems');
  if (gems !== null) void services.save.update((d) => { d.gems = Math.max(0, Number(gems) || 0); });
  game.scene.stop(SceneKeys.Menu);
  game.scene.add(BACKDROP, DevBackdrop, true);
  game.scene.sendToBack(BACKDROP);
  const loop = params.get('loop') === '1';
  const log = (window as unknown as { __overlayLog?: string[] });
  log.__overlayLog = [];
  // The Game scene key is a placeholder until GameScene exists; its emitter still receives events.
  const gameScene = game.scene.getScene(SceneKeys.Game);
  for (const ev of [OverlayEvents.Closed, OverlayEvents.Restart]) {
    gameScene?.events.on(ev, () => {
      log.__overlayLog?.push(ev);
      console.info(`[overlay harness] ${ev}`);
      if (loop || ev === OverlayEvents.Restart) setTimeout(() => start(game, name, loop), 700);
    });
  }
  start(game, name, loop);
}

const params = new URLSearchParams(location.search);
const wanted = params.get('overlay');
if (wanted) {
  const timer = setInterval(() => {
    const game = (window as unknown as { game?: Phaser.Game }).game;
    if (!game || !game.scene.isActive(SceneKeys.Menu)) return;
    clearInterval(timer);
    boot(game, wanted, params);
  }, 100);
}
