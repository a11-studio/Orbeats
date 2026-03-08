import { BASE_MASS } from '@orbeats/shared';

export type GamePhase = 'PLAYING' | 'LEADERBOARD' | 'GAME_OVER' | 'MULTIPLIER';

export interface GameState {
  playerId: string | null;
  playerName: string;
  playerMass: number;
  playerScore: number;
  playerAlive: boolean;
  inputFrozen: boolean;
  gamePhase: GamePhase;
  frozenFinalScore: number;
  playerFrozen: boolean;
  sessionLocked: boolean;
  /** Server-authoritative session end (unix ms). Shared by all players in room. */
  sessionEndsAt: number;
  sessionId: number;
  deathKillerName: string;
  deathTopScores: { name: string; score: number }[];
  smoothedVelX: number;
  smoothedVelZ: number;
  lastInputSendTime: number;
}

export function createGameState(): GameState {
  return {
    playerId: null,
    playerName: 'Anon',
    playerMass: BASE_MASS,
    playerScore: 0,
    playerAlive: true,
    inputFrozen: false,
    gamePhase: 'PLAYING',
    frozenFinalScore: 0,
    playerFrozen: false,
    sessionLocked: false,
    sessionEndsAt: 0,
    sessionId: 0,
    deathKillerName: '',
    deathTopScores: [],
    smoothedVelX: 0,
    smoothedVelZ: 0,
    lastInputSendTime: 0,
  };
}
