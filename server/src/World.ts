import {
  RESPAWN_DELAY,
  MIN_BOT_COUNT,
  SPLIT_MERGE_DELAY,
  SPLIT_MIN_MASS,
  MAX_PLAYER_CELLS,
  SIBLING_REPULSION,
  MERGE_OVERLAP_GRACE,
  BASE_MASS,
  getMassDecayPerSecond,
} from '@orbeats/shared';
import type { LeaderboardEntry } from '@orbeats/shared';
import { Player } from './Player.js';
import { SplitCell } from './SplitCell.js';
import { PelletManager, type PelletEvents } from './Pellet.js';
import { Bot } from './Bot.js';
import { checkPelletCollision, checkPlayerEat, type Collidable } from './physics.js';

let botIdCounter = 0;

const BOT_NAMES = [
  'Chomper', 'Blobzilla', 'NomNom', 'Gulpy', 'Munchkin',
  'Devour', 'Gobbler', 'Slurpy', 'BigBite', 'Glomp',
];

/**
 * Intentional bot mass tiers:
 *   - 2 strong bots (predators the player must avoid early)
 *   - 2 weak bots (easy prey to eat early)
 */
const BOT_MASS_TIERS = [50, 40, 6, 8];

export interface DeathEvent {
  victimId: string;
  killerId: string;
  killerName: string;
  finalScore: number;
}

export class World {
  players: Map<string, Player> = new Map();
  bots: Map<string, Bot> = new Map();
  splitCells: Map<string, SplitCell> = new Map();
  pellets: PelletManager = new PelletManager();

  private respawnQueue: { player: Player; time: number }[] = [];
  private pendingDeaths: DeathEvent[] = [];
  private pendingRespawns: string[] = [];
  private sessionHighScores: { name: string; score: number }[] = [];

  addPlayer(id: string, name: string): Player {
    const player = new Player(id, name, false);
    this.players.set(id, player);
    this.updateBots();
    return player;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    this.respawnQueue = this.respawnQueue.filter((r) => r.player.id !== id);

    // Remove any split cells belonging to this player
    for (const [cellId, cell] of this.splitCells) {
      if (cell.parentId === id) {
        this.splitCells.delete(cellId);
      }
    }

    this.updateBots();
  }

  getPlayer(id: string): Player | undefined {
    return this.players.get(id);
  }

  updateBots(): void {
    const totalPlayers = this.players.size;
    const neededBots = Math.max(0, MIN_BOT_COUNT - totalPlayers);

    while (this.bots.size > neededBots) {
      const firstKey = this.bots.keys().next().value;
      if (firstKey !== undefined) {
        this.bots.delete(firstKey);
      }
    }

    while (this.bots.size < neededBots) {
      const tierIndex = this.bots.size % BOT_MASS_TIERS.length;
      const initialMass = BOT_MASS_TIERS[tierIndex];
      const id = `bot_${botIdCounter++}`;
      const name = BOT_NAMES[botIdCounter % BOT_NAMES.length];
      const bot = new Bot(id, name, initialMass);
      this.bots.set(id, bot);
    }
  }

  /** All collidable entities: players + bots + split cells */
  getAllEntities(): Collidable[] {
    return [
      ...this.players.values(),
      ...this.bots.values(),
      ...this.splitCells.values(),
    ];
  }

  /** Players + bots only (no split cells) — for leaderboard etc. */
  getAllPlayers(): Player[] {
    return [...this.players.values(), ...this.bots.values()];
  }

  /** How many total cells does this player own? (1 main + N splits) */
  getPlayerCellCount(playerId: string): number {
    let count = 1; // main blob
    for (const cell of this.splitCells.values()) {
      if (cell.parentId === playerId && cell.alive) count++;
    }
    return count;
  }

