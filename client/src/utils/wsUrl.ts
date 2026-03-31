/**
 * Resolves WebSocket URL for the game server.
 *
 * Priority:
 * 1. VITE_WS_URL — explicit override (CrazyGames, staging, custom hosts).
 * 2. Development (vite dev server only) — same-origin /ws via Vite proxy → local game server.
 * 3. Production builds (static preview, CrazyGames, Vercel, etc.) — fixed backend, no location.host.
 */

/**
 * Default multiplayer backend when the client is built for production but VITE_WS_URL is unset.
 * Uses the Fly.io app hostname (not ws.orbeats.online) so CrazyGames/static builds work while the
 * custom WSS subdomain mapping/certificate is verified; override with VITE_WS_URL when ready.
 */
export const DEFAULT_PRODUCTION_WS_URL = 'wss://orbeats.fly.dev/ws';

/**
 * Returns the WebSocket URL to connect to. Never falls back to localhost in production builds.
 */
export function getWsUrl(): string {
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.trim();
  }

  if (import.meta.env.DEV) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${location.host}/ws`;
  }

  return DEFAULT_PRODUCTION_WS_URL;
}

/**
 * Upgrades ws:// to wss:// when page is served over HTTPS (except localhost).
 * Use after resolving URL for env overrides that may use ws:// in dev docs.
 */
export function normalizeWsUrl(url: string): string {
  if (
    typeof location !== 'undefined' &&
    location.protocol === 'https:' &&
    url.startsWith('ws://') &&
    !url.includes('localhost')
  ) {
    return 'wss://' + url.slice('ws://'.length);
  }
  return url;
}
