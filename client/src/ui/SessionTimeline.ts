import { getRemainingMs, formatRemaining, getProgress, WARN_THRESHOLD_MS } from '../utils/sessionTimer.js';
import { isMobile } from '../utils/deviceUtils.js';

/**
 * Session timeline UI: progress bar + remaining time.
 * Desktop: hover morphs to End Game button.
 * Mobile: tap timeline → morph to End Game → tap again to trigger (same flow as desktop hover).
 */
export class SessionTimeline {
  private wrap: HTMLElement;
  private timeline: HTMLElement;
  private barFill: HTMLElement;
  private label: HTMLElement;

  onEndGameClick: (() => void) | null = null;

  constructor() {
    this.wrap = document.getElementById('session-timeline-wrap')!;
    this.timeline = document.getElementById('session-timeline')!;
    this.barFill = document.getElementById('timeline-bar-fill')!;
    this.label = document.getElementById('timeline-label')!;
    const mobileMenu = document.getElementById('session-timeline-mobile-menu')!;

    // Desktop: hover morph
    this.timeline.addEventListener('mouseenter', () => this.setMorph(true));
    this.timeline.addEventListener('mouseleave', () => this.setMorph(false));

    // Mobile: tap to morph, tap again to trigger (mimics desktop hover)
    let mobileMorphTimeout: ReturnType<typeof setTimeout> | null = null;
    this.timeline.addEventListener('click', (e) => {
      if (isMobile()) {
        e.preventDefault();
        if (this.timeline.classList.contains('morph-end-game')) {
          if (mobileMorphTimeout) clearTimeout(mobileMorphTimeout);
          mobileMorphTimeout = null;
          this.onEndGameClick?.();
          this.setMorph(false);
        } else {
          if (mobileMorphTimeout) clearTimeout(mobileMorphTimeout);
          this.setMorph(true);
          mobileMorphTimeout = setTimeout(() => {
            this.setMorph(false);
            mobileMorphTimeout = null;
          }, 5000);
        }
        return;
      }
      // Desktop: click when morphed
      if (this.timeline.classList.contains('morph-end-game')) {
        e.preventDefault();
        this.onEndGameClick?.();
      }
    });

    // Fallback: ⋯ menu still works on mobile (direct trigger)
    mobileMenu.addEventListener('click', (e) => {
      e.preventDefault();
      this.onEndGameClick?.();
    });

    this.setVisible(false);
  }

  setMorph(morph: boolean): void {
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
