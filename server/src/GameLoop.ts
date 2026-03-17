import { SERVER_TICK_MS, BROADCAST_INTERVAL_MS, SESSION_SECONDS, BOUNTY_INTERVAL_MS } from '@orbeats/shared';
import type { WebSocket } from 'ws';
import { World } from './World.js';
import {
  buildSnapshot,
  buildLeaderboardMsg,
  buildDeath,
  buildRespawn,
  buildPelletEaten,
  buildPelletSpawned,
  buildPelletSync,
  buildNewGameStarted,
  buildRoomSessionEnded,
  buildSetBounty,
  buildBountyEarned,
  sendJSON,
} from './network.js';

/** Ticks between full pellet syncs (safety net against missed events) */
const PELLET_FULL_SYNC_INTERVAL = 1200; // ~60 seconds at 20Hz (was 15s — reduces payload spikes)
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
  private leaderboardInterval: ReturnType<typeof setInterval> | null = null;

  /** Tracks when each player joined (for bounty timing) */
  private clientJoinedAt: Map<string, number> = new Map();
  /** Last time a bounty was assigned for each player (repeats every BOUNTY_INTERVAL_MS) */
  private lastBountyAt: Map<string, number> = new Map();

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
        const oldSession = this.sessionId;
        const clientCount = this.clients.size;
        console.log(
          `[SESSION-END] timer expired sessionId=${oldSession} clients=${clientCount} — broadcast RoomSessionEnded`,
        );
        this.sessionEndsAt = now + SESSION_MS;
        this.sessionId++;
        console.log(`[SESSION-END] resetWorld begin`);
        this.world.resetWorld();
        this.resetBountyTracking();
        if (this.world.hasPelletEvents()) this.world.flushPelletEvents();
        console.log(`[SESSION-END] resetWorld end`);
        const msg = buildRoomSessionEnded(this.sessionId, this.sessionEndsAt);
        for (const ws of this.clients.values()) {
          sendJSON(ws, msg);
        }
        const resetPellets = this.world.pellets.toStateArray();
        const pelletMsg = buildPelletSync(resetPellets);
        for (const ws of this.clients.values()) {
          sendJSON(ws, pelletMsg);
        }
        console.log(
          `[PelletSync] room-reset pellets=${resetPellets.length} clients=${this.clients.size}`,
        );
        const afterCount = this.clients.size;
        if (afterCount < clientCount) {
          console.log(
            `[SESSION-END] WARNING: client count dropped ${clientCount}→${afterCount} during broadcast`,
          );
        }
        this.broadcastSnapshots();
        this.broadcastLeaderboard(); // Fresh leaderboard immediately (don't wait for 5 Hz interval)
        console.log(
          `[SESSION-END] RoomSessionEnded broadcast to ${this.clients.size} clients`,
        );
      }

      // Broadcast pellet events immediately after each tick
      this.broadcastPelletEvents();

      // Broadcast death and respawn events
      this.broadcastDeaths();
      this.broadcastRespawns();

      // Bounty system: assign targets and notify bonuses
      this.broadcastBounties(now);
      this.broadcastBountyEarned();

      // Periodic full pellet sync as safety net
      if (this.tick % PELLET_FULL_SYNC_INTERVAL === 0) {
        this.broadcastPelletFullSync();
      }
    }, SERVER_TICK_MS);

    // Broadcast entity snapshots (separate from simulation)
    this.broadcastInterval = setInterval(() => {
      this.broadcastSnapshots();
    }, BROADCAST_INTERVAL_MS);

    // Leaderboard at 5 Hz (separate from 15 Hz entity snapshots; responsive but lighter)
    this.leaderboardInterval = setInterval(() => {
      this.broadcastLeaderboard();
    }, 200);
  }

  stop(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.broadcastInterval) clearInterval(this.broadcastInterval);
    if (this.leaderboardInterval) clearInterval(this.leaderboardInterval);
  }

  registerClient(id: string, ws: WebSocket): void {
    this.clients.set(id, ws);
    this.clientSeqs.set(id, 0);
    this.clientJoinedAt.set(id, Date.now());
    if (this.sessionEndsAt <= 0) {
      // First joiner (or after room was empty): reset world so no stale bots/scores from server start
      console.log('[ROOM RESET] New session — resetting world for first joiner');
      this.world.resetWorld();
      this.sessionEndsAt = Date.now() + SESSION_MS;
      this.sessionId = 1;
      console.log('[GameLoop] Session started (first player joined)');
    }
  }

  getSessionTiming(): { sessionEndsAt: number; sessionId: number } {
    return { sessionEndsAt: this.sessionEndsAt, sessionId: this.sessionId };
  }

  getClientCount(): number {
    return this.clients.size;
  }

  unregisterClient(id: string): void {
    this.clients.delete(id);
    this.clientSeqs.delete(id);
    this.clientJoinedAt.delete(id);
    this.lastBountyAt.delete(id);
    this.world.clearBounty(id);
    if (this.clients.size === 0) {
      // Room empty: reset world so next joiner sees fresh state (no stale bots/scores)
      console.log('[ROOM RESET] Room empty — resetting world for next joiner');
      this.world.resetWorld();
      this.sessionEndsAt = 0;
      this.sessionId = 0;
    }
  }

  updateClientSeq(id: string, seq: number): void {
    this.clientSeqs.set(id, seq);
  }

  /** Send initial leaderboard to a client (on join, so they don't wait for 1 Hz tick) */
  sendInitialLeaderboard(ws: WebSocket): void {
    const msg = buildLeaderboardMsg(this.world);
    sendJSON(ws, msg);
  }

  /** Send full pellet state to a specific client (on join) */
  sendInitialPellets(ws: WebSocket): void {
    // Flush any stale events first so they don't arrive AFTER the sync
    if (this.world.hasPelletEvents()) {
      this.world.flushPelletEvents();
    }
    const pellets = this.world.pellets.toStateArray();
    const msg = buildPelletSync(pellets);
    sendJSON(ws, msg);
    console.log(`[PelletSync] initial to client pellets=${pellets.length}`);
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

  private broadcastLeaderboard(): void {
    if (this.clients.size === 0) return;

    const msg = buildLeaderboardMsg(this.world);
    for (const ws of this.clients.values()) {
      sendJSON(ws, msg);
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

    // Reset bounty timer so the interval restarts from the new game
    this.lastBountyAt.delete(playerId);
    this.clientJoinedAt.set(playerId, Date.now());

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

    const pellets = this.world.pellets.toStateArray();
    const msg = buildPelletSync(pellets);
    for (const ws of this.clients.values()) {
      sendJSON(ws, msg);
    }
    console.log(
      `[PelletSync] periodic full sync pellets=${pellets.length} clients=${this.clients.size}`,
    );
  }

  /** Assign a new bounty target every BOUNTY_INTERVAL_MS (30 s). Only 1 active at a time. */
  private broadcastBounties(now: number): void {
    for (const [playerId, ws] of this.clients) {
      const joinedAt = this.clientJoinedAt.get(playerId);
      if (!joinedAt) continue;

      const lastAt = this.lastBountyAt.get(playerId) ?? joinedAt;
      if (now - lastAt < BOUNTY_INTERVAL_MS) continue;

      const target = this.world.findBountyTarget(playerId);
      // Update timestamp regardless — avoids re-firing every tick when no target exists
      this.lastBountyAt.set(playerId, now);

      if (!target) continue;

      // Replace any existing bounty with the new target
      this.world.assignBounty(playerId, target.id);
      sendJSON(ws, buildSetBounty(target.id, target.name, target.score));
      console.log(`[Bounty] player=${playerId} target=${target.name} (score=${Math.floor(target.score)})`);
    }
  }

  /** Forward any earned bounty bonuses to the killer */
  private broadcastBountyEarned(): void {
    const events = this.world.flushBountyEarned();
    for (const event of events) {
      const ws = this.clients.get(event.killerId);
      if (ws) {
        sendJSON(ws, buildBountyEarned(event.targetName, event.bonusScore));
      }
    }
  }

  /** Reset bounty tracking for all players (called on session reset) */
  private resetBountyTracking(): void {
    const now = Date.now();
    for (const id of this.clients.keys()) {
      this.clientJoinedAt.set(id, now);
    }
    this.lastBountyAt.clear();
  }
}
