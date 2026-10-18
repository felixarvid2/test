import { BALANCE } from '../data/balance';
import { SLOTS } from '../data/map';
import { TOWERS } from '../data/towers';
import type { Effect, TowerId } from '../data/types';
import { TOWER_IDS } from '../data/types';
import { FL, ModSet, NFLAGS, STAT_INDEX } from './modifiers';
import type { SimState, TowerInst } from './state';

export const TOWER_INDEX: Record<TowerId, number> = {
  arrow: 0, cannon: 1, frost: 2, lightning: 3, fire: 4, poison: 5, sniper: 6, magic: 7,
};

/** baseEffects + cumulative level perks for every (type, level): instance-scoped, never changes. */
export function buildOwnMods(s: SimState): void {
  for (const id of TOWER_IDS) {
    const def = TOWERS[id];
    const perLevel: ModSet[] = [new ModSet()];
    for (let level = 1; level <= def.levels.length; level++) {
      const m = new ModSet();
      for (const e of def.baseEffects) m.addEffect(e);
      for (let l = 2; l <= level; l++) for (const e of def.levels[l - 1].perks) m.addEffect(e);
      perLevel.push(m);
    }
    s.ownMods[TOWER_INDEX[id]] = perLevel;
  }
}

/** Meta bonuses and daily effects as plain effects, applied for the whole run. */
export function buildMetaEffects(s: SimState): void {
  const o = s.opts;
  const out = s.metaEffects;
  out.length = 0;
  if (o.damagePct) out.push({ kind: 'stat', stat: 'damage', op: 'pct', value: o.damagePct });
  if (o.fireRatePct) out.push({ kind: 'stat', stat: 'fireRate', op: 'pct', value: o.fireRatePct });
  if (o.coinGainPct) out.push({ kind: 'global', stat: 'coinGain', op: 'pct', value: o.coinGainPct });
  if (o.discountPct) out.push({ kind: 'global', stat: 'towerCost', op: 'pct', value: -o.discountPct });
  if (o.abilityCdPct) out.push({ kind: 'global', stat: 'abilityCooldown', op: 'pct', value: -o.abilityCdPct });
  if (o.castleHpBonus) out.push({ kind: 'global', stat: 'castleMaxHp', op: 'flat', value: o.castleHpBonus });
  if (o.daily?.effects) for (const e of o.daily.effects) out.push(e);
}

function applyEffect(s: SimState, e: Effect): void {
  if (e.kind === 'stat' || e.kind === 'flag') {
    if (e.tower) for (const t of e.tower) s.typeMods[TOWER_INDEX[t]].addEffect(e);
    else for (let i = 0; i < s.typeMods.length; i++) s.typeMods[i].addEffect(e);
    if (e.kind === 'flag') s.gm.addEffect(e);
  } else if (e.kind === 'global') {
    s.gm.addEffect(e);
  }
}

/** Flag total used by synergy requirements: best single tower on the board (before synergy effects). */
function boardFlagTotal(s: SimState, flagIdx: number): number {
  let best = 0;
  for (const slot of s.slots) {
    const t = slot.tower;
    if (!t) continue;
    const ti = TOWER_INDEX[t.type];
    const f = s.typeMods[ti].flags[flagIdx] + s.ownMods[ti][t.level].flags[flagIdx];
    if (f > best) best = f;
  }
  return best;
}

function evaluateSynergies(s: SimState): void {
  const present = new Set<TowerId>();
  const maxLevel = new Map<TowerId, number>();
  for (const slot of s.slots) {
    const t = slot.tower;
    if (!t) continue;
    present.add(t.type);
    maxLevel.set(t.type, Math.max(maxLevel.get(t.type) ?? 0, t.level));
  }
  const nowActive: string[] = [];
  for (const syn of s.content.synergies) {
    const r = syn.requires;
    let ok = true;
    if (r.towers) for (const t of r.towers) if (!present.has(t)) { ok = false; break; }
    if (ok && r.upgrades) for (const u of r.upgrades) if (!s.taken.has(u)) { ok = false; break; }
    if (ok && r.towerLevel && (maxLevel.get(r.towerLevel.tower) ?? 0) < r.towerLevel.level) ok = false;
    if (ok && r.flags) for (const f of r.flags) if (boardFlagTotal(s, FL[f.flag]) < f.min) { ok = false; break; }
    if (ok) nowActive.push(syn.id);
  }
  for (const id of nowActive) {
    if (s.activeSynergies.includes(id)) continue;
    const syn = s.content.synergies.find((x) => x.id === id)!;
    s.emit({ type: 'synergyActivated', id, name: syn.name });
    if (!s.stats.synergiesActivated.includes(id)) s.stats.synergiesActivated.push(id);
  }
  s.activeSynergies = nowActive;
}

