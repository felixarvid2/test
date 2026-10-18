import { BALANCE } from '../data/balance';
import { removeTempTower } from './board';
import { updateGems } from './combat';
import { maybeStartEvent } from './events';
import { drawOffers } from './offers';
import { refresh } from './refresh';
import { buildPlan, mergeModifiers } from './waves';
import type { SimState } from './state';

/** Enters the pre-wave countdown; `advance` moves on to the next wave number. */
export function beginPrewave(s: SimState, advance: boolean): void {
  if (advance) s.wave++;
  s.stats.wave = s.wave;
  s.phase = 'prewave';
  s.prewaveTime = s.wave === 1 ? BALANCE.waves.firstPrewave : BALANCE.waves.prewave;
  s.emit({ type: 'phaseChanged', phase: 'prewave' });
}

export function startWave(s: SimState): void {
  const mod = mergeModifiers(s.opts.daily?.waveModifier, s.nextWaveMod);
  s.activeWaveMod = mod;
  s.nextWaveMod = null;
  s.plan = buildPlan(s, mod);
  s.phase = 'wave';
  s.flawless = true;
  s.stats.wave = s.wave;
  if (s.pendingDoubleDamage) {
    s.pendingDoubleDamage = false;
    s.doubleDamage = true;
    refresh(s);
  }
  if (s.pendingFreezeStart) {
    s.pendingFreezeStart = false;
    s.freezeStartLeft = BALANCE.waves.freezeStartWindow;
  }
  s.emit({ type: 'waveStart', wave: s.wave, isBoss: s.plan.isBoss, enemyCount: s.plan.entries.length });
  s.emit({ type: 'phaseChanged', phase: 'wave' });
}

function clearTransients(s: SimState): void {
  for (const p of s.projectiles) p.active = false;
  for (const z of s.zones) z.active = false;
  s.freezeStartLeft = 0;
}

/** All enemies of the wave are gone: reward, then the upgrade screen. */
export function completeWave(s: SimState): void {
  const wave = s.wave;
  clearTransients(s);
  removeTempTower(s);
  if (s.doubleDamage) {
    s.doubleDamage = false;
    refresh(s);
  }
  s.activeWaveMod = null;
  s.plan = null;
  const flawless = s.flawless;
  const C = BALANCE.coins;
  const base = C.waveClearBase + C.waveClearPerWave * wave;
  const bonus = Math.max(0, Math.round(base * (flawless ? 1 + C.flawlessBonusFraction : 1) + s.gm.value('waveCoinBonus', 0)));
  s.stats.wavesCleared++;
  if (flawless) s.stats.flawlessWaves++;
  updateGems(s);
  s.addCoins(bonus);
  s.emit({ type: 'waveCleared', wave, flawless, bonus });
  s.upgradeChoices = drawOffers(s);
  s.paidRerollUsed = false;
  s.phase = 'upgrade';
  s.emit({ type: 'phaseChanged', phase: 'upgrade' });
}

/** After an upgrade is chosen: maybe a random event, otherwise the next pre-wave. */
export function afterUpgrade(s: SimState): void {
  s.upgradeChoices = [];
  if (!maybeStartEvent(s)) beginPrewave(s, true);
}

/** After an event is resolved. */
export function afterEvent(s: SimState): void {
  beginPrewave(s, true);
}