  /**
   * Multi-split: split EVERY blob owned by this player.
   * 1 → 2, 2 → 4, 4 → 8. Hard limit: MAX_PLAYER_CELLS.
   * Each new blob gets half mass + forward impulse.
   */
  splitAllBlobs(playerId: string, now: number): boolean {
    const player = this.players.get(playerId) ?? this.bots.get(playerId);
    if (!player || !player.canSplit(now)) return false;

    let totalCells = this.getPlayerCellCount(playerId);
    if (totalCells >= MAX_PLAYER_CELLS) return false;

    // Launch direction: use current movement direction, fallback to +x
    let lx = player.dirX;
    let lz = player.dirZ;
    const mag = Math.sqrt(lx * lx + lz * lz);
    if (mag < 0.01) {
      lx = 1;
      lz = 0;
    } else {
      lx /= mag;
      lz /= mag;
    }

    // Snapshot existing split cells BEFORE creating any new ones
    const existingSplits = [...this.splitCells.values()].filter(
      (c) => c.parentId === playerId && c.alive && c.mass >= SPLIT_MIN_MASS,
    );

    let splitsMade = 0;

    // Split main player blob
    if (player.mass >= SPLIT_MIN_MASS && totalCells < MAX_PLAYER_CELLS) {
      const halfMass = player.mass / 2;
      player.mass = halfMass;

      const cell = new SplitCell(
        player.id, player.x, player.z, halfMass,
        player.color, player.name, player.isBot,
        lx, lz, now + SPLIT_MERGE_DELAY,
      );
      this.splitCells.set(cell.id, cell);
      totalCells++;
      splitsMade++;
    }

    // Split each existing split cell (2→4, 4→8)
    for (const existing of existingSplits) {
      if (totalCells >= MAX_PLAYER_CELLS) break;

      const halfMass = existing.mass / 2;
      existing.mass = halfMass;
      existing.mergeAt = now + SPLIT_MERGE_DELAY; // reset merge timer

      const cell = new SplitCell(
        playerId, existing.x, existing.z, halfMass,
        player.color, player.name, player.isBot,
        lx, lz, now + SPLIT_MERGE_DELAY,
      );
      this.splitCells.set(cell.id, cell);
      totalCells++;
      splitsMade++;
    }

    if (splitsMade > 0) {
      player.setSplitCooldown(now);
    }

    return splitsMade > 0;
  }

