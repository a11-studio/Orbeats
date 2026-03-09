import { massToSpeed, ARENA_HALF, massToRadius, SPLIT_SPEED_BONUS } from '@orbeats/shared';

// ── Tuning constants ──────────────────────────────────
/** Distance threshold: only hard-snap when error exceeds this (rare) */
export const SNAP_THRESHOLD = 18.0;
/** How fast correction blends toward (authoritative - predicted). Lower = smoother. */
const CORRECTION_SPEED = 3.5;

interface InputRecord {
  seq: number;
  dirX: number;
  dirZ: number;
  dt: number;
  hasSplitCells?: boolean;
}

/**
 * Local player prediction with hidden reconciliation.
 *
 * Architecture:
 *   - predicted (x, z) = local prediction from input only, NEVER overwritten by server
 *   - authoritative (authX, authZ) = server reconciled, stored separately
 *   - correction = gradual blend toward (authoritative - predicted)
 *   - visual (renderX, renderZ) = predicted + correction
 *
 * Mesh and label render from visual. Server updates correct hidden state only.
 */
export class Prediction {
  private pendingInputs: InputRecord[] = [];
  private seq: number = 0;

  /** Local prediction — driven by input only */
  x: number = 0;
  z: number = 0;
  mass: number = 10;

  /** Server authoritative (set on reconcile, not used for rendering) */
  private authX: number = 0;
  private authZ: number = 0;
  private hasAuth: boolean = false;

  /** Gradual correction toward (auth - predicted). Hidden layer. */
  private correctionX: number = 0;
  private correctionZ: number = 0;

  /** Debug: last reconcile error, whether snap occurred */
  lastReconcileErrDist: number = 0;
  lastReconcileWasSnap: boolean = false;

  /** Clear all prediction state. Called on new-game reset. */
  reset(): void {
    this.pendingInputs = [];
    this.seq = 0;
    this.x = 0;
    this.z = 0;
    this.mass = 10;
    this.authX = 0;
    this.authZ = 0;
    this.hasAuth = false;
    this.correctionX = 0;
    this.correctionZ = 0;
    this.lastReconcileErrDist = 0;
    this.lastReconcileWasSnap = false;
  }

  nextSeq(): number {
    return ++this.seq;
  }

  /** Record and apply input locally. Prediction is primary. */
  applyInput(dirX: number, dirZ: number, dt: number, mass: number, hasSplitCells: boolean = false): void {
    const seq = this.seq;
    this.pendingInputs.push({ seq, dirX, dirZ, dt, hasSplitCells });

    if (this.pendingInputs.length > 300) {
      this.pendingInputs = this.pendingInputs.slice(-200);
    }

    const speed = massToSpeed(mass) * (hasSplitCells ? SPLIT_SPEED_BONUS : 1);

    this.x += dirX * speed * dt;
    this.z += dirZ * speed * dt;

    const r = massToRadius(mass);
    const bound = ARENA_HALF - r;
    this.x = Math.max(-bound, Math.min(bound, this.x));
    this.z = Math.max(-bound, Math.min(bound, this.z));
  }

  /**
   * Blend correction toward (authoritative - predicted). Call every frame.
   */
  updateCorrection(dt: number): void {
    if (!this.hasAuth) return;

    const targetCorrectionX = this.authX - this.x;
    const targetCorrectionZ = this.authZ - this.z;

    const alpha = 1 - Math.exp(-CORRECTION_SPEED * dt);
    this.correctionX += (targetCorrectionX - this.correctionX) * alpha;
    this.correctionZ += (targetCorrectionZ - this.correctionZ) * alpha;
  }

  /**
   * Reconcile with server. Updates authoritative only. Does NOT drive the mesh.
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

    this.authX = reconciledX;
    this.authZ = reconciledZ;
    this.hasAuth = true;

    const errX = this.x - reconciledX;
    const errZ = this.z - reconciledZ;
    const errDist = Math.sqrt(errX * errX + errZ * errZ);
    this.lastReconcileErrDist = errDist;

    if (errDist > SNAP_THRESHOLD) {
      this.x = reconciledX;
      this.z = reconciledZ;
      this.correctionX = 0;
      this.correctionZ = 0;
      this.lastReconcileWasSnap = true;
    } else {
      this.lastReconcileWasSnap = false;
    }
  }

  /** Visual position — predicted + correction. This drives mesh, label, camera. */
  get renderX(): number {
    return this.x + this.correctionX;
  }

  get renderZ(): number {
    return this.z + this.correctionZ;
  }

  /** Debug: authoritative position */
  get authoritativeX(): number {
    return this.authX;
  }
  get authoritativeZ(): number {
    return this.authZ;
  }

  /** Debug: predicted position */
  get predictedX(): number {
    return this.x;
  }
  get predictedZ(): number {
    return this.z;
  }

  /** Debug: correction magnitude */
  get correctionMagnitude(): number {
    return Math.sqrt(this.correctionX * this.correctionX + this.correctionZ * this.correctionZ);
  }

  /** Debug: distance between visual and authoritative */
  get visualAuthDelta(): number {
    return Math.sqrt(
      (this.renderX - this.authX) ** 2 + (this.renderZ - this.authZ) ** 2,
    );
  }
}
