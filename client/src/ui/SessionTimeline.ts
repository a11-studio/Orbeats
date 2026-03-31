import { getRemainingMs, formatRemaining, getProgress, WARN_THRESHOLD_MS } from '../utils/sessionTimer.js';

/**
 * Session timeline UI: progress bar + remaining time.
 * Desktop (hover): hover morphs to End Game; click while morphed ends session.
 * Touch (no hover): tap opens a small popover (Cancel / End game); no separate ⋯ button.
 */
export class SessionTimeline {
  private wrap: HTMLElement;
  private timeline: HTMLElement;
  private barFill: HTMLElement;
  private label: HTMLElement;
  private popover: HTMLElement | null = null;
  private popoverOpen = false;
  private onDocClick = (e: MouseEvent): void => {
    if (!this.popoverOpen || !this.popover) return;
    const t = e.target as Node;
    if (this.wrap.contains(t)) return;
    this.closePopover();
  };

  onEndGameClick: (() => void) | null = null;

  constructor() {
    this.wrap = document.getElementById('session-timeline-wrap')!;
    this.timeline = document.getElementById('session-timeline')!;
    this.barFill = document.getElementById('timeline-bar-fill')!;
    this.label = document.getElementById('timeline-label')!;
    this.popover = document.getElementById('session-end-popover');

    const prefersHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;

    if (prefersHover) {
      this.timeline.addEventListener('mouseenter', () => this.setMorph(true));
      this.timeline.addEventListener('mouseleave', () => this.setMorph(false));
      this.timeline.addEventListener('click', (e) => {
        if (this.timeline.classList.contains('morph-end-game')) {
          e.preventDefault();
          this.onEndGameClick?.();
        }
      });
    } else {
      this.timeline.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.togglePopover();
      });
      this.timeline.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.togglePopover();
        }
      });
      const cancelBtn = document.getElementById('session-end-cancel-btn');
      const confirmBtn = document.getElementById('session-end-confirm-btn');
      cancelBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closePopover();
      });
      confirmBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closePopover();
        this.onEndGameClick?.();
      });
      document.addEventListener('click', this.onDocClick, false);
    }

    this.setVisible(false);
  }

  private togglePopover(): void {
    if (!this.popover) return;
    if (this.popoverOpen) {
      this.closePopover();
    } else {
      this.popoverOpen = true;
      this.popover.classList.add('open');
      this.popover.setAttribute('aria-hidden', 'false');
      this.timeline.setAttribute('aria-expanded', 'true');
    }
  }

  private closePopover(): void {
    if (!this.popover) return;
    this.popoverOpen = false;
    this.popover.classList.remove('open');
    this.popover.setAttribute('aria-hidden', 'true');
    this.timeline.setAttribute('aria-expanded', 'false');
  }

  setMorph(morph: boolean): void {
    this.timeline.classList.toggle('morph-end-game', morph);
  }

  /** Call when sessionStartAt changes (hide until we have it) */
  setVisible(visible: boolean): void {
    this.wrap.style.display = visible ? 'flex' : 'none';
    if (!visible) this.closePopover();
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
