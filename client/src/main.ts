import * as THREE from 'three';
import { SceneManager } from './scene/SceneManager.js';
import { PlayerMesh } from './scene/PlayerMesh.js';
import { EnemyMesh } from './scene/EnemyMesh.js';
import { PelletMeshManager } from './scene/PelletMesh.js';
import { NameTagManager } from './scene/NameLabel.js';
import { GameSocket } from './network/Socket.js';
import { Interpolation } from './network/Interpolation.js';
import { Prediction } from './network/Prediction.js';
import { PelletStore } from './network/PelletStore.js';
import { InputManager } from './input/InputManager.js';
import { HUD } from './ui/HUD.js';
import { MultiplierOverlay } from './ui/MultiplierOverlay.js';
import { saveBestScoreIfHigher, addScoresToTopScoresToday } from './ui/ScoreManager.js';
import { BASE_MASS, massToRadius, massToSpeed } from '@orbeats/shared';

// ── State ────────────────────────────────────────────
type GamePhase = 'PLAYING' | 'LEADERBOARD' | 'GAME_OVER' | 'MULTIPLIER';
let playerId: string | null = null;
let playerName: string = 'Anon';
let playerMass: number = BASE_MASS;
let playerScore: number = 0;
let playerAlive: boolean = true;
let inputFrozen: boolean = false;
let gamePhase: GamePhase = 'PLAYING';
let frozenFinalScore: number = 0;
let playerFrozen: boolean = false;
let sessionLocked: boolean = false;

// ── Initialize modules ───────────────────────────────
const sceneManager = new SceneManager();
const socket = new GameSocket();
const interpolation = new Interpolation();
const prediction = new Prediction();
const pelletStore = new PelletStore();
const input = new InputManager();
const hud = new HUD();
const multiplierOverlay = new MultiplierOverlay();

const playerMesh = new PlayerMesh(0xff3333);
const pelletManager = new PelletMeshManager(sceneManager.scene);
const enemyMeshes = new Map<string, EnemyMesh>();

// HTML overlay name tags (constant pixel size)
const nameTags = new NameTagManager(sceneManager.camera);

// Wire up New Game button (during PLAYING → trigger multiplier flow first)
hud.onNewGameClick = () => {
  if (gamePhase !== 'PLAYING') return;
  triggerGameOverFlow();
};

function triggerGameOverFlow(): void {
  if (sessionLocked) return;
  sessionLocked = true;
  const baseScore = playerScore;
  frozenFinalScore = baseScore;
  playerFrozen = true;
  inputFrozen = true;
  gamePhase = 'MULTIPLIER';
  deathKillerName = 'Session ended';
  deathTopScores = interpolation.leaderboard.map((e) => ({ name: e.name, score: e.score }));
  socket.sendInput(0, 0, prediction.nextSeq());
  multiplierOverlay.mount();
  multiplierOverlay.show(frozenFinalScore, (multiplier) => {
    const multipliedScore = Math.floor(frozenFinalScore * multiplier);
    frozenFinalScore = multipliedScore;
    addScoresToTopScoresToday([{ name: playerName, score: multipliedScore }]);
    saveBestScoreIfHigher(multipliedScore);
    multiplierOverlay.hide();
    gamePhase = 'GAME_OVER';
    hud.showDeathWithMultiplier(
      deathKillerName,
      multiplier,
      baseScore,
      multipliedScore,
      playerName,
      deathTopScores,
    );
  });
}

function resetGame(): void {
  hud.hideDeath();
  hud.hideLeaderboard();
  multiplierOverlay.hide();
  playerFrozen = false;
  sessionLocked = false;
  gamePhase = 'PLAYING';
  socket.sendNewGame();
}

// Wire up Start Match (on death overlay → reset)
hud.onStartMatch = () => {
  const scoreToSave = (gamePhase === 'GAME_OVER' || gamePhase === 'MULTIPLIER') ? frozenFinalScore : playerScore;
  saveBestScoreIfHigher(scoreToSave);
  resetGame();
};

// Additional player-owned split cell meshes (rendered as player-colored spheres)
const splitMeshes = new Map<string, PlayerMesh>();

// ── Merge animation system ──────────────────────────
/** Track last-known parentId for each rendered entity so we can
 *  detect merges when the entity disappears from the snapshot. */
const entityParentIds = new Map<string, string | null>();

interface MergeAnim {
  type: 'player' | 'enemy';
  object: THREE.Object3D; // the mesh/group in the scene
  startX: number;
  startZ: number;
  startScale: number;
  parentId: string; // entity to shrink toward
  startTime: number;
}
const MERGE_ANIM_DURATION = 300; // ms
const mergeAnims: MergeAnim[] = [];

