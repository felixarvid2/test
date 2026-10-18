/** Economy audit: buy/sell loops, granted-tower sell values, event and merchant value, price curves. */
import { BALANCE } from '../../src/data/balance';
import { EVENTS } from '../../src/data/events';
import { TOWERS } from '../../src/data/towers';
import { MAX_TOWER_LEVEL } from '../../src/data/types';
import { defaultRunOptions } from '../../src/sim/bot';
import { createWorld } from '../../src/sim/World';
import { grantedValue } from '../../src/sim/board';
import { fmt, table } from './stats';

export interface LoopResult {
  /** Coins gained (negative = lost) by one buy + sell cycle, averaged. */
  buySell: number;
  /** Coins gained by buying two towers, merging them and selling the result. */
  buyMergeSell: number;
  /** Sell value of a granted level-2 tower (free from an event or upgrade). */
  grantedL2Sell: number;
  /** Sell value of the starting arrow tower. */
  startArrowSell: number;
}

/** Plays the loops on a real world so refunds, price growth and board rules are all included. */
export function loopTests(): LoopResult {
  const mk = () => createWorld(defaultRunOptions(5, {
    towerPool: ['arrow'], startCoinsBonus: 100000, startingSlots: 12,
  }), { upgrades: [], synergies: [], events: [] });
  const w = mk();
  const startArrowSell = w.sellValue(5);
  w.sellTower(5);
  const c0 = w.coins;
  let n = 0;
  for (let i = 0; i < 40; i++) {
    const b = w.buyTower();
    if (!b.ok) break;
    w.sellTower(b.slot as number);
    n++;
  }
  const buySell = (w.coins - c0) / n;

  const w2 = mk();
  w2.sellTower(5);
  const c1 = w2.coins;
  let m = 0;
  for (let i = 0; i < 20; i++) {
    const a = w2.buyTower();
    const b = w2.buyTower();
    if (!a.ok || !b.ok) break;
    if (w2.moveTower(a.slot as number, b.slot as number) !== 'merged') break;
    w2.sellTower(b.slot as number);
    m++;
  }
  const buyMergeSell = (w2.coins - c1) / m;

  const w3 = mk();
  w3.sellTower(5);
  w3.grantTower('arrow', 2);
  const grantedL2Sell = w3.sellValue(5);
  return { buySell, buyMergeSell, grantedL2Sell, startArrowSell };
}

export function economyReport(): string {
  const E = BALANCE.economy;
  const loops = loopTests();
  const parts: string[] = [];
  parts.push(table(['check', 'result'], [
    ['buy + sell, coins per cycle', fmt(loops.buySell, 1)],
    ['buy 2 + merge + sell, coins per cycle', fmt(loops.buyMergeSell, 1)],
    ['sell value of the free L2 tower (event / upgrade)', loops.grantedL2Sell],
    ['sell value of the starting arrow tower', loops.startArrowSell],
    ['sellRefund', E.sellRefund],
  ]));
  const rows: (string | number)[][] = [];
  for (const n of [0, 5, 10, 15, 20, 30]) {
    const buy = Math.round(E.buyBaseCost * Math.pow(E.buyGrowth, n));
    const merchant = (EVENTS.find((e) => e.id === 'merchant')?.options[0].cost) ?? 0;
    rows.push([n, buy, buy * 2, merchant, `${Math.round((1 - merchant / (buy * 2)) * 100)}%`, Math.round(E.slotUnlockBase * Math.pow(E.slotUnlockGrowth, Math.min(n, 8)))]);
  }
  parts.push(`Prices by number of towers bought so far (buy cost; two L1 = one L2; merchant L2 offer; discount; next slot unlock if n unlocks)\n${
    table(['bought', 'buy cost', 'cost of L2', 'merchant L2', 'merchant discount', 'slot unlock'], rows)}`);
  const invested: (string | number)[][] = [];
  for (let l = 1; l <= MAX_TOWER_LEVEL; l++) {
    invested.push([`L${l}`, grantedValue(l), Math.floor(grantedValue(l) * E.sellRefund), `${2 ** (l - 1)} L1 towers`]);
  }
  parts.push(`Granted towers: sell value\n${table(['level', 'worth', 'sells for', 'merge cost'], invested)}`);
  parts.push(`Tower buy weights: ${Object.values(TOWERS).map((t) => `${t.id} ${t.buyWeight}`).join(', ')}`);
  return parts.join('\n\n');
}
