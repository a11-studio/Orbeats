import {
  BASE_MASS,
  MIN_START_MASS,
  MAX_START_MASS,
  ARENA_HALF,
  massToRadius,
  massToSpeed,
  SPLIT_COOLDOWN,
} from '@orbeats/shared';
import type { Vec2, EntityState } from '@orbeats/shared';

const CANDY_COLORS = [
  0xff3333, 0x33cc55, 0x3388ff, 0xff9900, 0xcc33ff,
  0xffdd00, 0x00cccc, 0xff6699, 0x66ff33, 0xff4466,
];

let colorIndex = 0;

export class Player {
  id: string;
  name: string;
  x: number;
  z: number;
  mass: number;
  color: number;
  isBot: boolean;
  alive: boolean;

  // Input
  dirX: number = 0;
  dirZ: number = 0;
  lastSeq: number = 0;

  // Players are never split cells (split cells are SplitCell instances)
  parentId: string | null = null;

  // Split cooldown
  splitCooldownEnd: number = 0;

  constructor(id: string, name: string, isBot: boolean = false, initialMass?: number) {
    this.id = id;
    this.name = name;
    this.isBot = isBot;
    this.mass = initialMass ?? BASE_MASS;
    this.color = isBot ? CANDY_COLORS[colorIndex++ % CANDY_COLORS.length] : 0xff3333;
    this.alive = true;

    const pos = Player.randomSpawnPos();
    this.x = pos.x;
    this.z = pos.z;
  }

  get radius(): number {
    return massToRadius(this.mass);
  }

  get speed(): number {
    return massToSpeed(this.mass);
  }

  static randomSpawnPos(): Vec2 {
    const margin = 10;
    return {
      x: (Math.random() - 0.5) * (ARENA_HALF * 2 - margin * 2),
      z: (Math.random() - 0.5) * (ARENA_HALF * 2 - margin * 2),
    };
  }

  setInput(dir: Vec2, seq: number): void {
    // Anti-cheat: clamp direction magnitude to 1
    const mag = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
    if (mag > 1.001) {
      this.dirX = dir.x / mag;
      this.dirZ = dir.z / mag;
    } else {
      this.dirX = dir.x;
      this.dirZ = dir.z;
    }
    this.lastSeq = seq;
  }

  /** Cooldown-only check. Per-blob mass check is done in World.splitAllBlobs(). */
  canSplit(now: number): boolean {
    return this.alive && now >= this.splitCooldownEnd;
  }

  setSplitCooldown(now: number): void {
    this.splitCooldownEnd = now + SPLIT_COOLDOWN;
  }

  update(dt: number, _now: number): void {
    if (!this.alive) return;

    // Move
    this.x += this.dirX * this.speed * dt;
    this.z += this.dirZ * this.speed * dt;

    // Clamp to arena bounds
    const bound = ARENA_HALF - this.radius;
    if (this.x > bound) this.x = bound;
    if (this.x < -bound) this.x = -bound;
    if (this.z > bound) this.z = bound;
    if (this.z < -bound) this.z = -bound;
  }

  addMass(amount: number): void {
    this.mass += amount;
  }

  die(): void {
    this.alive = false;
  }

  respawn(): void {
    const pos = Player.randomSpawnPos();
    this.x = pos.x;
    this.z = pos.z;
    this.mass = BASE_MASS;
    this.alive = true;
    this.dirX = 0;
    this.dirZ = 0;
  }

  /** Full reset for new-game: random position, random mass in [MIN..MAX], clear cooldowns */
  resetForNewGame(): void {
    const pos = Player.randomSpawnPos();
    this.x = pos.x;
    this.z = pos.z;
    this.mass = MIN_START_MASS + Math.random() * (MAX_START_MASS - MIN_START_MASS);
    this.alive = true;
    this.dirX = 0;
    this.dirZ = 0;
    this.splitCooldownEnd = 0;
  }

  toState(): EntityState {
    return {
      id: this.id,
      x: this.x,
      z: this.z,
      mass: this.mass,
      score: this.mass, // score = current mass (derived, not cached)
      name: this.name,
      color: this.color,
      isBot: this.isBot,
      alive: this.alive,
      parentId: null,
    };
  }
}
