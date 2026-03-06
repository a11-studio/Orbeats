import type { WebSocket } from 'ws';
import {
  ServerMsgType,
  type SnapshotMsg,
  type WelcomeMsg,
  type DeathMsg,
  type RespawnMsg,
  type PelletEatenMsg,
  type PelletSpawnedMsg,
  type PelletSyncMsg,
  type NewGameStartedMsg,
  type RoomSessionEndedMsg,
  type ServerMsg,
  type PelletState,
  ARENA_SIZE,
} from '@orbeats/shared';
import type { World } from './World.js';

export function sendJSON(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function buildWelcome(playerId: string, sessionEndsAt: number, sessionId: number): WelcomeMsg {
  return {
    type: ServerMsgType.Welcome,
    playerId,
    arena: ARENA_SIZE,
    sessionEndsAt,
    sessionId,
  };
}

export function buildRoomSessionEnded(sessionId: number, sessionEndsAt: number): RoomSessionEndedMsg {
  return {
    type: ServerMsgType.RoomSessionEnded,
    sessionId,
    sessionEndsAt,
  };
}

/** Snapshots include ALL entities (players, bots, split cells). Pellets are event-driven. */
export function buildSnapshot(
  world: World,
  tick: number,
  clientSeqs: Map<string, number>,
): Map<string, SnapshotMsg> {
  const entities = world.getAllEntities().map((e) => e.toState());
  const leaderboard = world.getLeaderboard();

  const messages = new Map<string, SnapshotMsg>();
  for (const [id] of world.players) {
    messages.set(id, {
      type: ServerMsgType.Snapshot,
      tick,
      seq: clientSeqs.get(id) ?? 0,
      entities,
      leaderboard,
    });
  }
  return messages;
}

export function buildDeath(
  killerId: string,
  killerName: string,
  finalScore: number,
  topScores: { name: string; score: number }[],
): DeathMsg {
  return {
    type: ServerMsgType.Death,
    killerId,
    killerName,
    finalScore,
    topScores,
  };
}

export function buildRespawn(): RespawnMsg {
  return {
    type: ServerMsgType.Respawn,
  };
}

// ── Pellet event messages ────────────────────────────────

export function buildPelletEaten(eaterId: string, pelletIds: number[]): PelletEatenMsg {
  return {
    type: ServerMsgType.PelletEaten,
    pelletIds,
    eaterId,
  };
}

export function buildPelletSpawned(pellets: PelletState[]): PelletSpawnedMsg {
  return {
    type: ServerMsgType.PelletSpawned,
    pellets,
  };
}

export function buildPelletSync(pellets: PelletState[]): PelletSyncMsg {
  return {
    type: ServerMsgType.PelletSync,
    pellets,
  };
}

// ── New-game message ──────────────────────────────────

export function buildNewGameStarted(): NewGameStartedMsg {
  return {
    type: ServerMsgType.NewGameStarted,
  };
}
