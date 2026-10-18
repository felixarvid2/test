// Geometry of the single-screen room (world is 720 x 1280, one tile = 48 px).
export const PLAY = { left: 48, right: 672, top: 192, bottom: 1200 } as const;
export const CENTER_X = 360;
export const ENTRY = { x: 360, y: 1236 } as const;      // bottom door the hero walks in from
export const START_Y = 1100;                              // where the hero stands when a room starts
export const DOOR_ROW_Y = 168;                            // centre of the door tiles in the top wall
export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest signed angle from a to b. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
}

/** Cheap deterministic hash in [0, 1). */
export function hash2(a: number, b: number, c = 0): number {
  let h = (Math.imul(a + 374761393, 668265263) ^ Math.imul(b + 1274126177, 2246822519) ^ Math.imul(c + 97, 3266489917)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
