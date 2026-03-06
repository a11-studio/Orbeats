import { getRemainingMs, formatRemaining, getProgress, WARN_THRESHOLD_MS } from '../utils/sessionTimer.js';
import { isMobile } from '../utils/deviceUtils.js';

/**
 * Session timeline UI: progress bar + remaining time.
 * Desktop: hover morphs to End Game button.
 * Mobile: ⋯ menu for End Game.
 */
export class SessionTimeline {
  private wrap: HTMLElement;
  private timeline: HTMLElement;
  private barFill: HTMLElement;
  private label: HTMLElement;
  private mobileMenu: HTMLElement;

  onEndGameClick: (() => void) | null = null;

  constructor() {
    this.wrap = document.getElementById('session-timeline-wrap')!;
    this.timeline = document.getElementById('session-timeline')!;
    this.barFill = document.getElementById('timeline-bar-fill')!;
    this.label = document.getElementById('timeline-label')!;
    this.mobileMenu = document.getElementById('session-timeline-mobile-menu')!;

    // Desktop: hover morph
    this.timeline.addEventListener('mouseenter', () => this.setMorph(true));
    this.timeline.addEventListener('mouseleave', () => this.setMorph(false));

    // Click: End Game (when morphed on desktop, or always on mobile via timeline or menu)
    this.timeline.addEventListener('click', (e) => {
      if (isMobile()) return; // Mobile uses menu
      if (this.timeline.classList.contains('morph-end-game')) {
        e.preventDefault();
        this.onEndGameClick?.();
      }
    });

    this.mobileMenu.addEventListener('click', (e) => {
      e.preventDefault();
      this.onEndGameClick?.();
    });

    this.setVisible(false);
  }

  setMorph(morph: boolean): void {
    if (isMobile()) return;
    this.timeline.classList.toggle('morph-end-game', morph);
  }

  /** Call when sessionStartAt changes (hide until we have it) */
  setVisible(visible: boolean): void {
    this.wrap.style.display = visible ? 'flex' : 'none';
  }

  /** Update bar and label. Call every frame during gameplay. Uses sessionEndsAt (unix ms). */
  update(sessionEndsAt: number): void {
    const remaining = getRemainingMs(sessionEndsAt);
    const progress = getProgress(sessionEndsAt);

    this.barFill.style.width = `${progress * 100}%`;
    this.barFill.classList.toggle('warn', remaining <= WARN_THRESHOLD_MS && remaining > 0);
    this.label.textContent = formatRemaining(remaining);
  }
}