// Smoothed velocity for camera (avoids jitter when starting/stopping)
let smoothedVelX = 0;
let smoothedVelZ = 0;
const VELOCITY_SMOOTHING = 0.2;
const VELOCITY_DEAD_ZONE = 0.001;

// Input sending throttle
const INPUT_SEND_RATE = 1000 / 30; // 30Hz
let lastInputSendTime = 0;

// ── Join Screen ──────────────────────────────────────
const joinScreen = document.getElementById('join-screen')!;
const joinBtn = document.getElementById('join-btn')!;
const nameInput = document.getElementById('name-input') as HTMLInputElement;

async function startGame(): Promise<void> {
  playerName = nameInput.value.trim() || 'Anon';

  try {
    const wsUrl = `ws://${window.location.hostname || 'localhost'}:3001`;
    await socket.connect(wsUrl);
    socket.sendJoin(playerName);

    joinScreen.style.display = 'none';
    hud.show();
  } catch (e) {
    console.error('Failed to connect:', e);
    alert('Could not connect to server. Make sure the server is running on port 3001.');
  }
}

joinBtn.addEventListener('click', startGame);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startGame();
});

// ── Socket handlers ──────────────────────────────────
socket.onWelcome = (msg) => {
  playerId = msg.playerId;
  hud.setPlayerId(msg.playerId);
  playerMesh.addToScene(sceneManager.scene);
  console.log(`[Game] Joined as ${playerId}, arena=${msg.arena}`);
};

socket.onSnapshot = (msg) => {
  if (gamePhase === 'GAME_OVER' || gamePhase === 'MULTIPLIER') return;
  interpolation.pushSnapshot(msg);
};

let deathKillerName = '';
let deathTopScores: { name: string; score: number }[] = [];

socket.onDeath = (msg) => {
  if (sessionLocked) return;
  sessionLocked = true;
  gamePhase = 'MULTIPLIER';
  playerAlive = false;
  inputFrozen = true;
  playerFrozen = true;
  frozenFinalScore = msg.finalScore;
  playerScore = msg.finalScore;
  deathKillerName = msg.killerName;
  deathTopScores = msg.topScores;
  socket.sendInput(0, 0, prediction.nextSeq());
  multiplierOverlay.mount();
  multiplierOverlay.show(msg.finalScore, (multiplier) => {
    frozenFinalScore = Math.floor(msg.finalScore * multiplier);
    playerScore = frozenFinalScore;
    addScoresToTopScoresToday([{ name: playerName, score: frozenFinalScore }]);
    saveBestScoreIfHigher(frozenFinalScore);
    gamePhase = 'GAME_OVER';
    multiplierOverlay.hide();
    hud.showDeathWithMultiplier(
      deathKillerName,
      multiplier,
      msg.finalScore,
      frozenFinalScore,
      playerName,
      deathTopScores,
    );
  });
};

socket.onRespawn = () => {
  playerAlive = true;
  // Input stays frozen until "Play Again" is clicked
};

socket.onNewGameStarted = () => {
  console.log('[Game] New game started — resetting client state');

  // Reset local state
  gamePhase = 'PLAYING';
  playerMass = BASE_MASS;
  playerScore = 0;
  playerAlive = true;
  inputFrozen = false;
  playerFrozen = false;
  sessionLocked = false;

  hud.hideDeath();
  hud.hideLeaderboard();

  // Clear network buffers
  interpolation.reset();
  prediction.reset();
  smoothedVelX = 0;
  smoothedVelZ = 0;

  // Remove all enemy meshes from scene
  for (const [id, enemy] of enemyMeshes) {
    enemy.removeFromScene(sceneManager.scene);
    enemyMeshes.delete(id);
  }

  // Remove all player split-cell meshes from scene
  for (const [id, mesh] of splitMeshes) {
    mesh.removeFromScene(sceneManager.scene);
    splitMeshes.delete(id);
  }

  // Clear all HTML name tags
  nameTags.clear();

  // Cancel all active merge animations
  for (const anim of mergeAnims) {
    sceneManager.scene.remove(anim.object);
  }
  mergeAnims.length = 0;
  entityParentIds.clear();

  // Pellet store will be replaced by the PelletSync that follows immediately
};

// ── Pellet event handlers ────────────────────────────
socket.onPelletSync = (msg) => {
  pelletStore.sync(msg.pellets);
};

socket.onPelletEaten = (msg) => {
  pelletStore.removeEaten(msg.pelletIds);
};

socket.onPelletSpawned = (msg) => {
  pelletStore.addSpawned(msg.pellets);
};

// ── Main game loop ───────────────────────────────────
let lastTime = performance.now();

