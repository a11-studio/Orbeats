import { EAT_RATIO } from '@agar3d/shared';
import type { EntityState } from '@agar3d/shared';
import type { Pellet } from './Pellet.js';

/** Anything that participates in collisions and can be serialized */
export interface Collidable {
  id: string;
  x: number;
  z: number;
  mass: number;
  alive: boolean;
  readonly radius: number;
  /** Non-null if this is a split cell */
  parentId?: string | null;
  addMass(amount: number): void;
  die(): void;
  toState(): EntityState;
}

/** Distance between two positions (2D, on xz plane) */
function dist(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Check if an entity can eat a pellet.
 */
export function checkPelletCollision(entity: Collidable, pellet: Pellet): boolean {
  if (!entity.alive) return false;
  const d = dist(entity.x, entity.z, pellet.x, pellet.z);
  return d < entity.radius + pellet.radius;
}

/**
 * Check if entity A can eat entity B.
 * A can eat B if A.mass >= B.mass * EAT_RATIO and spheres overlap.
 * Entities that share the same parent (or one IS the parent of the other) cannot eat each other.
 */
export function checkPlayerEat(a: Collidable, b: Collidable): boolean {
  if (!a.alive || !b.alive) return false;
  if (a.id === b.id) return false;

  // Siblings or parent/child cannot eat each other
  const aParent = a.parentId ?? a.id;
  const bParent = b.parentId ?? b.id;
  if (aParent === bParent) return false;
  if (a.id === b.parentId || b.id === a.parentId) return false;

  if (a.mass < b.mass * EAT_RATIO) return false;
  const d = dist(a.x, a.z, b.x, b.z);
  return d < a.radius;
}
