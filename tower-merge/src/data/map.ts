/**
 * Board layout in world pixels (720 x 1280 portrait). The HUD sits above BOARD.top and the
 * shop/ability bar below BOARD.bottom. Ground enemies walk PATH; flyers take FLY_LANE.
 */

export const WORLD_W = 720;
export const WORLD_H = 1280;

export const BOARD = { top: 110, bottom: 1010 } as const;

export interface Point {
  x: number;
  y: number;
}

/** Ground path waypoints, spawn first, castle gate last. */
export const PATH: readonly Point[] = [
  { x: 110, y: 70 },
  { x: 110, y: 300 },
  { x: 610, y: 300 },
  { x: 610, y: 520 },
  { x: 110, y: 520 },
  { x: 110, y: 740 },
  { x: 610, y: 740 },
  { x: 610, y: 890 },
  { x: 360, y: 890 },
  { x: 360, y: 935 },
];

/** Flying enemies cross the board diagonally from the top-right to the castle. */
export const FLY_LANE: readonly Point[] = [
  { x: 640, y: 70 },
  { x: 360, y: 935 },
];

export const PATH_WIDTH = 72;

/** Castle centre; the gate is the last PATH point. */
export const CASTLE = { x: 360, y: 965, width: 190, height: 120 } as const;

export interface SlotDef {
  id: number;
  x: number;
  y: number;
  /** Slot ids considered adjacent (for adjacencyBonus). */
  neighbours: number[];
}

export const SLOT_SIZE = 104;

/**
 * Twelve tower slots between the path rows. The first `startingSlots` ids in UNLOCK_ORDER are
 * open at run start; the rest are bought during the run.
 */
export const SLOTS: readonly SlotDef[] = [
  { id: 0, x: 215, y: 190, neighbours: [1, 4] },
  { id: 1, x: 327, y: 190, neighbours: [0, 2, 4, 5] },
  { id: 2, x: 439, y: 190, neighbours: [1, 3, 5, 6] },
  { id: 3, x: 551, y: 190, neighbours: [2, 6] },
  { id: 4, x: 230, y: 410, neighbours: [0, 1, 5, 7] },
  { id: 5, x: 360, y: 410, neighbours: [1, 2, 4, 6, 8] },
  { id: 6, x: 490, y: 410, neighbours: [2, 3, 5, 9] },
  { id: 7, x: 230, y: 630, neighbours: [4, 8, 10] },
  { id: 8, x: 360, y: 630, neighbours: [5, 7, 9, 11] },
  { id: 9, x: 490, y: 630, neighbours: [6, 8] },
  { id: 10, x: 155, y: 845, neighbours: [7, 11] },
  { id: 11, x: 270, y: 845, neighbours: [7, 8, 10] },
];

/** Order in which slots open: starting slots first (centre of the board), then outward. */
export const UNLOCK_ORDER: readonly number[] = [5, 8, 4, 6, 7, 9, 1, 2, 0, 3, 10, 11];
