import { SESSION_SECONDS } from '@orbeats/shared';

export const SESSION_MS = SESSION_SECONDS * 1000;
export const WARN_THRESHOLD_MS = 30 * 1000; // Orange at <= 30s

/**
 * Compute remaining ms in session.
 * Uses server-authoritative sessionEndsAt (unix ms).
 */
export function getRemainingMs(sessionEndsAt: number): number {
  return Math.max(0, sessionEndsAt - Date.now());
}

/** Format remaining ms as "m:ss" */
export function formatRemaining(remainingMs: number): string {
  const totalSec = Math.ceil(remainingMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Progress 0..1 (1 = full time left, 0 = none) */
export function getProgress(sessionEndsAt: number): number {
  const remaining = getRemainingMs(sessionEndsAt);
  return remaining / SESSION_MS;
}
