// ── Vectors ───────────────────────────────────────────
export interface Vec2 {
  x: number;
  z: number;
}

// ── Entity state (shared snapshot representation) ─────
export interface EntityState {
  id: string;
  x: number;
  z: number;
  mass: number;
  score: number;
  name: string;
  color: number; // hex color
  isBot: boolean;
  alive: boolean;
  parentId: string | null; // non-null for split cells
}

// ── Pellet state ──────────────────────────────────────
export interface PelletState {
  id: number;
  x: number;
  z: number;
  color: number; // hex color
  type?: 'normal' | 'special_10' | 'rare_100';
}

// ── Leaderboard entry ─────────────────────────────────
export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
}
