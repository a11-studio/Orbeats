import type { LeaderboardEntry } from '@orbeats/shared';
import { getTopScoresTodayWithFallback } from './ScoreManager.js';

/** "toggle" = Show more/less button. "scroll" = scrollable container (max-height 260px in CSS). */
const SCORE_LIST_MODE: 'toggle' | 'scroll' = 'toggle';
/** Max visible scores when collapsed. Adjust MAX_VISIBLE here; scroll max-height in index.html .death-highscore-list-wrap. */
const MAX_VISIBLE = 5;

export class HUD {
  private trophyScoreEl: HTMLElement;
  private leaderboardList: HTMLElement;
  private hudEl: HTMLElement;
  private deathOverlay: HTMLElement;
  private deathMsg: HTMLElement;
  private deathScoreEl: HTMLElement;
  private deathHighscoreList: HTMLElement;
  private deathHighscoreListWrap: HTMLElement;
  private deathShowMoreBtn: HTMLElement;
  private deathPlayBtn: HTMLElement;
  private deathPanelTitle: HTMLElement;

  private playerId: string = '';
  private scoreListExpanded: boolean = false;
  private lastPopulateScores: Array<{ name: string; score: number }> = [];
  private lastPopulateFinalScore: number = 0;
  private lastPopulatePlayerName: string = '';

  /** Set by the consumer: End Game button (during PLAYING → trigger multiplier flow). */
  onNewGameClick: (() => void) | null = null;
  /** Set by the consumer: Start Match button (on death overlay → reset). */
  onStartMatch: (() => void) | null = null;
  constructor() {
    this.trophyScoreEl = document.getElementById('trophy-score')!;
    this.leaderboardList = document.getElementById('leaderboard-list')!;
    this.hudEl = document.getElementById('hud')!;
    this.deathOverlay = document.getElementById('death-overlay')!;
    this.deathMsg = document.getElementById('death-msg')!;
    this.deathScoreEl = document.getElementById('death-score-value')!;
    this.deathHighscoreList = document.getElementById('death-highscore-list')!;
    this.deathHighscoreListWrap = document.getElementById('death-highscore-list-wrap')!;
    this.deathShowMoreBtn = document.getElementById('death-show-more-btn')!;
    this.deathPlayBtn = document.getElementById('death-play-btn')!;
    this.deathPanelTitle = document.getElementById('death-panel-title')!;

    this.deathPlayBtn.addEventListener('click', () => {
      this.onStartMatch?.();
    });
    this.deathShowMoreBtn.addEventListener('click', () => {
      this.scoreListExpanded = !this.scoreListExpanded;
      this.renderScoreList();
    });
  }

  show(): void {
    this.hudEl.classList.add('active');
  }

  hide(): void {
    this.hudEl.classList.remove('active');
  }

  setPlayerId(id: string): void {
    this.playerId = id;
  }

  updateScore(score: number): void {
    const formatted = Math.floor(score).toLocaleString();
    this.trophyScoreEl.textContent = formatted;
  }

  /**
   * In-game leaderboard overlay (visible during gameplay). NOT the Game Over screen.
   * Game Over UI (death-overlay, death-highscore-list) is separate and unchanged.
   *
   * @param options.isMobile - When true and isInGame, render only my row (same style as desktop).
   * @param options.isInGame - True during active gameplay (PLAYING). False on game over / other screens.
   * @param options.fallbackScore - When compact and player not in entries yet, show this score.
   */
  updateLeaderboard(
    entries: LeaderboardEntry[],
    options?: { isMobile?: boolean; isInGame?: boolean; fallbackScore?: number },
  ): void {
    const compactMobileGameplay = !!(options?.isMobile && options?.isInGame);
    const rowsToRender = compactMobileGameplay
      ? (() => {
          const meIndex = entries.findIndex((e) => e.id === this.playerId);
          if (meIndex >= 0) return [entries[meIndex]];
          return options?.fallbackScore != null
            ? [{ id: this.playerId, name: 'You', score: options.fallbackScore } as LeaderboardEntry]
            : [];
        })()
      : entries;

    this.leaderboardList.innerHTML = '';
    rowsToRender.forEach((entry, i) => {
      const rank = compactMobileGameplay
        ? entries.findIndex((e) => e.id === this.playerId) + 1 || '-'
        : i + 1;
      const li = document.createElement('li');
      if (entry.id === this.playerId) li.classList.add('me');
      li.innerHTML = `
        <span class="rank">${rank}.</span>
        <span class="name">${this.escapeHtml(entry.name)}</span>
        <span class="lb-score">${Math.floor(entry.score).toLocaleString()}</span>
      `;
      this.leaderboardList.appendChild(li);
    });
  }

