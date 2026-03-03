import type { PelletState } from '@orbeats/shared';

/**
 * Client-side pellet store: a stable Map<pelletId, PelletState>.
 *
 * Pellets are ONLY added/removed via server events:
 *   - PelletSync: full replacement (on join + periodic safety net)
 *   - PelletSpawned: add new pellets
 *   - PelletEaten: remove specific pellets by ID
 *
 * The client NEVER creates or destroys pellets on its own.
 */
export class PelletStore {
  private pellets: Map<number, PelletState> = new Map();

  /** Cache: flat array rebuilt only when dirty */
  private _array: PelletState[] = [];
  private _dirty: boolean = true;

  /** Monotonic version counter: increments on every mutation */
  private _version: number = 0;

  /** Full sync: replace all pellets (on join, or periodic safety net) */
  sync(pellets: PelletState[]): void {
    this.pellets.clear();
    for (const p of pellets) {
      this.pellets.set(p.id, p);
    }
    this._dirty = true;
    this._version++;
  }

  /** Server says these pellets were eaten. Remove them by ID. */
  removeEaten(pelletIds: number[]): void {
    let removed = false;
    for (const id of pelletIds) {
      if (this.pellets.delete(id)) {
        removed = true;
      }
    }
    if (removed) {
      this._dirty = true;
      this._version++;
    }
  }

  /** Server says new pellets spawned. Add them. */
  addSpawned(pellets: PelletState[]): void {
    for (const p of pellets) {
      this.pellets.set(p.id, p);
    }
    if (pellets.length > 0) {
      this._dirty = true;
      this._version++;
    }
  }

  /** Get the flat array for rendering. Rebuilt only when state changes. */
  getArray(): PelletState[] {
    if (this._dirty) {
      this._array = [...this.pellets.values()];
      this._dirty = false;
    }
    return this._array;
  }

  /** Version counter: changes on every mutation. Used by renderer to skip no-op updates. */
  get version(): number {
    return this._version;
  }

  get size(): number {
    return this.pellets.size;
  }
}
