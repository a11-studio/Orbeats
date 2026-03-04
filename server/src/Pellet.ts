import {
  ARENA_HALF,
  PELLET_COUNT,
  PELLET_MASS,
  PELLET_RADIUS,
  SPECIAL_PELLET_MASS,
  SPECIAL_PELLET_RADIUS,
  RARE_CANDY_MASS,
  RARE_CANDY_RADIUS,
} from '@orbeats/shared';
import type { PelletState } from '@orbeats/shared';

const PELLET_COLORS = [
  0x003cff, 0x5a00ff, 0xff5a00, 0xe6a800,
];
const SPECIAL_10_COLOR = 0x008687; // teal
const RARE_100_COLOR = 0xff1493; // hot pink

let nextId = 0;

export type PelletType = 'normal' | 'special_10' | 'rare_100';

export class Pellet {
  id: number;
  x: number;
  z: number;
  color: number;
  type: PelletType;

  constructor(type: PelletType = 'normal') {
    this.id = nextId++;
    const margin = 2;
    this.x = (Math.random() - 0.5) * (ARENA_HALF * 2 - margin * 2);
    this.z = (Math.random() - 0.5) * (ARENA_HALF * 2 - margin * 2);
    this.type = type;
    this.color =
      type === 'special_10' ? SPECIAL_10_COLOR
      : type === 'rare_100' ? RARE_100_COLOR
      : PELLET_COLORS[Math.floor(Math.random() * PELLET_COLORS.length)];
  }

  get mass(): number {
    if (this.type === 'rare_100') return RARE_CANDY_MASS;
    if (this.type === 'special_10') return SPECIAL_PELLET_MASS;
    return PELLET_MASS;
  }

  get radius(): number {
    if (this.type === 'rare_100') return RARE_CANDY_RADIUS;
    if (this.type === 'special_10') return SPECIAL_PELLET_RADIUS;
    return PELLET_RADIUS;
  }

  toState(): PelletState {
    return {
      id: this.id,
      x: this.x,
      z: this.z,
      color: this.color,
      type: this.type,
    };
  }
}

// ── Event tracking ────────────────────────────────────
export interface PelletEvents {
  eaten: Map<string, number[]>; // eaterId → [pelletIds]
  spawned: PelletState[];
}

/**
 * Server-authoritative pellet manager using a stable Map<id, Pellet>.
 * Tracks eaten/spawned events per tick for broadcasting to clients.
 */
export class PelletManager {
  /** The single source of truth: every live pellet by ID */
  private pellets: Map<number, Pellet> = new Map();

  // Per-tick event accumulators (flushed after broadcast)
  private eatenThisTick: Map<string, number[]> = new Map();
  private spawnedThisTick: PelletState[] = [];

  constructor() {
    this.spawnInitial();
  }

  private spawnInitial(): void {
    for (let i = 0; i < PELLET_COUNT; i++) {
      const p = new Pellet('normal');
      this.pellets.set(p.id, p);
    }
    this.spawnSpecialBatch(true);
    for (let i = 0; i < 5; i++) this.spawnRareCandies(true, true);
  }

  private countByType(type: PelletType): number {
    let n = 0;
    for (const p of this.pellets.values()) if (p.type === type) n++;
    return n;
  }

  private spawnSpecialBatch(skipEvents: boolean = false): void {
    const count = 5 + Math.floor(Math.random() * 6); // 5–10
    for (let i = 0; i < count; i++) {
      const p = new Pellet('special_10');
      this.pellets.set(p.id, p);
      if (!skipEvents) this.spawnedThisTick.push(p.toState());
    }
  }

  private spawnRareCandies(skipEvents: boolean = false, forceOne: boolean = false): void {
    if (this.countByType('rare_100') >= 20) return;
    if (!forceOne && Math.random() >= 0.08) return;
    const p = new Pellet('rare_100');
    this.pellets.set(p.id, p);
    if (!skipEvents) this.spawnedThisTick.push(p.toState());
  }

  /** Server removes a pellet when a collision is detected. Tracks the event. */
  eatPellet(pelletId: number, eaterId: string): boolean {
    const pellet = this.pellets.get(pelletId);
    if (!pellet) return false;

    this.pellets.delete(pelletId);

    let ids = this.eatenThisTick.get(eaterId);
    if (!ids) {
      ids = [];
      this.eatenThisTick.set(eaterId, ids);
    }
    ids.push(pelletId);

    return true;
  }

  /** Spawn new pellets to maintain constant count. Tracks spawned events. */
  replenish(): void {
    while (this.pellets.size < PELLET_COUNT) {
      const p = new Pellet('normal');
      this.pellets.set(p.id, p);
      this.spawnedThisTick.push(p.toState());
    }
    if (Math.random() < 0.03 && this.pellets.size < PELLET_COUNT + 80) this.spawnSpecialBatch();
    if (this.countByType('rare_100') < 20 && Math.random() < 0.02) this.spawnRareCandies();
  }

  /** Get pending events and clear accumulators. Call after broadcasting. */
  flushEvents(): PelletEvents {
    const events: PelletEvents = {
      eaten: new Map(this.eatenThisTick),
      spawned: [...this.spawnedThisTick],
    };
    this.eatenThisTick.clear();
    this.spawnedThisTick = [];
    return events;
  }

  hasEvents(): boolean {
    return this.eatenThisTick.size > 0 || this.spawnedThisTick.length > 0;
  }

  /** Destroy all pellets and spawn a fresh set. Used for new-game reset. */
  resetAll(): void {
    this.pellets.clear();
    this.eatenThisTick.clear();
    this.spawnedThisTick = [];
    this.spawnInitial();
  }

  get(id: number): Pellet | undefined {
    return this.pellets.get(id);
  }

  /** Safe snapshot: returns a NEW array of all live pellets (safe to iterate while map mutates) */
  getAllArray(): Pellet[] {
    return [...this.pellets.values()];
  }

  /** Full state array for sync messages */
  toStateArray(): PelletState[] {
    return [...this.pellets.values()].map((p) => p.toState());
  }

  get size(): number {
    return this.pellets.size;
  }

  static readonly MASS = PELLET_MASS;
  static readonly RADIUS = PELLET_RADIUS;
}