function gameLoop(now: number): void {
  requestAnimationFrame(gameLoop);

  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (!playerId) {
    sceneManager.render();
    return;
  }

  if (sessionLocked || gamePhase === 'GAME_OVER' || gamePhase === 'LEADERBOARD' || gamePhase === 'MULTIPLIER') {
    const displayScore = gamePhase === 'GAME_OVER' ? frozenFinalScore : playerScore;
    hud.updateScore(displayScore);
    sceneManager.followTarget(prediction.renderX, prediction.renderZ, displayScore, dt);
    hud.updateLeaderboard(interpolation.leaderboard);
    sceneManager.render();
    return;
  }

  // ── 1. Update interpolation for remote entities ────
  interpolation.update();

  // ── 2. Check for new snapshot → reconcile once ─────
  const hasNew = interpolation.consumeNewSnapshot();

  if (hasNew && !playerFrozen) {
    // Find the main player entity (parentId === null, id === playerId)
    const myRawEntity = interpolation.latestEntities.find(
      (e) => e.id === playerId && e.parentId === null,
    );
    if (myRawEntity) {
      playerMass = myRawEntity.mass;
      playerAlive = myRawEntity.alive;

      if (myRawEntity.alive) {
        // Score = total mass of ALL owned blobs (main + split cells)
        playerScore = myRawEntity.mass;
        for (const e of interpolation.latestEntities) {
          if (e.parentId === playerId && e.alive) {
            playerScore += e.mass;
          }
        }
        const hasSplitCellsReconcile = interpolation.latestEntities.some(
          (e) => e.parentId === playerId && e.alive,
        );
        prediction.reconcile(
          myRawEntity.x,
          myRawEntity.z,
          myRawEntity.mass,
          interpolation.latestSeq,
          hasSplitCellsReconcile,
        );
      }
      // When dead: do NOT update playerScore; wait for Death message with finalScore
    }
  }

  // ── 3. Input ───────────────────────────────────────
  if (!inputFrozen) {
    input.update(sceneManager.camera, prediction.renderX, prediction.renderZ);

    if (now - lastInputSendTime >= INPUT_SEND_RATE) {
      const seq = prediction.nextSeq();
      socket.sendInput(input.dirX, input.dirZ, seq);
      lastInputSendTime = now;
    }
  }

  // ── 3b. Split (spacebar) ───────────────────────────
  if (!inputFrozen && input.consumeSplit() && playerAlive) {
    socket.sendSplit();
  }

  // ── 4. Client-side prediction (every frame) ────────
  const hasSplitCells = interpolation.entities.some((e) => e.parentId === playerId && e.alive);
  if (!inputFrozen && !playerFrozen) {
    prediction.applyInput(input.dirX, input.dirZ, dt, playerMass, hasSplitCells);
  }

  // ── 5. Update player mesh at VISUAL position ──────
  if (playerAlive) {
    playerMesh.update(prediction.renderX, prediction.renderZ, playerMass, dt);
    playerMesh.mesh.visible = true;

    // Player name tag (HTML overlay)
    const pr = massToRadius(playerMass);
    nameTags.update(
      playerId,
      playerName,
      playerMesh.mesh.position.x,
      playerMesh.mesh.position.y + pr + 0.5,
      playerMesh.mesh.position.z,
    );
  } else {
    playerMesh.mesh.visible = false;
  }

  // ── 6. Update remote entities + own split cells ────
  const activeEnemyIds = new Set<string>();
  const activeSplitIds = new Set<string>();

  for (const entity of interpolation.entities) {
    if (!entity.alive) continue;

    // Track parentId for merge detection later
    entityParentIds.set(entity.id, entity.parentId);

    // Skip the main player entity (rendered via prediction)
    if (entity.id === playerId && entity.parentId === null) continue;

    // My own split cells → render as player-colored spheres
    if (entity.parentId === playerId) {
      activeSplitIds.add(entity.id);

      let mesh = splitMeshes.get(entity.id);
      if (!mesh) {
        mesh = new PlayerMesh(0xff3333);
        mesh.addToScene(sceneManager.scene);
        splitMeshes.set(entity.id, mesh);
      }
      mesh.update(entity.x, entity.z, entity.mass, dt);
      mesh.mesh.visible = true;

      // Split cell name tag
      const sr = massToRadius(entity.mass);
      nameTags.update(
        entity.id,
        playerName,
        mesh.mesh.position.x,
        mesh.mesh.position.y + sr + 0.5,
        mesh.mesh.position.z,
      );

      continue;
    }

    // Other entities → enemies
    activeEnemyIds.add(entity.id);

    let enemy = enemyMeshes.get(entity.id);
    if (!enemy) {
      enemy = new EnemyMesh(entity.color);
      enemy.addToScene(sceneManager.scene);
      enemyMeshes.set(entity.id, enemy);
    }

    enemy.update(entity.x, entity.z, entity.mass, dt);
    enemy.setColor(entity.color);

    // Enemy name tag
    nameTags.update(
      entity.id,
      entity.name,
      enemy.group.position.x,
      enemy.group.position.y + enemy.sphere.scale.x + 0.5,
      enemy.group.position.z,
    );
  }

  // Clean up removed enemies — start merge anim if it was a split cell
  for (const [id, enemy] of enemyMeshes) {
    if (!activeEnemyIds.has(id)) {
      const parentId = entityParentIds.get(id);
      if (parentId) {
        // This was a split cell that merged/disappeared → animate
        mergeAnims.push({
          type: 'enemy',
          object: enemy.group,
          startX: enemy.group.position.x,
          startZ: enemy.group.position.z,
          startScale: enemy.sphere.scale.x,
          parentId,
          startTime: now,
        });
        // Detach from tracked map but keep in scene for animation
        enemyMeshes.delete(id);
      } else {
        enemy.removeFromScene(sceneManager.scene);
        enemyMeshes.delete(id);
      }
      entityParentIds.delete(id);
    }
  }

  // Clean up merged/eaten split cells — start merge anim
  for (const [id, mesh] of splitMeshes) {
    if (!activeSplitIds.has(id)) {
      const parentId = entityParentIds.get(id) ?? playerId;
      mergeAnims.push({
        type: 'player',
        object: mesh.mesh,
        startX: mesh.mesh.position.x,
        startZ: mesh.mesh.position.z,
        startScale: mesh.mesh.scale.x,
        parentId: parentId!,
        startTime: now,
      });
      splitMeshes.delete(id);
      entityParentIds.delete(id);
    }
  }

  // ── 6b. Update merge animations ───────────────────
  for (let i = mergeAnims.length - 1; i >= 0; i--) {
    const anim = mergeAnims[i];
    const elapsed = now - anim.startTime;
    const t = Math.min(elapsed / MERGE_ANIM_DURATION, 1);
    // Ease-in curve for smooth acceleration toward parent
    const ease = t * t;

    // Find the parent entity's current visual position
    let targetX = anim.startX;
    let targetZ = anim.startZ;
    if (anim.parentId === playerId) {
      targetX = prediction.renderX;
      targetZ = prediction.renderZ;
    } else {
      const parentEntity = interpolation.entities.find((e) => e.id === anim.parentId);
      if (parentEntity) {
        targetX = parentEntity.x;
        targetZ = parentEntity.z;
      }
    }

    // Lerp position toward parent + shrink scale to zero
    const ax = anim.startX + (targetX - anim.startX) * ease;
    const az = anim.startZ + (targetZ - anim.startZ) * ease;
    const scale = Math.max(0.01, anim.startScale * (1 - ease));
    // y = scale keeps the sphere sitting on the ground as it shrinks
    anim.object.position.set(ax, scale, az);
    if (anim.object instanceof THREE.Group) {
      // EnemyMesh group: scale the sphere child
      anim.object.children[0].scale.setScalar(scale);
      // Face sprite
      if (anim.object.children[1]) {
        (anim.object.children[1] as THREE.Sprite).scale.setScalar(scale * 1.3);
      }
    } else {
      anim.object.scale.setScalar(scale);
    }

    if (t >= 1) {
      // Animation complete → remove from scene
      sceneManager.scene.remove(anim.object);
      mergeAnims.splice(i, 1);
    }
  }

  // ── 6c. Clean up stale name tags ──────────────────
  nameTags.endFrame();

  // ── 7. Update pellets from event-driven store ──────
  pelletManager.update(pelletStore.getArray(), pelletStore.version);

  // ── 8. Camera follows VISUAL position ──────────────
  const speed = massToSpeed(playerMass);
  const targetVelX = input.dirX * speed;
  const targetVelZ = input.dirZ * speed;
  smoothedVelX += (targetVelX - smoothedVelX) * VELOCITY_SMOOTHING;
  smoothedVelZ += (targetVelZ - smoothedVelZ) * VELOCITY_SMOOTHING;
  if (Math.abs(smoothedVelX) < VELOCITY_DEAD_ZONE) smoothedVelX = 0;
  if (Math.abs(smoothedVelZ) < VELOCITY_DEAD_ZONE) smoothedVelZ = 0;
  sceneManager.followTarget(prediction.renderX, prediction.renderZ, playerMass, dt, smoothedVelX, smoothedVelZ);

  // ── 9. HUD ─────────────────────────────────────────
  hud.updateScore(playerScore);
  hud.updateLeaderboard(interpolation.leaderboard);

  // ── 10. Render ─────────────────────────────────────
  sceneManager.render();
}

requestAnimationFrame(gameLoop);
