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

/** Sent to all clients when a new game (full match reset) begins */
export interface NewGameStartedMsg {
  type: ServerMsgType.NewGameStarted;
}

export type ServerMsg =
  | WelcomeMsg
  | SnapshotMsg
  | DeathMsg
  | RespawnMsg
  | PelletEatenMsg
  | PelletSpawnedMsg
  | PelletSyncMsg
  | NewGameStartedMsg;
