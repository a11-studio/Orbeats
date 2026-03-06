import { SERVER_TICK_MS, BROADCAST_INTERVAL_MS, SESSION_SECONDS } from '@orbeats/shared';
import type { WebSocket } from 'ws';
import { World } from './World.js';
import {
  buildSnapshot,
  buildDeath,
  buildRespawn,
  buildPelletEaten,
  buildPelletSpawned,
  buildPelletSync,
  buildNewGameStarted,
  buildRoomSessionEnded,
  sendJSON,
} from './network.js';

/** Ticks between full pellet syncs (safety net against missed events) */
const PELLET_FULL_SYNC_INTERVAL = 300; // ~15 seconds at 20Hz
const SESSION_MS = SESSION_SECONDS * 1000;

export class GameLoop {
  world: World = new World();
  private tick: number = 0;
  private clients: Map<string, WebSocket> = new Map();
  private clientSeqs: Map<string, number> = new Map();

  private sessionEndsAt: number = 0;
  private sessionId: number = 0;

  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private broadcastInterval: ReturnType<typeof setInterval> | null = null;

  start(): void {
    console.log(`[GameLoop] Starting: tick=${SERVER_TICK_MS}ms, broadcast=${BROADCAST_INTERVAL_MS.toFixed(0)}ms`);

    // Simulation loop
    this.tickInterval = setInterval(() => {
      const now = Date.now();
      const dt = SERVER_TICK_MS / 1000;
      this.tick++;
      this.world.tick(dt, now);

      // Room session timer: when expired, reset world and broadcast to all
      if (this.sessionEndsAt > 0 && now >= this.sessionEndsAt) {
        this.sessionEndsAt = now + SESSION_MS;
        this.sessionId++;
        this.world.resetWorld();
        if (this.world.hasPelletEvents()) this.world.flushPelletEvents();
        const msg = buildRoomSessionEnded(this.sessionId, this.sessionEndsAt);
        for (const ws of this.clients.values()) {
          sendJSON(ws, msg);
        }
        const pelletMsg = buildPelletSync(this.world.pellets.toStateArray());
        for (const ws of this.clients.values()) {
          sendJSON(ws, pelletMsg);
        }
        this.broadcastSnapshots();
        console.log('[GameLoop] Room session expired — reset for all');
      }

      // Broadcast pellet events immediately after each tick
      this.broadcastPelletEvents();

      // Broadcast death and respawn events
      this.broadcastDeaths();
      this.broadcastRespawns();

      // Periodic full pellet sync as safety net
      if (this.tick % PELLET_FULL_SYNC_INTERVAL === 0) {
        this.broadcastPelletFullSync();
      }
    }, SERVER_TICK_MS);

    // Broadcast entity snapshots (separate from simulation)
    this.broadcastInterval = setInterval(() => {
      this.broadcastSnapshots();
    }, BROADCAST_INTERVAL_MS);
  }

  stop(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.broadcastInterval) clearInterval(this.broadcastInterval);
  }

  registerClient(id: string, ws: WebSocket): void {
    this.clients.set(id, ws);
    this.clientSeqs.set(id, 0);
    if (this.sessionEndsAt <= 0) {
      this.sessionEndsAt = Date.now() + SESSION_MS;
      this.sessionId = 1;
      console.log('[GameLoop] Session started (first player joined)');
    }
  }

  getSessionTiming(): { sessionEndsAt: number; sessionId: number } {
    return { sessionEndsAt: this.sessionEndsAt, sessionId: this.sessionId };
  }

  unregisterClient(id: string): void {
    this.clients.delete(id);
    this.clientSeqs.delete(id);
    if (this.clients.size === 0) {
      this.sessionEndsAt = 0;
      console.log('[GameLoop] Room empty — session cleared');
    }
  }

  updateClientSeq(id: string, seq: number): void {
    this.clientSeqs.set(id, seq);
  }

  /** Send full pellet state to a specific client (on join) */
  sendInitialPellets(ws: WebSocket): void {
    // Flush any stale events first so they don't arrive AFTER the sync
    if (this.world.hasPelletEvents()) {
      this.world.flushPelletEvents();
    }
    const msg = buildPelletSync(this.world.pellets.toStateArray());
    sendJSON(ws, msg);
  }

  private broadcastSnapshots(): void {
    if (this.clients.size === 0) return;

    const snapshots = buildSnapshot(this.world, this.tick, this.clientSeqs);

    for (const [id, ws] of this.clients) {
      const msg = snapshots.get(id);
      if (msg) {
        sendJSON(ws, msg);
      }
    }
  }

  /** Broadcast pellet eaten/spawned events to all clients */
  private broadcastPelletEvents(): void {
    if (!this.world.hasPelletEvents()) return;

    // Always flush events to prevent accumulation, even with zero clients.
    // Stale events from bot-only play must not burst-flood the first player who joins.
    const events = this.world.flushPelletEvents();

    if (this.clients.size === 0) return;

    // Broadcast eaten events (grouped by eater)
    for (const [eaterId, pelletIds] of events.eaten) {
      const msg = buildPelletEaten(eaterId, pelletIds);
      for (const ws of this.clients.values()) {
        sendJSON(ws, msg);
      }
    }

    // Broadcast spawned events
    if (events.spawned.length > 0) {
      const msg = buildPelletSpawned(events.spawned);
      for (const ws of this.clients.values()) {
        sendJSON(ws, msg);
      }
    }
  }

  /**
   * Per-player new-game: only the requesting player respawns.
   * Other players remain in their current state. No global reset.
   * @param playerId - derived from ws connection (cannot be spoofed)
   */
  handleNewGame(playerId: string): void {
    if (!this.world.resetPlayerForNewGame(playerId)) {
      console.warn('[GameLoop] New game requested by unknown player:', playerId);
      return;
    }
    console.log('[GameLoop] Per-player new game — respawning', playerId);

    const ws = this.clients.get(playerId);
    if (ws) {
      sendJSON(ws, buildNewGameStarted());
    }

    // Immediate snapshot so all clients see the respawned player's new state
    this.broadcastSnapshots();
  }

  /** Send death messages to individual clients */
  private broadcastDeaths(): void {
    const deaths = this.world.flushDeaths();
    for (const death of deaths) {
      const ws = this.clients.get(death.victimId);
      if (ws) {
        sendJSON(
          ws,
          buildDeath(
            death.killerId,
            death.killerName,
            death.finalScore,
            this.world.getTopScores(),
          ),
        );
      }
    }
  }

  /** Send respawn messages to individual clients */
  private broadcastRespawns(): void {
    const respawns = this.world.flushRespawns();
    for (const playerId of respawns) {
      const ws = this.clients.get(playerId);
      if (ws) {
        sendJSON(ws, buildRespawn());
      }
    }
  }

  /** Periodic full pellet sync as a safety net */
  private broadcastPelletFullSync(): void {
    if (this.clients.size === 0) return;

    const msg = buildPelletSync(this.world.pellets.toStateArray());
    for (const ws of this.clients.values()) {
      sendJSON(ws, msg);
    }
  }
}
