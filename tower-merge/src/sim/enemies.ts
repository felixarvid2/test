import { BALANCE } from '../data/balance';
import { BOSSES } from '../data/bosses';
import { ENEMIES } from '../data/enemies';
import type { BossId, EnemyId } from '../data/types';
import { FL } from './modifiers';
import { updateBoss, enterPhase } from './bosses';
import { explosion, hurt } from './combat';
import { tickStatuses } from './statuses';
import type { Enemy, SimState } from './state';
import { AIR_LANE, GROUND_LANE } from './path';

export interface SpawnOpts {
  progress?: number;
  hpMult?: number;
  speedMult?: number;
  coinMult?: number;
  elite?: boolean;
  summoned?: boolean;
  /** Boss loop index (0 = first appearance). */
  loop?: number;
}

const isBossId = (k: EnemyId | BossId): k is BossId => k in BOSSES;

/** Spawns an enemy or boss into the first free pool slot. Returns null when the enemy cap is reached. */
export function spawnEnemy(s: SimState, kind: EnemyId | BossId, o: SpawnOpts = {}): Enemy | null {
  if (s.alive >= BALANCE.caps.maxEnemies) return null;
  let e: Enemy | null = null;
  const pool = s.enemies;
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i].active) { e = pool[i]; break; }
  }
  if (!e) return null;
  const W = BALANCE.waves;
  const hpMult = o.hpMult ?? 1;
  const speedMult = o.speedMult ?? 1;
  const coinMult = o.coinMult ?? 1;
  const elite = !!o.elite;
  const boss = isBossId(kind);

  e.active = true;
  e.id = s.nextEnemyId++;
  e.kind = kind;
  e.isBoss = boss;
  e.elite = elite;
  e.summoned = !!o.summoned;
  e.bossLoop = o.loop ?? 0;
  e.shield = 0;
  e.slow = 0; e.slowTime = 0; e.frozenTime = 0; e.stunTime = 0;
  e.burnDps = 0; e.burnTime = 0; e.poisonStacks = 0; e.poisonTime = 0; e.poisonDps = 0;
  e.vulnerable = 0; e.vulnTime = 0; e.hasteTime = 0; e.hasteMult = 1;
  e.burnSrc = null; e.poisonSrc = null;
  e.freezeImmune = 0; e.stunImmune = 0; e.armorBonus = 0; e.armorBonusTime = 0;
  e.dotAcc = 0; e.dotEventTimer = 0; e.spreadTimer = 0;
  e.phase = 0; e.charging = false; e.hitFlash = 99;
  e.busyTime = 0; e.busyAb = null; e.busySlot = -1; e.chargeTime = 0; e.chargeMult = 1; e.spawnMilestone = 0;
  e.bossTimers.fill(0);
  e.seg = 0;
  e.progress = o.progress ?? 0;

  if (boss) {
    const def = BOSSES[kind];
    const loop = e.bossLoop;
    e.def = null;
    e.bossDef = def;
    e.flying = def.flying;
    e.radius = def.radius;
    e.maxHp = def.hp * Math.pow(BALANCE.boss.loopHpMult, loop) * hpMult;
    e.hp = e.maxHp;
    e.baseArmor = def.armor;
    e.armor = def.armor;
    e.baseSpeed = def.speed * speedMult;
    e.coinValue = def.coins * Math.pow(BALANCE.boss.loopCoinMult, loop) * coinMult;
    e.castleDamage = def.castleDamage * Math.pow(BALANCE.boss.loopDamageMult, loop);
    e.lateral = 0;
  } else {
    const def = ENEMIES[kind];
    e.def = def;
    e.bossDef = null;
    e.flying = def.flying;
    e.radius = def.radius;
    e.maxHp = def.hp * hpMult * (elite ? W.eliteHpMult : 1);
    e.hp = e.maxHp;
    e.baseArmor = def.armor;
    e.armor = def.armor;
    e.baseSpeed = def.speed * speedMult;
    e.coinValue = def.coins * (1 + BALANCE.coins.killScalePerWave * (s.wave - 1)) * coinMult * (elite ? W.eliteCoinMult : 1);
    e.castleDamage = def.castleDamage;
    const spread = def.flying ? 22 : 14;
    e.lateral = (s.rngW.next() * 2 - 1) * spread;
    e.abilityTimer = 0;
    for (const a of def.abilities) {
      if (a.kind === 'heal' || a.kind === 'summon') e.abilityTimer = a.interval * 0.7;
    }
  }
  e.lane = e.flying ? AIR_LANE : GROUND_LANE;
  e.lane.place(e);
  e.vel = 0;
  s.alive++;
  s.emit({ type: 'enemySpawned', enemyId: e.id, kind, x: e.x, y: e.y });
  if (boss) {
    const def = BOSSES[kind];
    s.emit({ type: 'bossSpawned', boss: def.id, name: def.name, title: def.title });
    enterPhase(s, e, 0);
  }
  // A freshly spawned enemy during the 'freezeStart' window starts frozen.
  if (s.freezeStartLeft > 0 && !boss) e.frozenTime = s.freezeStartLeft;
  return e;
}