  tick(dt: number, now: number): void {
    // 1. Update bot AI + process split decisions
    const pelletArr = this.pellets.getAllArray();
    const allPlayers = this.getAllPlayers();
    for (const bot of this.bots.values()) {
      const cellCount = this.getPlayerCellCount(bot.id);
      bot.updateAI(pelletArr, allPlayers, now, cellCount);
    }
    // Execute bot splits (separate pass so all AI decisions are made first)
    for (const bot of this.bots.values()) {
      if (bot.wantsSplit) {
        this.splitAllBlobs(bot.id, now);
        bot.wantsSplit = false;
      }
    }

    // 2. Copy parent direction to each split cell, then move
    for (const cell of this.splitCells.values()) {
      const parent = this.players.get(cell.parentId) ?? this.bots.get(cell.parentId);
      if (parent) {
        cell.dirX = parent.dirX;
        cell.dirZ = parent.dirZ;
      }
      cell.update(dt);
    }

    // 3. Move all players and bots (main blob gets same speed bonus as split cells when split)
    for (const entity of this.getAllPlayers()) {
      const hasSplitCells = this.getPlayerCellCount(entity.id) > 1;
      entity.update(dt, now, hasSplitCells);
    }

    // 4. Mass decay — large cells lose mass over time (prevents infinite growth)
    for (const entity of this.getAllEntities()) {
      if (!entity.alive) continue;
      const decayPerSec = getMassDecayPerSecond(entity.mass);
      if (decayPerSec > 0) {
        const decayAmount = decayPerSec * dt;
        entity.mass = Math.max(BASE_MASS, entity.mass - decayAmount);
      }
    }

    // 5. Sibling repulsion — push same-player blobs apart during cooldown
    this.applySiblingRepulsion(dt, now);

    // 6. Check pellet collisions (server-authoritative)
    const pelletSnapshot = this.pellets.getAllArray();
    for (const entity of this.getAllEntities()) {
      if (!entity.alive) continue;
      for (const pellet of pelletSnapshot) {
        if (checkPelletCollision(entity, pellet)) {
          if (this.pellets.eatPellet(pellet.id, entity.id)) {
            entity.addMass(pellet.mass);
          }
        }
      }
    }

    // 7. Check entity-vs-entity eating
    const all = this.getAllEntities();
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        if (checkPlayerEat(a, b)) {
          this.eatEntity(a, b, now);
        } else if (checkPlayerEat(b, a)) {
          this.eatEntity(b, a, now);
        }
      }
    }

    // 8. Overlap-based merge for split cells
    for (const [cellId, cell] of this.splitCells) {
      if (!cell.alive) {
        this.splitCells.delete(cellId);
        continue;
      }

      // Cell is not yet merge-ready
      if (now < cell.mergeAt) continue;

      const parent = this.players.get(cell.parentId) ?? this.bots.get(cell.parentId);
      if (!parent || !parent.alive) {
        // Orphaned cell — remove
        this.splitCells.delete(cellId);
        continue;
      }

      const dx = parent.x - cell.x;
      const dz = parent.z - cell.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Merge when sufficiently overlapping OR when grace period expired
      if (
        dist < parent.radius + cell.radius ||
        now >= cell.mergeAt + MERGE_OVERLAP_GRACE
      ) {
        parent.addMass(cell.mass);
        this.splitCells.delete(cellId);
      }
    }

    // 9. Process respawn queue
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      if (now >= this.respawnQueue[i].time) {
        const respawning = this.respawnQueue[i].player;
        respawning.respawn();
        if (this.players.has(respawning.id)) {
          this.pendingRespawns.push(respawning.id);
        }
        this.respawnQueue.splice(i, 1);
      }
    }

    // 10. Replenish pellets
    this.pellets.replenish();
  }

  /**
   * Push same-player blobs apart so they don't stack on top of each other.
   * Only applies during merge cooldown — once a cell is merge-ready, repulsion
   * stops so blobs naturally converge and merge on overlap.
   */
  private applySiblingRepulsion(dt: number, now: number): void {
    // Build flat list: { entity ref, owner id, merge-ready? }
    const blobs: { e: Collidable; owner: string; mergeReady: boolean }[] = [];

    for (const p of this.players.values()) {
      if (!p.alive) continue;
      blobs.push({ e: p, owner: p.id, mergeReady: false });
    }
    for (const b of this.bots.values()) {
      if (!b.alive) continue;
      blobs.push({ e: b, owner: b.id, mergeReady: false });
    }
    for (const c of this.splitCells.values()) {
      if (!c.alive) continue;
      blobs.push({ e: c, owner: c.parentId, mergeReady: now >= c.mergeAt });
    }

    for (let i = 0; i < blobs.length; i++) {
      for (let j = i + 1; j < blobs.length; j++) {
        const a = blobs[i];
        const b = blobs[j];
        if (a.owner !== b.owner) continue;

        // If either is merge-ready, stop repelling so they can converge
        if (a.mergeReady || b.mergeReady) continue;

        const dx = b.e.x - a.e.x;
        const dz = b.e.z - a.e.z;
        const dist = Math.sqrt(dx * dx + dz * dz) || 0.001;
        const minDist = a.e.radius + b.e.radius;

        if (dist < minDist) {
          const overlap = minDist - dist;
          const push = overlap * SIBLING_REPULSION * dt;
          const nx = dx / dist;
          const nz = dz / dist;

          a.e.x -= nx * push * 0.5;
          a.e.z -= nz * push * 0.5;
          b.e.x += nx * push * 0.5;
          b.e.z += nz * push * 0.5;
        }
      }
    }
  }

  private eatEntity(eater: Collidable, victim: Collidable, now: number): void {
    // Calculate victim's total mass BEFORE applying mass transfer
    let victimTotalMass = victim.mass;

    eater.addMass(victim.mass * 0.8);
    victim.die();

    // If victim is a split cell, just remove it (no respawn)
    if (this.splitCells.has(victim.id)) {
      this.splitCells.delete(victim.id);
      return;
    }

    // If victim is a player/bot, schedule respawn
    const victimPlayer = this.players.get(victim.id) ?? this.bots.get(victim.id);
    if (victimPlayer) {
      // Also remove any split cells belonging to the victim
      for (const [cellId, cell] of this.splitCells) {
        if (cell.parentId === victim.id) {
          victimTotalMass += cell.mass;
          eater.addMass(cell.mass * 0.8);
          this.splitCells.delete(cellId);
        }
      }

      // Find the killer's actual player identity
      const killerId = (eater.parentId != null) ? eater.parentId : eater.id;
      const killerPlayer =
        this.players.get(killerId) ?? this.bots.get(killerId);

      // Record death event for human players
      if (this.players.has(victim.id)) {
        this.pendingDeaths.push({
          victimId: victim.id,
          killerId,
          killerName: killerPlayer?.name ?? 'Unknown',
          finalScore: Math.floor(victimTotalMass),
        });
      }

      // Record high score for all entities
      this.recordHighScore(victimPlayer.name, victimTotalMass);

      this.respawnQueue.push({
        player: victimPlayer,
        time: now + RESPAWN_DELAY,
      });
    }
  }

  getLeaderboard(): LeaderboardEntry[] {
    // Aggregate split cell mass into parent for leaderboard
    const massBonus = new Map<string, number>();
    for (const cell of this.splitCells.values()) {
      massBonus.set(cell.parentId, (massBonus.get(cell.parentId) ?? 0) + cell.mass);
    }

    // Score = total mass (player mass + split cell mass)
    return this.getAllPlayers()
      .filter((e) => e.alive)
      .map((e) => ({
        id: e.id,
        name: e.name,
        score: e.mass + (massBonus.get(e.id) ?? 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  /**
   * Full new-game reset:
   *   1. Clear all split cells
   *   2. Clear respawn queue
   *   3. Reset every human player with random mass
   *   4. Remove all bots and re-spawn fresh bots with random mass
   *   5. Regenerate all pellets
   */
  resetWorld(): void {
    // 1. Wipe split cells
    this.splitCells.clear();

    // 2. Clear respawn queue
    this.respawnQueue = [];

    // 3. Reset human players
    for (const player of this.players.values()) {
      player.resetForNewGame();
    }

    // 4. Re-create bots with fresh random masses
    this.bots.clear();
    this.updateBots();
    // Override bot masses with random start mass
    for (const bot of this.bots.values()) {
      bot.resetForNewGame();
    }

    // 5. Regenerate pellets
    this.pellets.resetAll();
  }

  // ── High scores ─────────────────────────────────────

  private recordHighScore(name: string, score: number): void {
    this.sessionHighScores.push({ name, score: Math.floor(score) });
    this.sessionHighScores.sort((a, b) => b.score - a.score);
    if (this.sessionHighScores.length > 5) {
      this.sessionHighScores = this.sessionHighScores.slice(0, 5);
    }
  }

  getTopScores(): { name: string; score: number }[] {
    return [...this.sessionHighScores];
  }

  // ── Death / respawn event queues ───────────────────

  flushDeaths(): DeathEvent[] {
    const deaths = [...this.pendingDeaths];
    this.pendingDeaths = [];
    return deaths;
  }

  flushRespawns(): string[] {
    const respawns = [...this.pendingRespawns];
    this.pendingRespawns = [];
    return respawns;
  }

  // ── Pellet events ─────────────────────────────────

  flushPelletEvents(): PelletEvents {
    return this.pellets.flushEvents();
  }

  hasPelletEvents(): boolean {
    return this.pellets.hasEvents();
  }
}
