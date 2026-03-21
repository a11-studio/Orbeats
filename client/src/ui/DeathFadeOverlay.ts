/**
 * Single shared transition layer for death → multiplier → top score flow.
 * Soft dark navy dim (not black). Gameplay remains subtly visible underneath.
 */

const FADE_DURATION_MS = 1000;
const FADE_MAX_OPACITY = 0.52;
const FADE_Z_INDEX = 55; // Below multiplier (60) and death-overlay (60)
/** Dark gray tint — matches UI, gameplay faintly visible. */
const FADE_BG = 'rgba(28, 28, 32, 0.92)';

export class DeathFadeOverlay {
  private el: HTMLElement;
  private rafId: number = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'death-fade-overlay';
    this.el.style.cssText = `
      position: fixed; inset: 0; z-index: ${FADE_Z_INDEX};
      background: ${FADE_BG}; pointer-events: none;
      opacity: 0; display: none;
      transition: none;
    `;
  }

  mount(parent: HTMLElement = document.body): void {
    if (!this.el.parentElement) parent.appendChild(this.el);
  }

  /**
   * Start fade from transparent to dark. Calls onComplete when done.
   */
  play(onComplete: () => void): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.el.style.display = '';
    this.el.style.opacity = '0';

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / FADE_DURATION_MS);
      const eased = t * t * (3 - 2 * t); // smoothstep
      this.el.style.opacity = String(eased * FADE_MAX_OPACITY);

      if (t < 1) {
        this.rafId = requestAnimationFrame(step);
      } else {
        this.rafId = 0;
        onComplete();
      }
    };
    this.rafId = requestAnimationFrame(step);
  }

  /** Reset and hide. Call when death panel is shown. */
  hide(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.el.style.display = 'none';
    this.el.style.opacity = '0';
  }
}
