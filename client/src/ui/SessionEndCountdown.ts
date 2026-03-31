import type { GamePhase } from '../core/gameState.js';
import { getRemainingMs } from '../utils/sessionTimer.js';

const LAST_SECONDS_MS = 3 * 1000;

/**
 * Center-screen countdown during the last 3 seconds of a session (3 → 2 → 1).
 * Layer stays in the DOM as flex + opacity (not display:none) to avoid first-show jank.
 */
export class SessionEndCountdown {
  private el: HTMLElement;
  private textEl: HTMLElement;
  private prewarmed = false;

  constructor() {
    this.el = document.getElementById('session-end-countdown')!;
    this.textEl = document.getElementById('session-end-countdown-text')!;
  }

  /**
   * Warm glyph/layout once we know a timed session exists — before the last 3s fire.
   */
  prewarm(): void {
    if (this.prewarmed) return;
    this.prewarmed = true;
    const prev = this.textEl.textContent;
    for (const d of ['3', '2', '1']) {
      this.textEl.textContent = d;
      void this.textEl.offsetWidth;
    }
    this.textEl.textContent = prev ?? '';
  }

  hide(): void {
    this.el.classList.remove('visible');
    this.el.setAttribute('aria-hidden', 'true');
  }

  update(sessionEndsAt: number, gamePhase: GamePhase): void {
    if (gamePhase !== 'PLAYING' || sessionEndsAt <= 0) {
      this.hide();
      return;
    }
    const remaining = getRemainingMs(sessionEndsAt);
    if (remaining > LAST_SECONDS_MS) {
      this.hide();
      return;
    }
    if (remaining <= 0) {
      this.hide();
      return;
    }
    this.el.classList.add('visible');
    this.el.setAttribute('aria-hidden', 'false');
    const n = Math.ceil(remaining / 1000);
    this.textEl.textContent = String(n);
  }
}
