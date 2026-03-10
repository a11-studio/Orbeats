/**
 * Resolves WebSocket URL for the game server.
 * - Uses VITE_WS_URL when set (production WSS).
 * - Localhost/dev: uses Vite proxy (/ws → ws://localhost:3001) for same-origin connection.
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

  if (isLocal) {
    // Use Vite proxy: same origin, avoids direct ws://localhost:3001 issues
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${location.host}/ws`;
  }

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
