/** Toast that announces bounty target (60 s / 120 s after join) and bonus earned (on kill). */
export class BountyToast {
  private el: HTMLElement;
  private timeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Element is pre-rendered in index.html to avoid GPU-layer promotion jank on first show
    this.el = document.getElementById('bounty-toast')!;
  }

  /** Show target assignment toast */
  showTarget(targetName: string, targetScore: number): void {
    this.el.innerHTML = `🎯 <strong>${this.escape(targetName)}</strong> is your target! Eat them for <strong>+20% bonus!</strong>`;
    this.el.className = 'bounty-toast-target';
    this.show(6000);
  }

  /** Show bonus earned toast */
  showBonus(targetName: string, bonusScore: number): void {
    this.el.innerHTML = `💥 <strong>Bounty!</strong> +${Math.floor(bonusScore).toLocaleString()} bonus pts for eating ${this.escape(targetName)}!`;
    this.el.className = 'bounty-toast-bonus';
    this.show(4000);
  }

  private show(duration: number): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.el.classList.add('bounty-toast-visible');
    this.timeout = setTimeout(() => this.hide(), duration);
  }

  hide(): void {
    this.el.classList.remove('bounty-toast-visible');
    this.timeout = null;
  }

  private escape(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
