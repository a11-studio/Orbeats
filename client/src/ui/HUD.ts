import type { LeaderboardEntry } from '@orbeats/shared';
import { getTopScoresToday, type TopScoreEntry } from './ScoreManager.js';

export class HUD {
  private trophyScoreEl: HTMLElement;
  private leaderboardList: HTMLElement;
  private hudEl: HTMLElement;
  private deathOverlay: HTMLElement;
  private deathMsg: HTMLElement;
  private deathScoreEl: HTMLElement;
  private deathHighscoreList: HTMLElement;
  private deathPlayBtn: HTMLElement;
  private newGameBtn: HTMLElement;
  private deathPanelTitle: HTMLElement;

  private playerId: string = '';

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
    this.deathPlayBtn = document.getElementById('death-play-btn')!;
    this.newGameBtn = document.getElementById('new-game-btn')!;
    this.deathPanelTitle = document.getElementById('death-panel-title')!;

    this.newGameBtn.addEventListener('click', () => {
      this.onNewGameClick?.();
    });

    this.deathPlayBtn.addEventListener('click', () => {
      this.onStartMatch?.();
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

  updateLeaderboard(entries: LeaderboardEntry[]): void {
    this.leaderboardList.innerHTML = '';
    entries.forEach((entry, i) => {
      const li = document.createElement('li');
      if (entry.id === this.playerId) li.classList.add('me');
      li.innerHTML = `
        <span class="rank">${i + 1}.</span>
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
    const todayScores = getTopScoresToday();
    this.deathHighscoreList.innerHTML = '';
    if (todayScores.length === 0) {
      const li = document.createElement('li');
      li.className = 'death-no-scores';
      li.textContent = 'No scores today yet';
      this.deathHighscoreList.appendChild(li);
    } else {
      todayScores.forEach((entry: TopScoreEntry, i) => {
        const li = document.createElement('li');
        const isHighlight =
          entry.name === playerName &&
          Math.floor(entry.score) === Math.floor(finalScore);
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