/** Recomputes one tower's effective stats from the aggregated modifiers. */
export function computeTowerStats(s: SimState, t: TowerInst): void {
  const def = TOWERS[t.type];
  const ti = TOWER_INDEX[t.type];
  const tm = s.typeMods[ti];
  const om = s.ownMods[ti][t.level];
  const lvl = def.levels[t.level - 1];
  const st = t.stats;
  const eff = (i: number, base: number, extraPct = 0): number =>
    (base + tm.flat[i] + om.flat[i]) * (1 + tm.pct[i] + om.pct[i] + extraPct) * tm.mul[i] * om.mul[i];

  let adj = 0;
  const neigh = SLOTS[t.slot].neighbours;
  for (let k = 0; k < neigh.length; k++) {
    const o = s.slots[neigh[k]].tower;
    if (o && o.type !== t.type) adj++;
  }
  const adjBonus = tm.flags[FL.adjacencyBonus] + om.flags[FL.adjacencyBonus];

  const baseDamage = def.damage * lvl.damageMult;
  st.damage = Math.max(0, eff(STAT_INDEX.damage, baseDamage) * s.buffDamageMul * (1 + adjBonus * adj));
  st.fireRate = Math.min(12, Math.max(0.05, eff(STAT_INDEX.fireRate, def.fireRate * lvl.fireRateMult, s.buffFireRatePct)));
  st.range = Math.max(40, eff(STAT_INDEX.range, def.range + lvl.rangeBonus));
  st.splash = Math.max(0, eff(STAT_INDEX.splashRadius, def.splashRadius));
  st.critChance = Math.min(1, Math.max(0, eff(STAT_INDEX.critChance, def.critChance)));
  st.critMult = Math.max(1, eff(STAT_INDEX.critMult, def.critMult));
  st.projSpeed = Math.max(0, eff(STAT_INDEX.projectileSpeed, def.projectileSpeed));
  st.statusPower = Math.max(0, eff(STAT_INDEX.statusPower, def.statusPower));
  st.statusDuration = Math.max(0.1, eff(STAT_INDEX.statusDuration, def.statusDuration));
  st.chainCount = Math.max(0, Math.round(eff(STAT_INDEX.chainCount, def.chainCount)));
  st.chainRange = Math.max(0, eff(STAT_INDEX.chainRange, def.chainRange));
  st.armorPen = Math.min(0.95, Math.max(0, eff(STAT_INDEX.armorPen, def.armorPen)));
  st.spRel = def.statusPower > 0 ? st.statusPower / def.statusPower : 1;
  st.durRel = def.statusDuration > 0 ? st.statusDuration / def.statusDuration : 1;
  st.dotScale = def.damage > 0 ? st.damage / def.damage : 1;
  for (let k = 0; k < NFLAGS; k++) {
    if (k === FL.everyNthExplosion) {
      const a = tm.flags[k];
      const b = om.flags[k];
      st.flags[k] = a > 0 && b > 0 ? Math.min(a, b) : a > 0 ? a : b;
    } else {
      st.flags[k] = tm.flags[k] + om.flags[k];
    }
  }
}

/** Rebuilds modifiers, synergies and every tower's cached stats. Call after any board/upgrade/buff change. */
export function refresh(s: SimState): void {
  for (const m of s.typeMods) m.clear();
  s.gm.clear();
  for (const e of s.metaEffects) applyEffect(s, e);
  for (const [id, stacks] of s.taken) {
    const up = s.content.upgrades.find((u) => u.id === id);
    if (!up) continue;
    for (let k = 0; k < stacks; k++) for (const e of up.effects) applyEffect(s, e);
  }
  for (const e of s.eventEffects) applyEffect(s, e);

  evaluateSynergies(s);
  for (const id of s.activeSynergies) {
    const syn = s.content.synergies.find((x) => x.id === id)!;
    for (const e of syn.effects) applyEffect(s, e);
  }

  s.buffFireRatePct = 0;
  if (s.frenzyTime > 0) s.buffFireRatePct += BALANCE.abilities.frenzy.fireRatePct;
  if (s.mergeFrenzyTime > 0) s.buffFireRatePct += BALANCE.combat.mergeFrenzyFireRatePct;
  s.buffDamageMul = s.doubleDamage ? BALANCE.emergency.doubleDamageMult : 1;

  s.coinGainMult = Math.max(0, s.gm.value('coinGain', 1));
  s.bossDamageMult = Math.max(0, s.gm.value('bossDamage', 1));
  s.abilityPowerMult = Math.max(0.1, s.gm.value('abilityPower', 1));
  s.abilityCdMult = Math.max(0.2, s.gm.value('abilityCooldown', 1));
  s.towerCostMult = Math.max(0.2, s.gm.value('towerCost', 1));

  const newMax = Math.max(1, Math.round(s.gm.value('castleMaxHp', BALANCE.castle.hp)));
  if (s.castleMaxHp > 0 && newMax !== s.castleMaxHp) {
    if (newMax > s.castleMaxHp) s.castleHp += newMax - s.castleMaxHp;
    else s.castleHp = Math.min(s.castleHp, newMax);
  }
  s.castleMaxHp = newMax;

  for (const slot of s.slots) if (slot.tower) computeTowerStats(s, slot.tower);
  s.dirty = false;
}
