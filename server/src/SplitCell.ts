import { ARENA_HALF, massToRadius, massToSpeed, SPLIT_IMPULSE, SPLIT_SPEED_BONUS } from '@orbeats/shared';
import type { EntityState } from '@orbeats/shared';

let splitCounter = 0;

/**
 * A split cell: an ejected half of a player.
 * It moves using the parent's input direction + a decaying impulse.
 * After SPLIT_MERGE_DELAY it merges back into the parent.
 */
export class SplitCell {
  id: string;
  parentId: string;
  x: number;
  z: number;
  mass: number;
  color: number;
  name: string;
  isBot: boolean;
  alive: boolean = true;

  /** Timestamp when this cell merges back into the parent */
  mergeAt: number;

  // Direction (copied from parent each tick)
  dirX: number = 0;
  dirZ: number = 0;

  // One-shot launch impulse (decays rapidly)
  private impulseX: number;
  private impulseZ: number;

  constructor(
    parentId: string,
    x: number,
    z: number,
    mass: number,
    color: number,
    name: string,
    isBot: boolean,
    launchDirX: number,
    launchDirZ: number,
    mergeAt: number,
  ) {
    this.id = `${parentId}_split_${splitCounter++}`;
    this.parentId = parentId;
    this.x = x;
    this.z = z;
    this.mass = mass;
    this.color = color;
    this.name = name;
    this.isBot = isBot;
    this.mergeAt = mergeAt;

    // Launch impulse in the player's movement direction
    this.impulseX = launchDirX * SPLIT_IMPULSE;
    this.impulseZ = launchDirZ * SPLIT_IMPULSE;
  }

  get radius(): number {
    return massToRadius(this.mass);
  }

  get speed(): number {
    return massToSpeed(this.mass) * SPLIT_SPEED_BONUS;
  }

  get score(): number {
    return 0; // score lives on the parent
  }

  update(dt: number): void {
    if (!this.alive) return;

    // Move: parent direction + decaying impulse
    this.x += (this.dirX * this.speed + this.impulseX) * dt;
    this.z += (this.dirZ * this.speed + this.impulseZ) * dt;

    // Decay impulse (~60fps-normalized exponential)
    const decay = Math.pow(0.90, dt * 60);
    this.impulseX *= decay;
    this.impulseZ *= decay;

    // Kill tiny residual impulse
    if (Math.abs(this.impulseX) < 0.05) this.impulseX = 0;
    if (Math.abs(this.impulseZ) < 0.05) this.impulseZ = 0;

    // Clamp to arena
    const bound = ARENA_HALF - this.radius;
    this.x = Math.max(-bound, Math.min(bound, this.x));
    this.z = Math.max(-bound, Math.min(bound, this.z));
  }

  addMass(amount: number): void {
    this.mass += amount;
  }

  die(): void {
    this.alive = false;
  }

  toState(): EntityState {
    return {
      id: this.id,
      x: this.x,
      z: this.z,
      mass: this.mass,
      score: 0,
      name: this.name,
      color: this.color,
      isBot: this.isBot,
      alive: this.alive,
      parentId: this.parentId,
    };
  }
}
