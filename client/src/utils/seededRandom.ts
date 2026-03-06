/**
 * Deterministic PRNG utilities for daily bot leaderboard.
 */

/** Hash a string to a 32-bit seed (djb2-like). */
export function hashStringToSeed(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0) & 0xffffffff;
}

/** Mulberry32 PRNG - returns a function that yields numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
