/**
 * Score storage: DB write gates (MIN_SCORE, cooldown, dedupe).
 * Writes only on GameOver, only if gates pass.
 * Ready for real DB; currently logs. Add DB adapter when needed.
 */

// ── Constants ─────────────────────────────────────────────────────────────
/** Minimum score to persist. Avoids storing trivial scores. */
export const MIN_SCORE = 1000;
/** Cooldown between writes per player (seconds). Prevents spam. */
export const COOLDOWN_SECONDS = 30;
/** Prune entries older than this (ms). Memory hygiene. */
const PRUNE_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

// ── In-memory state ───────────────────────────────────────────────────────
const lastWriteAtByPlayer = new Map<string, number>();
const writtenSessionKeys = new Map<string, number>(); // key -> timestamp for pruning

function sessionKey(playerId: string, sessionId: number): string {
  return `${playerId}:${sessionId}`;
}

/** Prune old entries to avoid unbounded growth. */
function prune(): void {
  const now = Date.now();
  const cutoff = now - PRUNE_AGE_MS;
  const keysToDelete: string[] = [];
  for (const [k, ts] of writtenSessionKeys) {
    if (ts < cutoff) keysToDelete.push(k);
  }
  for (const k of keysToDelete) writtenSessionKeys.delete(k);
  const playersToDelete: string[] = [];
  for (const [playerId, ts] of lastWriteAtByPlayer) {
    if (ts < cutoff) playersToDelete.push(playerId);
  }
  for (const p of playersToDelete) lastWriteAtByPlayer.delete(p);
}

// Run prune every 30 minutes
setInterval(prune, 30 * 60 * 1000);

export type RejectReason = 'min_score' | 'cooldown' | 'dedupe';

/**
 * Try to record a game-over score. Returns true if write attempted, false if skipped.
 * Logs reject reason when skipped.
 */
export function tryRecordScore(
  playerId: string,
  playerName: string,
  sessionId: number,
  finalScore: number,
): { ok: boolean; reason?: RejectReason } {
  const key = sessionKey(playerId, sessionId);
  const now = Date.now();

  // Dedupe: never write same (playerId, sessionId) twice
  if (writtenSessionKeys.has(key)) {
    console.log(`[Score] DB write skipped (dedupe): ${playerId} session ${sessionId}`);
    return { ok: false, reason: 'dedupe' };
  }

  // MIN_SCORE gate
  if (finalScore < MIN_SCORE) {
    console.log(`[Score] DB write skipped (min_score): ${playerName} score ${finalScore} < ${MIN_SCORE}`);
    return { ok: false, reason: 'min_score' };
  }

  // Cooldown gate
  const last = lastWriteAtByPlayer.get(playerId);
  if (last != null && now - last < COOLDOWN_SECONDS * 1000) {
    console.log(`[Score] DB write skipped (cooldown): ${playerId} last write ${Math.round((now - last) / 1000)}s ago`);
    return { ok: false, reason: 'cooldown' };
  }

  // All gates passed — perform write (stub: log only; add DB when ready)
  // TODO: persist to DB (e.g. addScoresToTopScoresToday equivalent on server)
  console.log(`[Score] Recorded: ${playerName} (${playerId}) score ${finalScore} session ${sessionId}`);

  lastWriteAtByPlayer.set(playerId, now);
  writtenSessionKeys.set(key, now);

  return { ok: true };
}
