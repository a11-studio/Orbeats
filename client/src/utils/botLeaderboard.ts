/**
 * Daily bot leaderboard filler for "Top scores today".
 * Deterministic per day (UTC), stored in localStorage.
 */

import { hashStringToSeed, mulberry32 } from './seededRandom.js';

const BOT_STORAGE_PREFIX = 'orbeats:botTop10:';

const NAME_POOL = [
  'Alex', 'Blaze', 'Chip', 'Dax', 'Echo', 'Finn', 'Giga', 'Hex', 'Ivy', 'Jax',
  'Kai', 'Luna', 'Mox', 'Nova', 'Onyx', 'Pix', 'Quinn', 'Rex', 'Sky', 'Tank',
  'Vex', 'Wren', 'Zed', 'Ace', 'Bolt', 'Cobra', 'Dash', 'Ember', 'Frost', 'Ghost',
  'Haze', 'Iron', 'Jade', 'Kite', 'Lynx', 'Maze', 'Nyx', 'Orbit', 'Pulse', 'Rift',
  'Storm', 'Titan', 'Void', 'Warp', 'Zap', 'Axel', 'Blade', 'Cipher', 'Drift', 'Flux',
];

const SUFFIXES = ['', '_', '.', 'xx', '7', '99'];

export interface BotLeaderboardEntry {
  name: string;
  score: number;
  isBot: true;
}

/** Get today's date key in UTC (YYYY-MM-DD). */
export function getTodayKeyUTC(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getStorageKey(): string {
  return `${BOT_STORAGE_PREFIX}${getTodayKeyUTC()}`;
}

function generateDailyBotTopScores(count: number): BotLeaderboardEntry[] {
  const salt = (import.meta as { env?: { VITE_BOT_SEED_SALT?: string } }).env?.VITE_BOT_SEED_SALT ?? 'orbeats';
  const seedStr = `${getTodayKeyUTC()}-${salt}`;
  const seed = hashStringToSeed(seedStr);
  const rng = mulberry32(seed);

  const usedNames = new Set<string>();
  const usedScores = new Set<number>();
  const entries: BotLeaderboardEntry[] = [];

  while (entries.length < count) {
    const nameIdx = Math.floor(rng() * NAME_POOL.length);
    const suffixIdx = Math.floor(rng() * SUFFIXES.length);
    let name = NAME_POOL[nameIdx] + SUFFIXES[suffixIdx];
    if (usedNames.has(name)) {
      name = `${name}${usedNames.size}`;
    }
    usedNames.add(name);

    let score = Math.floor(1000 + Math.pow(rng(), 0.35) * 9000);
    score = Math.max(1000, Math.min(10000, score));
    while (usedScores.has(score)) {
      score = Math.floor(1000 + rng() * 9000);
    }
    usedScores.add(score);

    entries.push({ name, score, isBot: true });
  }

  return entries
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

/** Get daily bot top scores (cached in localStorage per day). */
export function getDailyBotTopScores(count = 10): BotLeaderboardEntry[] {
  const key = getStorageKey();
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as BotLeaderboardEntry[];
      if (Array.isArray(parsed) && parsed.length >= count) {
        return parsed.slice(0, count);
      }
    }
  } catch {
    /* ignore */
  }

  const generated = generateDailyBotTopScores(count);
  try {
    localStorage.setItem(key, JSON.stringify(generated));
  } catch {
    /* ignore */
  }
  return generated;
}
