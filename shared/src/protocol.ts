import type { EntityState, PelletState, LeaderboardEntry, Vec2 } from './types.js';

// ── Message types ────────────────────────────────────
export enum ClientMsgType {
  Join = 'join',
  Input = 'input',
  Split = 'split',
  NewGame = 'new_game_request',
}

export enum ServerMsgType {
  Welcome = 'welcome',
  Snapshot = 'snapshot',
  Death = 'death',
  Respawn = 'respawn',
  PelletEaten = 'pellet_eaten',
  PelletSpawned = 'pellet_spawned',
  PelletSync = 'pellet_sync',
  NewGameStarted = 'new_game_started',
  RoomSessionEnded = 'room_session_ended',
}

// ── Client → Server messages ─────────────────────────
export interface JoinMsg {
  type: ClientMsgType.Join;
  name: string;
}

export interface InputMsg {
  type: ClientMsgType.Input;
  dir: Vec2; // normalized direction vector
  seq: number; // sequence number for reconciliation
}

export interface SplitMsg {
  type: ClientMsgType.Split;
}

export interface NewGameMsg {
  type: ClientMsgType.NewGame;
}

export type ClientMsg = JoinMsg | InputMsg | SplitMsg | NewGameMsg;

// ── Server → Client messages ─────────────────────────
export interface WelcomeMsg {
  type: ServerMsgType.Welcome;
  playerId: string;
  arena: number; // ARENA_SIZE
  /** Unix ms when room session ends. Server-authoritative, shared by all players. */
  sessionEndsAt: number;
  sessionId: number;
}

export interface SnapshotMsg {
  type: ServerMsgType.Snapshot;
  tick: number;
  seq: number; // last processed input seq for this client
  entities: EntityState[];
  leaderboard: LeaderboardEntry[];
}

export interface DeathMsg {
  type: ServerMsgType.Death;
  killerId: string;
  killerName: string;
  finalScore: number;
  topScores: { name: string; score: number }[];
}

export interface RespawnMsg {
  type: ServerMsgType.Respawn;
}

/** Sent when one or more pellets are eaten in a single tick */
export interface PelletEatenMsg {
  type: ServerMsgType.PelletEaten;
  pelletIds: number[];
  eaterId: string;
}

/** Sent when new pellets spawn (replenish) */
export interface PelletSpawnedMsg {
  type: ServerMsgType.PelletSpawned;
  pellets: PelletState[];
}

/** Full pellet sync: sent on join and periodically as a safety net */
export interface PelletSyncMsg {
  type: ServerMsgType.PelletSync;
  pellets: PelletState[];
}

/** Sent to client when their new game / respawn begins (per-player only) */
export interface NewGameStartedMsg {
  type: ServerMsgType.NewGameStarted;
  sessionStartAt?: number;
}

/** Room-wide session end when timer expires. Triggers Game Over for all players. */
export interface RoomSessionEndedMsg {
  type: ServerMsgType.RoomSessionEnded;
  sessionId: number;
  /** Unix ms when next session ends (server starts new session immediately). */
  sessionEndsAt: number;
}

export type ServerMsg =
  | WelcomeMsg
  | SnapshotMsg
  | DeathMsg
  | RespawnMsg
  | PelletEatenMsg
  | PelletSpawnedMsg
  | PelletSyncMsg
  | NewGameStartedMsg
  | RoomSessionEndedMsg;
