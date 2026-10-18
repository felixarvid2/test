import { BALANCE } from '../data/balance';
import type { EventOption, RandomEventDef } from '../data/types';
import { applyInstant, randomUpgradeAtLeast, takeUpgrade } from './offers';
import { mergeModifiers } from './waves';
import { refresh } from './refresh';
import type { SimState } from './state';

/**
 * Maybe starts a random event after the upgrade pick. Returns true when the phase became 'event'.
 * `chance` is BALANCE.events.chance and the event's own minWave applies to the wave about to start.
 */
export function maybeStartEvent(s: SimState): boolean {
  const upcoming = s.wave + 1;
  if (upcoming < BALANCE.events.minWave) return false;
  const eligible = s.content.events.filter((e) => e.minWave <= upcoming && e.options.length > 0);
  if (eligible.length === 0 || !s.rngM.chance(BALANCE.events.chance)) return false;
  const def = eligible[s.rngM.weighted(eligible.map((e) => e.weight))];
  s.pendingEvent = { id: def.id, name: def.name, description: def.description, options: rollOptions(s, def) };
  s.phase = 'event';
  s.emit({ type: 'phaseChanged', phase: 'event' });
  return true;
}

/** The last option is always the free decline; a chest shows a random selection of its other options. */
function rollOptions(s: SimState, def: RandomEventDef): EventOption[] {
  if (def.id !== 'chest') return def.options.slice();
  const decline = def.options[def.options.length - 1];
  const pool = def.options.slice(0, -1);
  const picks: EventOption[] = [];
  while (picks.length < BALANCE.events.chestChoices && pool.length > 0) {
    picks.push(pool.splice(s.rngM.int(pool.length), 1)[0]);
  }
  return [...picks, decline];
}

/** Applies a chosen option. Returns false for unknown options or when the cost cannot be paid. */
export function applyEventOption(s: SimState, optionId: string): boolean {
  const ev = s.pendingEvent;
  if (!ev || s.phase !== 'event') return false;
  const opt = ev.options.find((o) => o.id === optionId);
  if (!opt) return false;
  const cost = opt.cost ?? 0;
  if (cost > s.coins) return false;
  if (cost > 0) s.addCoins(-cost, undefined, undefined, false);
  if (opt.waveModifier) s.nextWaveMod = s.nextWaveMod ? mergeModifiers(s.nextWaveMod, opt.waveModifier) : { ...opt.waveModifier };
  if (opt.effects) {
    for (const e of opt.effects) if (e.kind !== 'instant') s.eventEffects.push(e);
    refresh(s);
    for (const e of opt.effects) if (e.kind === 'instant') applyInstant(s, e);
  }
  if (opt.upgradeRarity) {
    const up = randomUpgradeAtLeast(s, opt.upgradeRarity);
    if (up) takeUpgrade(s, up);
    else s.addCoins(BALANCE.upgrades.fallbackCoins[1]);
  }
  s.pendingEvent = null;
  refresh(s);
  return true;
}
