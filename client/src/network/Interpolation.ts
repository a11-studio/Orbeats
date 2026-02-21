import type { EntityState, LeaderboardEntry } from '@agar3d/shared';
import type { SnapshotMsg } from '@agar3d/shared';

interface BufferedSnapshot {
  time: number;
  entities: EntityState[];
  leaderboard: LeaderboardEntry[];
  tick: number;
  seq: number;
}

/**
 * Buffers server snapshots and provides:
 *   - Interpolated positions for REMOTE entities (smooth rendering)
 *   - Raw latest authoritative state for LOCAL player (reconciliation)
 *
 * NOTE: Pellets are no longer handled here. They are managed by PelletStore
 * via dedicated server events (PelletEaten, PelletSpawned, PelletSync).
 */
export class Interpolation {
  private buffer: BufferedSnapshot[] = [];
  private readonly BUFFER_MS = 100;

  // ── Interpolated state for remote entities ─────────
  entities: EntityState[] = [];

  // ── Latest raw state for local player reconciliation ─
  latestEntities: EntityState[] = [];
  latestSeq: number = 0;

  // ── Leaderboard from latest snapshot ───────────────
  leaderboard: LeaderboardEntry[] = [];

  // ── New-snapshot flag ──────────────────────────────
  private _hasNewSnapshot: boolean = false;

  /** Clear all buffered state. Called on new-game reset. */
  reset(): void {
    this.buffer = [];
    this.entities = [];
    this.latestEntities = [];
    this.latestSeq = 0;
    this.leaderboard = [];
    this._hasNewSnapshot = false;
  }

  /** Returns true once per new snapshot, then resets. */
  consumeNewSnapshot(): boolean {
    if (this._hasNewSnapshot) {
      this._hasNewSnapshot = false;
      return true;
    }
    return false;
  }

  pushSnapshot(msg: SnapshotMsg): void {
    const now = Date.now();

    this.buffer.push({
      time: now,
      entities: msg.entities,
      leaderboard: msg.leaderboard,
      tick: msg.tick,
      seq: msg.seq,
    });

    // Keep only last 10 snapshots
    if (this.buffer.length > 10) {
      this.buffer.shift();
    }

    // Update latest raw state (for local player reconciliation)
    this.latestEntities = msg.entities;
    this.latestSeq = msg.seq;
    this.leaderboard = msg.leaderboard;

    this._hasNewSnapshot = true;
  }

  /** Build a Map<id, EntityState> for O(1) lookups during interpolation. */
  private static buildEntityMap(entities: EntityState[]): Map<string, EntityState> {
    const map = new Map<string, EntityState>();
    for (const e of entities) {
      map.set(e.id, e);
    }
    return map;
  }

  /**
   * Interpolate between two entity arrays using a pre-built Map for the
   * "previous" snapshot. O(n) instead of O(n²).
   */
  private static lerpEntities(
    prevMap: Map<string, EntityState>,
    next: EntityState[],
    t: number,
    clampMass: boolean,
  ): EntityState[] {
    return next.map((nextE) => {
      const prevE = prevMap.get(nextE.id);
      if (!prevE) return nextE; // new entity — no prev data to lerp from

      const mt = clampMass ? Math.min(t, 1) : t;
      return {
        ...nextE,
        x: prevE.x + (nextE.x - prevE.x) * t,
        z: prevE.z + (nextE.z - prevE.z) * t,
        mass: prevE.mass + (nextE.mass - prevE.mass) * mt,
      };
    });
  }

  /** Interpolate REMOTE entities for smooth rendering. Called every frame. */
  update(): void {
    const renderTime = Date.now() - this.BUFFER_MS;

    if (this.buffer.length < 2) {
      if (this.buffer.length === 1) {
        this.entities = this.buffer[0].entities;
      }
      return;
    }

    // Find the two snapshots bracketing renderTime
    let prev: BufferedSnapshot | null = null;
    let next: BufferedSnapshot | null = null;

    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i].time <= renderTime && this.buffer[i + 1].time >= renderTime) {
        prev = this.buffer[i];
        next = this.buffer[i + 1];
        break;
      }
    }

    if (!prev || !next) {
      // renderTime is past all snapshots → extrapolation zone (capped at 1.5×).
      prev = this.buffer[this.buffer.length - 2];
      next = this.buffer[this.buffer.length - 1];
      const range = next.time - prev.time;
      const t = range > 0 ? Math.min((renderTime - prev.time) / range, 1.5) : 1;

      const prevMap = Interpolation.buildEntityMap(prev.entities);
      this.entities = Interpolation.lerpEntities(prevMap, next.entities, t, true);
      return;
    }

    // Standard interpolation
    const range = next.time - prev.time;
    const t = range > 0 ? (renderTime - prev.time) / range : 0;
    const alpha = Math.max(0, Math.min(1, t));

    const prevMap = Interpolation.buildEntityMap(prev.entities);
    this.entities = Interpolation.lerpEntities(prevMap, next.entities, alpha, false);
  }
}