  showLeaderboard(score: number, playerName: string): void {
    this.deathPanelTitle.textContent = 'SESSION COMPLETE';
    this.deathMsg.style.display = 'none';
    this.deathScoreEl.textContent = Math.floor(score).toLocaleString();
    this.populateTopScores(score, playerName);
    this.deathPlayBtn.textContent = 'START MATCH';
    this.deathOverlay.classList.add('active');
  }

  showDeath(
    killerName: string,
    finalScore: number,
    playerName: string,
    _topScores: { name: string; score: number }[],
  ): void {
    this.deathPanelTitle.textContent = 'GAME OVER';
    this.deathMsg.style.display = '';
    this.deathMsg.textContent = `Eaten by ${this.escapeHtml(killerName)}`;
    this.deathScoreEl.textContent = Math.floor(finalScore).toLocaleString();
    this.populateTopScores(finalScore, playerName);
    this.deathPlayBtn.textContent = 'START NEW GAME';
    this.deathPlayBtn.style.display = '';
    this.deathOverlay.classList.add('active');
  }

  showDeathWithMultiplier(
    killerName: string,
    multiplier: number,
    baseScore: number,
    multipliedScore: number,
    playerName: string,
    topScores: { name: string; score: number }[],
  ): void {
    this.deathPanelTitle.textContent = 'GAME OVER';
    this.deathMsg.style.display = '';
    this.deathMsg.textContent = killerName === 'Session ended'
      ? `Session ended • You hit x${multiplier.toFixed(1)}!`
      : `Eaten by ${this.escapeHtml(killerName)} • You hit x${multiplier.toFixed(1)}!`;
    this.populateTopScores(multipliedScore, playerName);
    this.deathPlayBtn.textContent = 'START NEW GAME';
    this.deathPlayBtn.style.display = '';
    this.deathOverlay.classList.add('active');
    this.animateDeathScore(baseScore, multipliedScore, 600);
  }

  private animateDeathScore(from: number, to: number, durationMs: number): void {
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) * (1 - t);
      const val = Math.floor(from + (to - from) * eased);
      this.deathScoreEl.textContent = val.toLocaleString();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  hideDeath(): void {
    this.deathOverlay.classList.remove('active');
  }

  hideLeaderboard(): void {
    this.deathOverlay.classList.remove('active');
  }

  private populateTopScores(finalScore: number, playerName: string): void {
    const todayScores = getTopScoresTodayWithFallback(10);
    this.lastPopulateScores = todayScores.map((e) => ({ name: e.name, score: e.score }));
    this.lastPopulateFinalScore = finalScore;
    this.lastPopulatePlayerName = playerName;
    this.scoreListExpanded = false;

    this.deathHighscoreListWrap.classList.toggle('score-list-scroll', SCORE_LIST_MODE === 'scroll');
    this.deathHighscoreListWrap.classList.remove('score-list-expanded');

    if (SCORE_LIST_MODE === 'toggle' && todayScores.length > MAX_VISIBLE) {
      this.deathShowMoreBtn.style.display = '';
    } else {
      this.deathShowMoreBtn.style.display = 'none';
    }

    this.renderScoreList();
  }

  private renderScoreList(): void {
    const { lastPopulateScores: scores, lastPopulateFinalScore: finalScore, lastPopulatePlayerName: playerName } = this;
    this.deathHighscoreList.innerHTML = '';

    if (scores.length === 0) {
      const li = document.createElement('li');
      li.className = 'death-no-scores';
      li.textContent = 'No scores today yet';
      this.deathHighscoreList.appendChild(li);
    } else {
      const visibleCount =
        SCORE_LIST_MODE === 'scroll'
          ? scores.length
          : this.scoreListExpanded
            ? scores.length
            : Math.min(MAX_VISIBLE, scores.length);
      const visibleScores = scores.slice(0, visibleCount);

      if (SCORE_LIST_MODE === 'toggle' && scores.length > MAX_VISIBLE) {
        this.deathShowMoreBtn.textContent = this.scoreListExpanded ? 'Show less' : 'Show more';
        this.deathShowMoreBtn.style.display = '';
        this.deathHighscoreListWrap.classList.toggle('score-list-expanded', this.scoreListExpanded);
      }

      visibleScores.forEach((entry, i) => {
        const li = document.createElement('li');
        const isHighlight =
          entry.name === playerName && Math.floor(entry.score) === Math.floor(finalScore);
        if (isHighlight) li.classList.add('highlight');
        const nameText = isHighlight ? `${this.escapeHtml(entry.name)} (You)` : this.escapeHtml(entry.name);
        li.innerHTML = `
          <span class="hs-rank">${i + 1}.</span>
          <span class="hs-name">${nameText}</span>
          <span class="hs-score">${Math.floor(entry.score).toLocaleString()}</span>
        `;
        this.deathHighscoreList.appendChild(li);
      });
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
