import { ARENA_HALF, EAT_RATIO, SPLIT_MIN_MASS, MAX_PLAYER_CELLS } from '@orbeats/shared';
import { Player } from './Player.js';
import type { Pellet } from './Pellet.js';

// ── AI split tuning ────────────────────────────────────
/** Distance within which a bot will attempt a split-kill. */
const SPLIT_ATTACK_RANGE = 25;
/** Per-decision probability of executing an attack split when conditions are met. */
const ATTACK_SPLIT_CHANCE = 0.30;
/** Per-decision probability of executing an escape split when threatened. */
const ESCAPE_SPLIT_CHANCE = 0.50;
/** Per-decision probability of splitting for pellet farming. */
const FARM_SPLIT_CHANCE = 0.10;
/** Minimum nearby pellets to consider a farming split. */
const FARM_PELLET_THRESHOLD = 8;
/** Mass range for farming splits. */
const FARM_MASS_MIN = 80;
const FARM_MASS_MAX = 300;
/** Threat ratio for escape split (enemy must be 30%+ bigger). */
const ESCAPE_THREAT_RATIO = 1.3;
/** Distance within which a large threat triggers escape-split consideration. */
const ESCAPE_DANGER_RANGE = 20;

/**
 * AI Bot: wanders toward nearby pellets, flees from larger players,
 * chases smaller players, and **splits strategically**:
 *   - Attack split: launch a half at a nearby weaker target
 *   - Farm split: split into 2 to collect pellets faster
 *   - Escape split: split to gain speed when a big threat is close
 */
export class Bot extends Player {
  private targetX: number = 0;
  private targetZ: number = 0;
  private nextDecisionTime: number = 0;

  /** Set to true when the AI decides to split this tick. World reads + resets it. */
  wantsSplit: boolean = false;

  constructor(id: string, name: string, initialMass?: number) {
    super(id, name, true, initialMass);
  }

  /**
   * Run one AI decision cycle.
   * @param cellCount how many blobs this bot currently owns (1 = no splits)
   */
  updateAI(pellets: Pellet[], allEntities: Player[], now: number, cellCount: number): void {
    if (!this.alive) return;
    this.wantsSplit = false;

    // Make decisions every 300-800ms
    if (now < this.nextDecisionTime) return;
    this.nextDecisionTime = now + 300 + Math.random() * 500;

    let bestTarget: { x: number; z: number } | null = null;
    let bestPriority = -Infinity;

    // Scan ranges
    const pelletScanRange = 60;
    const chaseScanRange = 50;
    const fleeScanRange = 40;

    // ── Data collected during scan for split decisions ──
    let nearbyPelletCount = 0;
    let splitAttackTarget: Player | null = null;
    let splitAttackDist = Infinity;
    let fleeThreat = false;

    // 1. Look for nearby pellets (low priority but common)
    for (const pellet of pellets) {
      const dx = pellet.x - this.x;
      const dz = pellet.z - this.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < pelletScanRange * pelletScanRange) {
        nearbyPelletCount++;
        const priority = 1 / (distSq + 1);
        if (priority > bestPriority) {
          bestPriority = priority;
          bestTarget = { x: pellet.x, z: pellet.z };
        }
      }
    }

    // 2. Look for smaller players to chase / bigger to flee
    for (const entity of allEntities) {
      if (entity.id === this.id || !entity.alive) continue;
      const dx = entity.x - this.x;
      const dz = entity.z - this.z;
      const distSq = dx * dx + dz * dz;

      // ── Chase smaller entities ──
      if (this.mass >= entity.mass * EAT_RATIO && distSq < chaseScanRange * chaseScanRange) {
        const priority = 10 / (distSq + 1);
        if (priority > bestPriority) {
          bestPriority = priority;
          bestTarget = { x: entity.x, z: entity.z };
        }

        // Could we split-kill this target?
        // After split our half must still be big enough to eat them:
        //   this.mass / 2 >= entity.mass * EAT_RATIO
        const dist = Math.sqrt(distSq);
        if (
          this.mass / 2 >= entity.mass * EAT_RATIO &&
          dist < SPLIT_ATTACK_RANGE &&
          dist < splitAttackDist
        ) {
          splitAttackTarget = entity;
          splitAttackDist = dist;
        }
      }

      // ── Flee from larger entities ──
      if (entity.mass >= this.mass * EAT_RATIO && distSq < fleeScanRange * fleeScanRange) {
        const priority = 20 / (distSq + 1);
        if (priority > bestPriority) {
          bestPriority = priority;
          bestTarget = { x: this.x - dx, z: this.z - dz };
        }

        // Track immediate threat for escape-split
        const dist = Math.sqrt(distSq);
        if (entity.mass >= this.mass * ESCAPE_THREAT_RATIO && dist < ESCAPE_DANGER_RANGE) {
          fleeThreat = true;
        }
      }
    }

    // 3. If no target found, wander randomly across the arena
    if (!bestTarget) {
      const wanderRange = ARENA_HALF * 0.8;
      bestTarget = {
        x: (Math.random() - 0.5) * wanderRange * 2,
        z: (Math.random() - 0.5) * wanderRange * 2,
      };
    }

    // Compute direction toward best movement target
    const dx = bestTarget.x - this.x;
    const dz = bestTarget.z - this.z;
    const mag = Math.sqrt(dx * dx + dz * dz);
    if (mag > 0.1) {
      this.dirX = dx / mag;
      this.dirZ = dz / mag;
    }

    // ── Split decision-making ───────────────────────────
    // Bail if split isn't possible right now
    if (!this.canSplit(now) || this.mass < SPLIT_MIN_MASS || cellCount >= MAX_PLAYER_CELLS) {
      return;
    }

    // Priority 1: Attack split — aim at prey and launch
    if (splitAttackTarget && Math.random() < ATTACK_SPLIT_CHANCE) {
      // Override direction to face the attack target precisely
      const atx = splitAttackTarget.x - this.x;
      const atz = splitAttackTarget.z - this.z;
      const atm = Math.sqrt(atx * atx + atz * atz);
      if (atm > 0.1) {
        this.dirX = atx / atm;
        this.dirZ = atz / atm;
      }
      this.wantsSplit = true;
      return;
    }

    // Priority 2: Escape split — gain speed to flee
    if (fleeThreat && cellCount <= 2 && Math.random() < ESCAPE_SPLIT_CHANCE) {
      this.wantsSplit = true;
      return;
    }

    // Priority 3: Farming split — split into 2 to cover more pellets
    if (
      cellCount === 1 &&
      this.mass >= FARM_MASS_MIN &&
      this.mass <= FARM_MASS_MAX &&
      nearbyPelletCount >= FARM_PELLET_THRESHOLD &&
      Math.random() < FARM_SPLIT_CHANCE
    ) {
      this.wantsSplit = true;
    }
  }
}
