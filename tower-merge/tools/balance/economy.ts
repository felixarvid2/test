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
  const buyCost = (n: number): number => Math.round(E.buyBaseCost * Math.pow(E.buyGrowth, n));
  const slotCost = (k: number): number => Math.round(E.slotUnlockBase * Math.pow(E.slotUnlockGrowth, k));
  const merchant = EVENTS.find((e) => e.id === 'merchant')?.options[0].cost ?? 0;
  const chestCoins = EVENTS.find((e) => e.id === 'chest')?.options.find((o) => o.id === 'coins')?.effects?.[0];
  const coins = chestCoins && chestCoins.kind === 'instant' ? chestCoins.value : 0;
  const rows: (string | number)[][] = [];
  // typical greedy run: towers bought and slots unlocked by the time of the offer
  for (const [wave, bought, unlocked] of [[3, 5, 1], [6, 9, 2], [10, 14, 4], [15, 20, 6]]) {
    const l2 = buyCost(bought) * 2;
    rows.push([wave, buyCost(bought), coins, l2, `${merchant} (${Math.round((1 - merchant / l2) * 100)}% off)`, slotCost(unlocked)]);
  }
  parts.push(`Coin value of event rewards at typical points of a run (chest: coins / free L2 tower = two buys / free slot = next unlock price; merchant: L2 tower price)\n${
    table(['wave', 'buy cost', 'chest coins', 'free L2 tower', 'merchant L2', 'free slot'], rows)}`);
  const unlockRows: (string | number)[][] = [];
  for (let k = 0; k < 8; k++) unlockRows.push([k + 1, slotCost(k), Math.round(slotCost(k) / buyCost(k * 2 + 4) * 10) / 10]);
  parts.push(`Slot unlock prices (and as a multiple of the tower price at that point)\n${table(['unlock #', 'coins', 'x tower price'], unlockRows)}`);
  const invested: (string | number)[][] = [];
  for (let l = 1; l <= MAX_TOWER_LEVEL; l++) {
    invested.push([`L${l}`, grantedValue(l), Math.floor(grantedValue(l) * E.sellRefund), `${2 ** (l - 1)} L1 towers`]);
  }
  parts.push(`Granted towers: sell value\n${table(['level', 'worth', 'sells for', 'merge cost'], invested)}`);
  parts.push(`Tower buy weights: ${Object.values(TOWERS).map((t) => `${t.id} ${t.buyWeight}`).join(', ')}`);
  return parts.join('\n\n');
}
