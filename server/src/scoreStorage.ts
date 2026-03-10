/**
 * Score storage: DB write gates (MIN_SCORE, cooldown, dedupe).
 * Writes only on GameOver, only if gates pass.
 * Top Scores Today: in-memory storage, shared across all clients.
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

/** Top Scores Today: in-memory, keyed by date (YYYY-MM-DD UTC). */
interface TopScoreEntry {
  name: string;
  score: number;
  timestamp: number;
}
const topScoresByDate = new Map<string, TopScoreEntry[]>();

function sessionKey(playerId: string, sessionId: number): string {
  return `${playerId}:${sessionId}`;
}

function todayKey(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

  // All gates passed — persist to Top Scores Today (in-memory)
  addToTopScoresToday(playerName, Math.floor(finalScore));
  console.log(`[Score] Recorded: ${playerName} (${playerId}) score ${finalScore} session ${sessionId}`);

  lastWriteAtByPlayer.set(playerId, now);
  writtenSessionKeys.set(key, now);

  return { ok: true };
}

/** Add score to Top Scores Today. Keeps highest per name, cap at 10. */
function addToTopScoresToday(name: string, score: number): void {
  const key = todayKey();
  const current = topScoresByDate.get(key) ?? [];
  const byName = new Map<string, TopScoreEntry>();
  for (const e of current) {
    byName.set(e.name, e);
  }
  const existing = byName.get(name);
  if (!existing || score > existing.score) {
    byName.set(name, { name, score, timestamp: existing?.timestamp ?? Date.now() });
  }
  const merged = [...byName.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  topScoresByDate.set(key, merged);
}

/** Get Top Scores Today for all clients. Shared, server-authoritative. */
export function getTopScoresToday(count = 10): { name: string; score: number }[] {
  const key = todayKey();
  const entries = topScoresByDate.get(key) ?? [];
  return entries.slice(0, count).map((e) => ({ name: e.name, score: e.score }));
}
