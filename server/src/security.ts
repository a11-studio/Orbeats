/**
 * Security: connection limits, rate limiting, IP extraction.
 * Works behind Fly.io (x-forwarded-for, fly-client-ip).
 */

import type { IncomingMessage } from 'http';

// ── Constants (tune near top of file) ─────────────────────────────────────
/** Max WS connections per IP. Prevents single IP from exhausting server. */
export const MAX_CONN_PER_IP = 8;

/** Token bucket: max tokens per second. Normal gameplay ~20–30 msg/s. */
export const MAX_MSG_PER_SEC = 25;
/** Token bucket: burst capacity. Allows short spikes. */
export const BURST = 40;
/** Strikes before closing connection (rate limit violations + parse errors). */
export const RATE_LIMIT_STRIKES_BEFORE_CLOSE = 3;

// ── IP extraction (Fly.io / proxies) ──────────────────────────────────────
/** Derive client IP from request. Prefer x-forwarded-for, fly-client-ip, x-real-ip, then socket. */
export function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0];
    const ip = first?.trim();
    if (ip) return ip;
  }
  const flyIp = req.headers['fly-client-ip'];
  if (flyIp) {
    const ip = typeof flyIp === 'string' ? flyIp : flyIp[0];
    if (ip) return ip.trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    const ip = typeof realIp === 'string' ? realIp : realIp[0];
    if (ip) return ip.trim();
  }
  const addr = req.socket?.remoteAddress;
  return addr ?? '0.0.0.0';
}

// ── Connection count per IP ────────────────────────────────────────────────
export const ipConnCount = new Map<string, number>();

export function incrementIpConn(ip: string): void {
  ipConnCount.set(ip, (ipConnCount.get(ip) ?? 0) + 1);
}

export function decrementIpConn(ip: string): void {
  const n = ipConnCount.get(ip) ?? 0;
  if (n <= 1) ipConnCount.delete(ip);
  else ipConnCount.set(ip, n - 1);
}

// ── Token bucket rate limiter (per connection) ─────────────────────────────
export interface TokenBucket {
  tokens: number;
  lastRefillMs: number;
  strikes: number;
}

export function createTokenBucket(): TokenBucket {
  return {
    tokens: BURST,
    lastRefillMs: Date.now(),
    strikes: 0,
  };
}

/** Returns true if message allowed, false if rate limited. Increments strikes when denied. */
export function consumeToken(bucket: TokenBucket): boolean {
  const now = Date.now();
  const elapsedSec = (now - bucket.lastRefillMs) / 1000;
  bucket.tokens = Math.min(BURST, bucket.tokens + elapsedSec * MAX_MSG_PER_SEC);
  bucket.lastRefillMs = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  bucket.strikes += 1;
  return false;
}
