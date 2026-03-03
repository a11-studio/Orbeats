const MULTIPLIERS = [1.0, 1.2, 1.4, 1.6, 1.4, 1.2, 1.0] as const;

/**
 * Skill-based multiplier mini-game shown after Game Over.
 * Player clicks or presses Space to stop a moving indicator; multiplier is based on visual position.
 */
export class MultiplierOverlay {
  private container: HTMLElement;
  private bar: HTMLElement;
  private segmentsEl: HTMLElement;
  private indicator: HTMLElement;
  private instructionEl: HTMLElement;
  private onStopCallback: ((multiplier: number) => void) | null = null;
  private rafId: number = 0;
  private startTime: number = 0;
  private cycleMs: number = 1800;
  private stopped: boolean = false;
  private selectedMultiplier: number | null = null;
  private selectedIndex: number = -1;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'multiplier-overlay';
    this.container.innerHTML = `
      <div class="multiplier-panel">
        <p class="multiplier-instruction" id="multiplier-instruction">Click or press Space to stop!</p>
        <div class="multiplier-bar" id="multiplier-bar">
          <div class="multiplier-segments">
            <div class="mz-seg mz-1">1.0</div>
            <div class="mz-seg mz-2">1.2</div>
            <div class="mz-seg mz-3">1.4</div>
            <div class="mz-seg mz-center">1.6</div>
            <div class="mz-seg mz-3">1.4</div>
            <div class="mz-seg mz-2">1.2</div>
            <div class="mz-seg mz-1">1.0</div>
          </div>
          <div class="multiplier-indicator" id="multiplier-indicator"></div>
        </div>
      </div>
    `;
    this.container.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      display: none; align-items: center; justify-content: center;
      background: linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.85) 100%);
      backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      z-index: 60; font-family: 'Segoe UI', sans-serif;
    `;
    this.bar = this.container.querySelector('#multiplier-bar')!;
    this.segmentsEl = this.bar.querySelector('.multiplier-segments')!;
    this.indicator = this.container.querySelector('#multiplier-indicator')!;
    this.instructionEl = this.container.querySelector('#multiplier-instruction')!;

    const panel = this.container.querySelector('.multiplier-panel')! as HTMLElement;
    panel.style.cssText = `
      background: rgba(20,20,40,0.95); padding: 40px 56px; border-radius: 20px;
      min-width: 420px; text-align: center;
      border: 1px solid rgba(255,255,255,0.12);
    `;
    this.instructionEl.style.cssText = `
      color: #fff; margin-bottom: 32px; font-size: 19px; font-weight: 700;
      opacity: 0.95; letter-spacing: 0.04em;
    `;
    this.bar.style.cssText = `
      position: relative; height: 32px; overflow: visible;
    `;
    this.segmentsEl.style.cssText = `
      display: flex; gap: 8px; height: 100%; align-items: stretch;
    `;
    const segStyle = (bg: string, glow?: string) => `
      flex: 1; display: flex; align-items: center; justify-content: center;
      border-radius: 12px; font-size: 17px; font-weight: 700; letter-spacing: 0.03em;
      background: ${bg}; color: rgba(255,255,255,0.95);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.15)${glow ? `, ${glow}` : ''};
    `;
    const segs = this.segmentsEl.querySelectorAll('.mz-seg');
    segs.forEach((el, i) => {
      const html = el as HTMLElement;
      if (html.classList.contains('mz-center')) {
        html.style.cssText = segStyle(
          'linear-gradient(135deg, #00ff88 0%, #00cc6a 50%, #00ff88 100%)',
          '0 0 20px rgba(0,255,136,0.5), 0 0 40px rgba(0,255,136,0.25)',
        ) + 'transform: scale(1.05);';
      } else if (html.classList.contains('mz-1')) {
        html.style.cssText = segStyle('linear-gradient(135deg, #1f3f2a 0%, #2a4f38 100%)');
      } else if (html.classList.contains('mz-2')) {
        html.style.cssText = segStyle('linear-gradient(135deg, #2f6f3f 0%, #3a8048 100%)');
      } else {
        html.style.cssText = segStyle('linear-gradient(135deg, #ff8c32 0%, #e67a28 100%)');
      }
    });
    this.indicator.style.cssText = `
      position: absolute; top: 50%; transform: translate(-50%, -50%);
      width: 14px; height: 40px; left: 50%;
      background: linear-gradient(180deg, #ff6b35, #ff4444);
      border-radius: 7px; transition: none;
      box-shadow: 0 0 16px rgba(255,68,68,0.7), 0 0 8px rgba(255,68,68,0.4),
                  0 2px 4px rgba(0,0,0,0.3);
      filter: drop-shadow(0 0 6px rgba(255,68,68,0.6));
    `;

    const handleStop = () => {
      if (this.stopped) return;
      this.stopped = true;
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = 0;
      this.container.style.pointerEvents = 'none';
      const { multiplier: mult, index } = this.computeMultiplierFromPosition();
      this.selectedMultiplier = mult;
      this.selectedIndex = index;
      this.highlightSegment(index);
      this.onStopCallback?.(mult);
    };

    this.container.addEventListener('click', handleStop);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && this.container.style.display === 'flex') {
        e.preventDefault();
        handleStop();
      }
    });
  }

  mount(parent: HTMLElement = document.body): void {
    if (!this.container.parentElement) parent.appendChild(this.container);
  }

  show(onStop: (multiplier: number) => void): void {
    this.onStopCallback = onStop;
    this.stopped = false;
    this.selectedMultiplier = null;
    this.selectedIndex = -1;
    this.container.style.pointerEvents = '';
    this.resetSegmentHighlights();
    this.startTime = performance.now();
    this.container.style.display = 'flex';
    this.instructionEl.textContent = 'Click or press Space to stop!';
    this.tick();
  }

  hide(): void {
    this.container.style.display = 'none';
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private tick = (): void => {
    if (this.stopped) return;
    const elapsed = performance.now() - this.startTime;
    const t = (elapsed % this.cycleMs) / this.cycleMs;
    const pos = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
    const pct = pos * 100;
    this.indicator.style.left = `${pct}%`;
    this.indicator.style.transform = 'translate(-50%, -50%)';
    this.rafId = requestAnimationFrame(this.tick);
  };

  private computeMultiplierFromPosition(): { multiplier: number; index: number } {
    const barRect = this.bar.getBoundingClientRect();
    const indRect = this.indicator.getBoundingClientRect();
    const indicatorCenterX = indRect.left + indRect.width / 2 - barRect.left;
    const segmentWidth = barRect.width / MULTIPLIERS.length;
    let index = Math.floor(indicatorCenterX / segmentWidth);
    index = Math.min(MULTIPLIERS.length - 1, Math.max(0, index));
    return { multiplier: MULTIPLIERS[index], index };
  }

  private highlightSegment(index: number): void {
    const segs = this.segmentsEl.querySelectorAll('.mz-seg');
    segs.forEach((el, i) => {
      const html = el as HTMLElement;
      if (i === index) {
        html.style.transform = 'scale(1.1)';
        html.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 24px rgba(0,255,136,0.6), 0 0 48px rgba(0,255,136,0.3)';
      }
    });
  }

  private resetSegmentHighlights(): void {
    const segs = this.segmentsEl.querySelectorAll('.mz-seg');
    const baseShadow = 'inset 0 1px 0 rgba(255,255,255,0.15)';
    const centerGlow = '0 0 20px rgba(0,255,136,0.5), 0 0 40px rgba(0,255,136,0.25)';
    segs.forEach((el, i) => {
      const html = el as HTMLElement;
      html.style.transform = html.classList.contains('mz-center') ? 'scale(1.05)' : '';
      html.style.boxShadow = i === 3 ? `${baseShadow}, ${centerGlow}` : baseShadow;
    });
  }
}
