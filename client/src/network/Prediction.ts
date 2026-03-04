import { massToSpeed, ARENA_HALF, massToRadius, SPLIT_SPEED_BONUS } from '@orbeats/shared';

// ── Tuning constants (tweak these) ──────────────────────
/** Distance threshold: if reconciliation error exceeds this, hard-snap */
export const SNAP_THRESHOLD = 12.0;
/** How fast the visual error decays per second (higher = snappier) */
export const INTERPOLATION_SPEED = 8.0;

interface InputRecord {
  seq: number;
  dirX: number;
  dirZ: number;
  dt: number;
  hasSplitCells?: boolean;
}

/**
 * Client-side prediction with smooth reconciliation.
 *
 * Architecture:
 *   - Internal (x, z) = authoritative reconciled position (physics-correct)
 *   - Visual offset (errorX, errorZ) = smoothly decaying visual difference
 *   - renderX / renderZ = what the camera and mesh actually use
 */
export class Prediction {
  private pendingInputs: InputRecord[] = [];
  private seq: number = 0;

  // Authoritative predicted position
  x: number = 0;
  z: number = 0;
  mass: number = 10;

  // Visual smoothing offset
  private errorX: number = 0;
  private errorZ: number = 0;

  /** Clear all prediction state. Called on new-game reset. */
  reset(): void {
    this.pendingInputs = [];
    this.seq = 0;
    this.x = 0;
    this.z = 0;
    this.mass = 10;
    this.errorX = 0;
    this.errorZ = 0;
  }

  nextSeq(): number {
    return ++this.seq;
  }

  /** Record and apply an input locally (called every frame) */
  applyInput(dirX: number, dirZ: number, dt: number, mass: number, hasSplitCells: boolean = false): void {
    const seq = this.seq;
    this.pendingInputs.push({ seq, dirX, dirZ, dt, hasSplitCells });

    if (this.pendingInputs.length > 300) {
      this.pendingInputs = this.pendingInputs.slice(-200);
    }

    const speed = massToSpeed(mass) * (hasSplitCells ? SPLIT_SPEED_BONUS : 1);

    this.x += dirX * speed * dt;
    this.z += dirZ * speed * dt;

    // Clamp to arena
    const r = massToRadius(mass);
    const bound = ARENA_HALF - r;
    this.x = Math.max(-bound, Math.min(bound, this.x));
    this.z = Math.max(-bound, Math.min(bound, this.z));

    // Decay visual error offset
    const decay = 1 - Math.exp(-INTERPOLATION_SPEED * dt);
    this.errorX *= (1 - decay);
    this.errorZ *= (1 - decay);
  }

  /**
   * Reconcile with server state. Called ONLY when a NEW snapshot arrives.
   */
  reconcile(
    serverX: number,
    serverZ: number,
    serverMass: number,
    ackSeq: number,
    hasSplitCells: boolean = false,
  ): void {
    this.pendingInputs = this.pendingInputs.filter((input) => input.seq > ackSeq);

    this.mass = serverMass;

    // Replay unacknowledged inputs from server position
    let reconciledX = serverX;
    let reconciledZ = serverZ;

    for (const input of this.pendingInputs) {
      const splitBonus = (input.hasSplitCells ?? hasSplitCells) ? SPLIT_SPEED_BONUS : 1;
      const speed = massToSpeed(this.mass) * splitBonus;

      reconciledX += input.dirX * speed * input.dt;
      reconciledZ += input.dirZ * speed * input.dt;

      const r = massToRadius(this.mass);
      const bound = ARENA_HALF - r;
      reconciledX = Math.max(-bound, Math.min(bound, reconciledX));
      reconciledZ = Math.max(-bound, Math.min(bound, reconciledZ));
    }

    // Measure error
    const errX = this.x - reconciledX;
    const errZ = this.z - reconciledZ;
    const errDist = Math.sqrt(errX * errX + errZ * errZ);

    if (errDist > SNAP_THRESHOLD) {
      this.x = reconciledX;
      this.z = reconciledZ;
      this.errorX = 0;
      this.errorZ = 0;
    } else if (errDist > 0.01) {
      this.errorX += errX;
      this.errorZ += errZ;
      this.x = reconciledX;
      this.z = reconciledZ;
    }
  }

  /** Visual X position */
  get renderX(): number {
    return this.x + this.errorX;
  }

  /** Visual Z position */
  get renderZ(): number {
    return this.z + this.errorZ;
  }
}
