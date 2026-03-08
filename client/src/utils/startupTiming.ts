/**
 * Startup timing instrumentation.
 * Logs click → ws open → welcome → gameplay to diagnose production latency.
 * Enabled in dev (localhost) or when ?debug_startup=1 is in the URL.
 */
export const DEBUG_STARTUP =
  import.meta.env.DEV || typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug_startup') === '1';

let tClick = 0;
let tWsOpen = 0;
let tWelcome = 0;

export function markClick(): void {
  if (!DEBUG_STARTUP) return;
  tClick = performance.now();
  console.log('[Startup] T+0ms — Play clicked');
}

export function markWsOpen(): void {
  if (!DEBUG_STARTUP) return;
  tWsOpen = performance.now();
  const delta = tClick > 0 ? Math.round(tWsOpen - tClick) : 0;
  console.log(`[Startup] T+${delta}ms — WS open (click→open: ${delta}ms)`);
}

export function markWelcome(): void {
  if (!DEBUG_STARTUP) return;
  tWelcome = performance.now();
  const deltaOpen = tWsOpen > 0 ? Math.round(tWelcome - tWsOpen) : 0;
  const deltaClick = tClick > 0 ? Math.round(tWelcome - tClick) : 0;
  console.log(
    `[Startup] T+${deltaClick}ms — Welcome received (open→welcome: ${deltaOpen}ms, total: ${deltaClick}ms)`,
  );
}

export function markGameplayReady(): void {
  if (!DEBUG_STARTUP) return;
  const t = performance.now();
  const total = tClick > 0 ? Math.round(t - tClick) : 0;
  console.log(`[Startup] T+${total}ms — Gameplay ready (total click→play: ${total}ms)`);
}
