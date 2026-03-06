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
  private sessionScoreEl: HTMLElement;
  private potentialScoreEl: HTMLElement;
  private baseScore: number = 0;
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
        <p class="multiplier-session-label">SESSION SCORE</p>
        <p class="multiplier-session-score" id="multiplier-session-score">0</p>
        <p class="multiplier-motivation">Multiply your score!</p>
        <p class="multiplier-subtitle">Stop the bar at the highest multiplier.</p>
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
        <p class="multiplier-potential-label">Potential score: <span id="multiplier-potential-value">0</span></p>
      </div>
    `;
    this.container.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      display: none; align-items: center; justify-content: center;
      background: linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.85) 100%);
      backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      z-index: 60; font-family: 'Mona Sans', sans-serif;
    `;
    this.bar = this.container.querySelector('#multiplier-bar')!;
    this.segmentsEl = this.bar.querySelector('.multiplier-segments')!;
    this.indicator = this.container.querySelector('#multiplier-indicator')!;
    this.instructionEl = this.container.querySelector('#multiplier-instruction')!;
    this.sessionScoreEl = this.container.querySelector('#multiplier-session-score')!;
    this.potentialScoreEl = this.container.querySelector('#multiplier-potential-value')!;

    const panel = this.container.querySelector('.multiplier-panel')! as HTMLElement;
    panel.style.cssText = `
      background: rgba(20,20,40,0.95); padding: 48px 56px; border-radius: 20px;
      min-width: 420px; text-align: center;
      border: 1px solid rgba(255,255,255,0.12);
    `;
    (this.container.querySelector('.multiplier-session-label') as HTMLElement).style.cssText = `
      color: rgba(255,255,255,0.6); font-size: 14px; letter-spacing: 2px; margin-bottom: 8px;
    `;
    this.sessionScoreEl.style.cssText = `
      color: #ff9900; font-size: 42px; font-weight: 700; margin-bottom: 24px;
    `;
    (this.container.querySelector('.multiplier-motivation') as HTMLElement).style.cssText = `
      color: #fff; font-size: 20px; font-weight: 700; margin-bottom: 6px;
    `;
    (this.container.querySelector('.multiplier-subtitle') as HTMLElement).style.cssText = `
      color: rgba(255,255,255,0.7); font-size: 14px; margin-bottom: 28px;
    `;
    this.instructionEl.style.cssText = `
      color: #fff; margin-bottom: 24px; font-size: 19px; font-weight: 700;
      opacity: 0.95; letter-spacing: 0.04em;
    `;
    (this.container.querySelector('.multiplier-potential-label') as HTMLElement).style.cssText = `
      color: rgba(255,255,255,0.8); font-size: 16px; margin-top: 24px;
    `;
    this.potentialScoreEl.style.cssText = `font-weight: 700; color: #ff9900;`;
    this.bar.style.cssText = `
      position: relative; height: 32px; overflow: visible; margin-bottom: 0;
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
          'linear-gradient(135deg, #00d26a 0%, #00b359 50%, #00d26a 100%)',
          '0 0 20px rgba(0,210,106,0.5), 0 0 40px rgba(0,210,106,0.25)',
        ) + 'transform: scale(1.05);';
      } else if (html.classList.contains('mz-1')) {
        html.style.cssText = segStyle('linear-gradient(135deg, #8b0000 0%, #a01010 100%)');
      } else if (html.classList.contains('mz-2')) {
        html.style.cssText = segStyle('linear-gradient(135deg, #ff3b30 0%, #e6352b 100%)');
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

  show(finalScore: number, onStop: (multiplier: number) => void): void {
    this.baseScore = finalScore;
    this.onStopCallback = onStop;
    this.stopped = false;
    this.selectedMultiplier = null;
    this.selectedIndex = -1;
    this.container.style.pointerEvents = '';
    this.resetSegmentHighlights();
    this.startTime = performance.now();
    this.container.style.display = 'flex';
    this.sessionScoreEl.textContent = Math.floor(finalScore).toLocaleString();
    this.instructionEl.textContent = 'Click or press Space to stop!';
    this.updatePotentialScore();
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
    this.updatePotentialScore();
    this.rafId = requestAnimationFrame(this.tick);
  };

  private updatePotentialScore(): void {
    const { multiplier } = this.computeMultiplierFromPosition();
    const potential = Math.floor(this.baseScore * multiplier);
    this.potentialScoreEl.textContent = potential.toLocaleString();
  }

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
        html.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 24px rgba(0,210,106,0.6), 0 0 48px rgba(0,210,106,0.3)';
      }
    });
  }

  private resetSegmentHighlights(): void {
    const segs = this.segmentsEl.querySelectorAll('.mz-seg');
    const baseShadow = 'inset 0 1px 0 rgba(255,255,255,0.15)';
    const centerGlow = '0 0 20px rgba(0,210,106,0.5), 0 0 40px rgba(0,210,106,0.25)';
    segs.forEach((el, i) => {
      const html = el as HTMLElement;
      html.style.transform = html.classList.contains('mz-center') ? 'scale(1.05)' : '';
      html.style.boxShadow = i === 3 ? `${baseShadow}, ${centerGlow}` : baseShadow;
    });
  }
}
