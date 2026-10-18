/** Euclidean length without Math.hypot (which boxes its result and is slow in hot loops). */
export function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}