/** Applies castle damage; at 0 HP the run enters 'defeated'. */
export function damageCastle(s: SimState, dmg: number): void {
  if (dmg <= 0 || s.phase === 'defeated' || s.phase === 'over') return;
  s.castleHp = Math.max(0, s.castleHp - dmg);
  s.flawless = false;
  s.emit({ type: 'castleHit', damage: dmg, hp: s.castleHp, maxHp: s.castleMaxHp });
  if (s.castleHp <= 0) {
    s.phase = 'defeated';
    s.emit({ type: 'phaseChanged', phase: 'defeated' });
  }
}

function leak(s: SimState, e: Enemy): void {
  damageCastle(s, e.castleDamage);
  const thorns = s.gm.flags[FL.thorns];
  if (thorns > 0 && e.active) {
    hurt(s, e, thorns, null, 1, NaN, NaN, false, false);
    explosion(s, e.x, e.y, BALANCE.combat.thornsRadius, thorns * BALANCE.combat.thornsSplash, null, 'physical', true, 1);
  }
  if (e.active) {
    e.active = false;
    s.alive--;
  }
}

/** Moves, heals, summons and ticks statuses for every enemy, then rebuilds the spatial grid. */
export function updateEnemies(s: SimState, dt: number): void {
  const pool = s.enemies;
  for (let i = 0; i < pool.length; i++) {
    const e = pool[i];
    if (!e.active) continue;
    if (!tickStatuses(s, e, dt)) continue;
    const paused = e.frozenTime > 0 || e.stunTime > 0;
    if (e.def && !paused && e.def.abilities.length > 0) runAbilities(s, e, dt);
    if (e.isBoss) {
      updateBoss(s, e, dt, paused);
      if (!e.active) continue;
    }
    let sp = e.baseSpeed;
    if (e.isBoss && e.bossDef) {
      sp *= e.bossDef.phases[e.phase].speedMult;
      if (e.chargeTime > 0) sp *= e.chargeMult;
    }
    if (e.slow > 0) sp *= 1 - e.slow;
    if (e.hasteTime > 0) sp *= e.hasteMult;
    if (paused || e.busyTime > 0) sp = 0;
    e.vel = sp;
    e.progress += sp * dt;
    if (e.progress >= e.lane.total) {
      e.progress = e.lane.total;
      e.lane.place(e);
      leak(s, e);
      continue;
    }
    e.lane.place(e);
  }
  s.grid.rebuild();
}

function runAbilities(s: SimState, e: Enemy, dt: number): void {
  const def = e.def!;
  e.abilityTimer -= dt;
  if (e.abilityTimer > 0) return;
  for (const a of def.abilities) {
    if (a.kind === 'heal') {
      e.abilityTimer = a.interval;
      const buf = s.borrow();
      const n = s.grid.query(e.x, e.y, a.radius, buf, buf.length);
      let shown = 0;
      for (let k = 0; k < n; k++) {
        const v = s.enemies[buf[k]];
        if (!v.active || v === e || v.hp >= v.maxHp) continue;
        const amount = Math.min(v.maxHp - v.hp, v.maxHp * a.amount);
        v.hp += amount;
        if (shown < BALANCE.combat.healTargetsMax) {
          shown++;
          s.emit({ type: 'enemyHealed', enemyId: v.id, x: v.x, y: v.y, amount });
        }
      }
      s.release();
    } else if (a.kind === 'summon') {
      e.abilityTimer = a.interval;
      const plan = s.plan;
      for (let k = 0; k < a.count; k++) {
        spawnEnemy(s, a.enemy, {
          progress: Math.max(0, e.progress - 22 - k * 14),
          hpMult: plan ? plan.hpMult : 1,
          speedMult: plan ? plan.speedMult : 1,
          coinMult: 0.5,
          summoned: true,
        });
      }
    }
  }
}
