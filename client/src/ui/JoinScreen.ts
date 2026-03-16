/**
 * Wires up the Join Screen DOM elements.
 * All DOM queries and event listeners are isolated here so main.ts
 * only needs to call `setupJoinScreen(callbacks)`.
 */

export interface JoinScreenCallbacks {
  onJoin(playerName: string): Promise<void>;
  showError(msg: string): void;
  /** Optional: start WS preconnect (e.g. on hover/focus) to reduce perceived latency */
  onPreconnect?: () => void;
}

export function setupJoinScreen(callbacks: JoinScreenCallbacks): void {
  const joinBtn = document.getElementById('join-btn')!;
  const nameInput = document.getElementById('name-input') as HTMLInputElement;

  let preconnectFired = false;
  function maybePreconnect(): void {
    if (preconnectFired || !callbacks.onPreconnect) return;
    preconnectFired = true;
    callbacks.onPreconnect();
  }

  async function handleJoin(): Promise<void> {
    const name = nameInput.value.trim() || 'Anon';
    await callbacks.onJoin(name);
  }

  joinBtn.addEventListener('click', handleJoin);
  joinBtn.addEventListener('mouseenter', maybePreconnect);
  joinBtn.addEventListener('touchstart', maybePreconnect, { passive: true });
  nameInput.addEventListener('focus', maybePreconnect);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleJoin();
  });

  nameInput.focus();
}
