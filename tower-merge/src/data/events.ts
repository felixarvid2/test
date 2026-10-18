import type { RandomEventDef } from './types';

/**
 * Random events between waves. The last option of every event is the free decline/skip.
 * The chest lists 6 candidate rewards plus the free "Leave it" option: the sim rolls 3 of the
 * candidates (every option except the last) and always appends the last one.
 */
export const EVENTS: RandomEventDef[] = [
  {
    id: 'treasure', name: 'Treasure Trail', icon: 'treasure', weight: 3, minWave: 2,
    description: 'Gold glitters along the road. Enemies in the next wave carry extra coins.',
    options: [
      {
        id: 'raid', label: 'Follow the trail', description: 'Next wave: enemies drop 75% more coins.',
        waveModifier: { coinMult: 1.75 },
      },
      {
        id: 'greedy', label: 'Lure them in', description: 'Next wave: coins x2.5, but 20% more enemies.',
        waveModifier: { coinMult: 2.5, enemyCountMult: 1.2 },
      },
      { id: 'decline', label: 'Ignore it', description: 'Nothing changes.' },
    ],
  },
  {
    id: 'elite', name: 'Elite Vanguard', icon: 'elite', weight: 2, minWave: 4,
    description: 'Champions march with the next wave. Stronger foes, better loot.',
    options: [
      {
        id: 'accept', label: 'Take the challenge', description: 'Next wave: 30% of enemies are elite, coins x2.',
        waveModifier: { eliteChance: 0.3, coinMult: 2 },
      },
      {
        id: 'hunt', label: 'Hunt the champions', description: 'Next wave: 50% elite enemies with +10% HP, coins x3.',
        waveModifier: { eliteChance: 0.5, enemyHpMult: 1.1, coinMult: 3 },
      },
      { id: 'decline', label: 'Decline', description: 'The next wave is unchanged.' },
    ],
  },
  {
    id: 'merchant', name: 'Wandering Merchant', icon: 'merchant', weight: 2, minWave: 3,
    description: 'A merchant offers wares for coins.',
    options: [
      {
        id: 'buyTower', label: 'Buy a tower', description: 'A random Level 2 tower for 90 coins.', cost: 90,
        effects: [{ kind: 'instant', action: 'grantTower', value: 2 }],
      },
      { id: 'buyUpgrade', label: 'Buy a rare upgrade', description: 'A random upgrade of rare rarity or better for 140 coins.', cost: 140, upgradeRarity: 'rare' },
      {
        id: 'repair', label: 'Repair the castle', description: 'Heal 50% of castle max HP for 70 coins.', cost: 70,
        effects: [{ kind: 'instant', action: 'healCastle', value: 0.5 }],
      },
      { id: 'leave', label: 'Leave', description: 'Walk on without buying.' },
    ],
  },
  {
    id: 'chest', name: 'Mysterious Chest', icon: 'chest', weight: 2, minWave: 2,
    description: 'A chest rests beside the road. Choose one of the rewards inside.',
    options: [
      {
        id: 'coins', label: 'Pile of gold', description: 'Gain 180 coins.',
        effects: [{ kind: 'instant', action: 'grantCoins', value: 180 }],
      },
      {
        id: 'tower', label: 'Hidden tower', description: 'Gain a free Level 2 tower.',
        effects: [{ kind: 'instant', action: 'grantTower', value: 2 }],
      },
      {
        id: 'heal', label: 'Healing draught', description: 'Heal 60% of castle max HP.',
        effects: [{ kind: 'instant', action: 'healCastle', value: 0.6 }],
      },
      { id: 'rareUpgrade', label: 'Rare relic', description: 'Gain a random upgrade of rare rarity or better.', upgradeRarity: 'rare' },
      { id: 'epicUpgrade', label: 'Epic relic', description: 'Gain a random upgrade of epic rarity or better.', upgradeRarity: 'epic' },
      {
        id: 'slot', label: 'Builder\'s tools', description: 'Unlock 1 tower slot for free.',
        effects: [{ kind: 'instant', action: 'unlockSlot', value: 1 }],
      },
      { id: 'leave', label: 'Leave it', description: 'Close the lid and move on.' },
    ],
  },
  {
    id: 'cursed', name: 'Cursed Altar', icon: 'curse', weight: 1.5, minWave: 6,
    description: 'A dark altar offers power at a price: the next wave grows deadlier.',
    options: [
      {
        id: 'accept', label: 'Accept the curse',
        description: 'Next wave: enemies +30% HP and +15% speed, coins x2. Gain an epic upgrade.',
        waveModifier: { enemyHpMult: 1.3, enemySpeedMult: 1.15, coinMult: 2 }, upgradeRarity: 'epic',
      },
      {
        id: 'greater', label: 'Embrace the dark',
        description: 'Next wave: enemies +60% HP and +25% speed, coins x3. Gain an epic upgrade.',
        waveModifier: { enemyHpMult: 1.6, enemySpeedMult: 1.25, coinMult: 3 }, upgradeRarity: 'epic',
      },
      { id: 'decline', label: 'Walk away', description: 'Nothing happens.' },
    ],
  },
];
