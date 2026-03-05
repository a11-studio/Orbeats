/**
 * Resolves WebSocket URL for the game server.
 * - Uses VITE_WS_URL when set (production WSS).
 * - Localhost/dev: defaults to ws://localhost:3001.
 * - Production without config: returns null (avoids Mixed Content).
 */
export function getWsUrl(): string | null {
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (envUrl && envUrl.trim().length > 0) return envUrl.trim();

  const isLocal =
    typeof location !== 'undefined' &&
    (location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1' ||
      location.hostname.endsWith('.local'));

  if (isLocal) return 'ws://localhost:3001';

  return null;
}

/**
 * Upgrades ws:// to wss:// when page is served over HTTPS (except localhost).
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
