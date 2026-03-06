import { getDailyBotTopScores, type BotLeaderboardEntry } from '../utils/botLeaderboard.js';

const BEST_SCORE_KEY = 'orbeats_best_score';
const TOP_SCORES_TODAY_KEY = 'orbeats_top_scores_today';

export interface TopScoreEntry {
  name: string;
  score: number;
  timestamp: number;
}

/** Merge real scores with bot filler, remove name collisions, sort desc, cap at 10. */
export function mergeTop10(
  real: TopScoreEntry[],
  bots: BotLeaderboardEntry[],
  count = 10,
): Array<TopScoreEntry | BotLeaderboardEntry> {
  const realNames = new Set(real.map((e) => e.name));
  const filteredBots = bots.filter((b) => !realNames.has(b.name));
  const combined = [...real, ...filteredBots]
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
  return combined;
}

/** Get top scores for display: real first, filled with daily bots if needed. */
export function getTopScoresTodayWithFallback(count = 10): Array<TopScoreEntry | BotLeaderboardEntry> {
  const real = getTopScoresToday();
  const bots = getDailyBotTopScores(count);
  return mergeTop10(real, bots, count);
}

function today(): string {
  return new Date().toDateString();
}

export function getBestScore(): number {
  try {
    const v = localStorage.getItem(BEST_SCORE_KEY);
    return v ? Math.max(0, parseInt(v, 10)) : 0;
  } catch {
    return 0;
  }
}

export function saveBestScoreIfHigher(score: number): void {
  const current = getBestScore();
  if (score <= current) return;
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(Math.floor(score)));
  } catch {
    /* ignore */
  }
}

function getTopScoresToday(): TopScoreEntry[] {
  try {
    const raw = localStorage.getItem(TOP_SCORES_TODAY_KEY);
    if (!raw) return [];
    const { date, entries } = JSON.parse(raw) as { date: string; entries: TopScoreEntry[] };
    if (date !== today()) return [];
    return entries;
  } catch {
    return [];
  }
}

/** Merge multiple scores into today's leaderboard. Keeps highest score per name. */
export function addScoresToTopScoresToday(entries: { name: string; score: number }[]): void {
  const current = getTopScoresToday();
  const byName = new Map<string, TopScoreEntry>();
  for (const e of current) {
    byName.set(e.name, e);
  }
  const now = Date.now();
  for (const { name, score } of entries) {
    const s = Math.floor(score);
    if (s <= 0) continue;
    const existing = byName.get(name);
    if (!existing || s > existing.score) {
      byName.set(name, { name, score: s, timestamp: existing?.timestamp ?? now });
    }
  }
  const merged = [...byName.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  try {
    localStorage.setItem(
      TOP_SCORES_TODAY_KEY,
      JSON.stringify({ date: today(), entries: merged }),
    );
  } catch {
    /* ignore */
  }
}
