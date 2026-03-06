// ── Arena ──────────────────────────────────────────────
export const ARENA_SIZE = 800; // world units (square: -400..+400)
export const ARENA_HALF = ARENA_SIZE / 2;

// ── Pellets ────────────────────────────────────────────
export const PELLET_COUNT = 4000; // scaled for 800x800 (was 1000 for 400x400)
export const PELLET_MASS = 1;
export const PELLET_RADIUS = 0.35;
export const SPECIAL_PELLET_MASS = 10;
export const SPECIAL_PELLET_RADIUS = 0.7;
export const RARE_CANDY_MASS = 100;
export const RARE_CANDY_RADIUS = 1.0;

// ── Player / Entity ───────────────────────────────────
export const BASE_MASS = 10;
export const MIN_START_MASS = 10;
export const MAX_START_MASS = 30;
export const R_SCALE = 0.5; // legacy; radius now uses cbrt
export const BASE_SPEED = 60; // world units / second at base mass
export const EAT_RATIO = 1.15; // must be 15% larger to eat

// ── Respawn ────────────────────────────────────────────
export const RESPAWN_DELAY = 2000; // ms

// ── Session timer ─────────────────────────────────────
export const SESSION_SECONDS = 180; // 3 minutes per session

// ── Split mechanic ────────────────────────────────────
export const SPLIT_MIN_MASS = 20; // minimum mass per blob to split (each half >= 10)
export const SPLIT_MERGE_DELAY = 8000; // ms before halves CAN merge (overlap required)
export const SPLIT_COOLDOWN = 500; // ms between split actions (anti-spam)
export const SPLIT_IMPULSE = 100; // initial launch speed of the ejected half
export const SPLIT_SPEED_BONUS = 1.08; // split cells are 8% faster (smaller = more mobile)
export const MAX_PLAYER_CELLS = 8; // max blobs per player (1 main + 7 splits)
export const SIBLING_REPULSION = 2.0; // push-apart strength between same-player blobs
export const MERGE_OVERLAP_GRACE = 5000; // ms after merge cooldown → force-merge regardless

// ── Mass decay (prevents infinite growth) ─────────────────
export const MASS_DECAY_THRESHOLD = 2000; // decay only applies above this mass
export const MASS_DECAY_PER_1000 = 3; // at 2000 mass → 6 pts/s, at 5000 → 15 pts/s

// ── Server tick rates ─────────────────────────────────
export const SERVER_TICK_RATE = 20; // Hz simulation
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE;
export const BROADCAST_RATE = 15; // Hz snapshot broadcast
export const BROADCAST_INTERVAL_MS = 1000 / BROADCAST_RATE;

// ── Bots ──────────────────────────────────────────────
export const MIN_BOT_COUNT = 8; // always at least 8 AI opponents

// ── Derived helpers ───────────────────────────────────
const RADIUS_BASE = 2.0;
const MAX_RADIUS = 55;

export function massToRadius(mass: number): number {
  const r = RADIUS_BASE + Math.sqrt(mass) * 0.18;
  return Math.min(r, MAX_RADIUS);
}

export function massToSpeed(mass: number): number {
  const radius = massToRadius(mass);
  return BASE_SPEED / (1 + radius * 0.006);
}

/** Mass decay per second when above threshold. E.g. 2000 mass → 6 pts/s, 5000 → 15 pts/s */
export function getMassDecayPerSecond(mass: number): number {
  if (mass <= MASS_DECAY_THRESHOLD) return 0;
  return (mass / 1000) * MASS_DECAY_PER_1000;
}
