/**
 * Shared "freeze → multiplier → save → send → show death panel" flow.
 *
 * Three callsites used to inline near-identical code:
 *   1. triggerGameOverFlow  (manual End Game button)
 *   2. socket.onDeath       (server killed the player)
 *   3. socket.onRoomSessionEnded (3-min session timer expired)
 *
 * The pre-conditions (setting sessionLocked, deathKillerName, etc.) differ
 * between callers and stay in main.ts.  Only the shared inner loop is here.
 */

import { GameState } from './gameState.js';
import { GameSocket } from '../network/Socket.js';
import { MultiplierOverlay } from '../ui/MultiplierOverlay.js';
import { HUD } from '../ui/HUD.js';
import { saveBestScoreIfHigher, addScoresToTopScoresToday } from '../ui/ScoreManager.js';

export interface GameOverDeps {
  state: GameState;
  socket: GameSocket;
  multiplierOverlay: MultiplierOverlay;
  hud: HUD;
  deathFadeOverlay?: { hide: () => void };
}

/**
 * Mounts and runs the multiplier overlay.
 * On completion: writes frozenFinalScore, persists scores locally, sends
 * GameOver to server, and shows the death/game-over panel.
 *
 * @param baseScore       Score before the multiplier is applied.
 * @param sessionIdToReport  Session ID sent to the server in the GameOver msg.
 * @param deps            Shared module references (passed once from main.ts).
 * @param onComplete      Optional hook for caller-specific post-completion work.
 */
export function runMultiplierFlow(
  baseScore: number,
  sessionIdToReport: number,
  deps: GameOverDeps,
  onComplete?: (multipliedScore: number) => void,
): void {
  const { state, socket, multiplierOverlay, hud } = deps;

  multiplierOverlay.mount();
  multiplierOverlay.show(baseScore, (multiplier) => {
    const multipliedScore = Math.floor(baseScore * multiplier);
    state.frozenFinalScore = multipliedScore;
    addScoresToTopScoresToday([{ name: state.playerName, score: multipliedScore }]);
    saveBestScoreIfHigher(multipliedScore);
    if (state.playerId) socket.sendGameOver(multipliedScore, state.playerName, sessionIdToReport);
    multiplierOverlay.hide();
    state.gamePhase = 'GAME_OVER';
    hud.showDeathWithMultiplier(
      state.deathKillerName,
      multiplier,
      baseScore,
      multipliedScore,
      state.playerName,
      state.deathTopScores,
    );
    onComplete?.(multipliedScore);
  });
}
