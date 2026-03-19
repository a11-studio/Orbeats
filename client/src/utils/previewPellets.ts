import type { PelletState } from '@orbeats/shared';
import { ARENA_HALF } from '@orbeats/shared';

/** Pellet colors matching server palette (Pellet.ts) */
const NORMAL_COLORS = [
  0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0x44ffff,
  0xff8844, 0x88ff44, 0x4488ff, 0xff4488, 0x88ff88, 0x8888ff,
  0x003cff, 0x5a00ff, 0xff5a00, 0xe6a800,
];
const SPECIAL_COLOR = 0x008687;
const RARE_COLOR = 0xff1493;

/** Deterministic seed for reproducible preview */
function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(0x0be405);

/** Generate placeholder pellets for the entry screen preview. No server required. */
export function generatePreviewPellets(): PelletState[] {
  const pellets: PelletState[] = [];
  const margin = 60;
  const min = -ARENA_HALF + margin;
  const max = ARENA_HALF - margin;

  // ~900 normal, ~80 special, ~20 rare — dense but performant
  let id = 0;
  for (let i = 0; i < 900; i++) {
    pellets.push({
      id: id++,
      x: min + rng() * (max - min),
      z: min + rng() * (max - min),
      color: NORMAL_COLORS[Math.floor(rng() * NORMAL_COLORS.length)],
      type: 'normal',
    });
  }
  for (let i = 0; i < 80; i++) {
    pellets.push({
      id: id++,
      x: min + rng() * (max - min),
      z: min + rng() * (max - min),
      color: SPECIAL_COLOR,
      type: 'special_10',
    });
  }
  for (let i = 0; i < 20; i++) {
    pellets.push({
      id: id++,
      x: min + rng() * (max - min),
      z: min + rng() * (max - min),
      color: RARE_COLOR,
      type: 'rare_100',
    });
  }

  return pellets;
}
