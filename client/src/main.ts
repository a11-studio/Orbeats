// ── Wiring diagram ───────────────────────────────────────────────────────
// analytics         → mountAnalytics()        mounts isolated Vercel React root
// state             → createGameState()        all mutable session/player state
// sceneManager      → SceneManager             Three.js render + camera follow
// socket            → GameSocket               WS transport + typed handlers
// interpolation     → Interpolation            remote entity smooth-buffer (100 ms behind)
// prediction        → Prediction               client-side dead-reckoning
// pelletStore       → PelletStore              event-driven pellet registry
// input             → InputManager             mouse/touch → normalized dir vector
// hud               → HUD                      score, leaderboard, death overlay
// multiplierOverlay → MultiplierOverlay         post-death skill mini-game
// sessionTimeline   → SessionTimeline           bottom-right progress bar + End Game morph
// mergeAnim         → MergeAnimManager  (step 5) split-cell shrink animations
// joinScreen        → setupJoinScreen() (step 3) join DOM wiring
// ────────────────────────────────────────────────────────────────────────

import { mountAnalytics } from './integrations/analytics.js';
import { createGameState } from './core/gameState.js';
import { runMultiplierFlow, type GameOverReadyParams } from './core/gameOver.js';
import type { GameOverDeps } from './core/gameOver.js';
import { SceneManager } from './scene/SceneManager.js';
import { MergeAnimManager } from './scene/MergeAnimManager.js';
import { PlayerMesh } from './scene/PlayerMesh.js';
import { EnemyMesh } from './scene/EnemyMesh.js';
import { PelletMeshManager } from './scene/PelletMesh.js';
import { NameTagManager } from './scene/NameLabel.js';
import { GameSocket } from './network/Socket.js';
import { Interpolation } from './network/Interpolation.js';
import { Prediction } from './network/Prediction.js';
import { PelletStore } from './network/PelletStore.js';
import { InputManager } from './input/InputManager.js';
import { setupDoubleTapSplit } from './input/DoubleTapSplit.js';
import { HUD } from './ui/HUD.js';
import { MultiplierOverlay } from './ui/MultiplierOverlay.js';
import { DeathFadeOverlay } from './ui/DeathFadeOverlay.js';
import { SessionTimeline } from './ui/SessionTimeline.js';
import { saveBestScoreIfHigher } from './ui/ScoreManager.js';
import { setupJoinScreen } from './ui/JoinScreen.js';
import { getWsUrl, normalizeWsUrl } from './utils/wsUrl.js';
import { isMobile } from './utils/deviceUtils.js';
import { markClick, markWsOpen, markWelcome, markGameplayReady } from './utils/startupTiming.js';
import { APP_VERSION, BASE_MASS, massToRadius, massToSpeed } from '@orbeats/shared';

mountAnalytics();
console.log(`[Game] Client version=${APP_VERSION}`);

// ── State ────────────────────────────────────────────
const state = createGameState();

// ── Initialize modules ───────────────────────────────
const sceneManager = new SceneManager();
const socket = new GameSocket();
const interpolation = new Interpolation();
const prediction = new Prediction();
const pelletStore = new PelletStore();
const input = new InputManager();
const hud = new HUD();
const multiplierOverlay = new MultiplierOverlay();
const sessionTimeline = new SessionTimeline();
const deathFadeOverlay = new DeathFadeOverlay();

// Pending game-over overlay: waiting for TopScoresResponse from server
let pendingGameOverShow: GameOverReadyParams | null = null;
let pendingGameOverTimeout: ReturnType<typeof setTimeout> | null = null;
const TOP_SCORES_REQUEST_TIMEOUT_MS = 2000;

function showGameOverWithFallbackScores(): void {
  if (!pendingGameOverShow) return;
  const p = pendingGameOverShow;
  pendingGameOverShow = null;
  if (pendingGameOverTimeout) {
    clearTimeout(pendingGameOverTimeout);
    pendingGameOverTimeout = null;
  }
  hud.showDeathWithMultiplier(
    p.killerName,
    p.multiplier,
    p.baseScore,
    p.multipliedScore,
    p.playerName,
    state.deathTopScores,
    undefined, // use localStorage fallback
  );
}

// Shared deps for the game-over multiplier flow
const gameOverDeps: GameOverDeps = {
  state,
  socket,
  multiplierOverlay,
  hud,
  deathFadeOverlay,
  onGameOverReadyToShow: (params) => {
    pendingGameOverShow = params;
    pendingGameOverTimeout = setTimeout(showGameOverWithFallbackScores, TOP_SCORES_REQUEST_TIMEOUT_MS);
  },
};

const playerMesh = new PlayerMesh(0xff3333);
const pelletManager = new PelletMeshManager(sceneManager.scene);
const enemyMeshes = new Map<string, EnemyMesh>();

// HTML overlay name tags (constant pixel size)
const nameTags = new NameTagManager(sceneManager.camera);

/** Frozen label position when player dies — keeps label above blob during fade. */
let playerDeathLabelAnchor: { x: number; y: number; z: number } | null = null;

// Double-tap to split on mobile (attached to canvas)
setupDoubleTapSplit(
  sceneManager.renderer.domElement,
  () =>
    isMobile() &&
    state.gamePhase === 'PLAYING' &&
    state.playerAlive &&
    !state.inputFrozen,
  () => input.requestSplit(),
);

// Wire up End Game (timeline hover-morph / mobile menu) → multiplier flow first
sessionTimeline.onEndGameClick = () => {
  if (state.gamePhase !== 'PLAYING') return;
  triggerGameOverFlow();
};

function triggerGameOverFlow(): void {
  if (state.sessionLocked) return;
  state.sessionLocked = true;
  const baseScore = state.playerScore;
  state.frozenFinalScore = baseScore;
  state.playerFrozen = true;
  state.inputFrozen = true;
  state.gamePhase = 'MULTIPLIER';
  state.deathKillerName = 'Session ended';
  state.deathTopScores = state.liveLeaderboard.map((e) => ({ name: e.name, score: e.score }));
  socket.sendInput(0, 0, prediction.nextSeq());
  deathFadeOverlay.mount();
  deathFadeOverlay.play(() => runMultiplierFlow(baseScore, state.sessionId, gameOverDeps));
}

function resetGame(): void {
  hud.hideDeath();
  hud.hideLeaderboard();
  multiplierOverlay.hide();
  playerDeathLabelAnchor = null;
  state.playerFrozen = false;
  state.sessionLocked = false;
  state.gamePhase = 'PLAYING';
  socket.sendNewGame();
}

// Wire up Start Match (on death overlay → reset)
hud.onStartMatch = () => {
  const scoreToSave = (state.gamePhase === 'GAME_OVER' || state.gamePhase === 'MULTIPLIER')
    ? state.frozenFinalScore
    : state.playerScore;
  saveBestScoreIfHigher(scoreToSave);
  resetGame();
};

// Additional player-owned split cell meshes (rendered as player-colored spheres)
const splitMeshes = new Map<string, PlayerMesh>();

// ── Merge animation system ──────────────────────────
const mergeAnimManager = new MergeAnimManager();

// Velocity smoothing constants (camera)
const VELOCITY_SMOOTHING = 0.2;
const VELOCITY_DEAD_ZONE = 0.001;

const DEBUG_LOCAL_PATH =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('debug_local_path') === '1';
let lastPathDebugLogTime = 0;
let snapCountLastSecond = 0;
let snapCountResetTime = 0;
let pathDebugEl: HTMLElement | null = null;

// Input sending throttle
const INPUT_SEND_RATE = 1000 / 30; // 30Hz

// ── Join Screen ──────────────────────────────────────
const joinScreen = document.getElementById('join-screen')!;
const joinError = document.getElementById('join-error')!;

function showJoinError(msg: string): void {
  joinError.textContent = msg;
  joinError.style.display = '';
}

const joinBtn = document.getElementById('join-btn')!;

setupJoinScreen({
  onJoin: async (playerName) => {
    joinError.textContent = '';
    joinError.style.display = 'none';
    state.playerName = playerName;

    const rawUrl = getWsUrl();
    if (!rawUrl) {
      showJoinError(
        "Multiplayer server isn't configured for production yet. Set VITE_WS_URL to a wss:// endpoint.",
      );
      return;
    }

    const wsUrl = normalizeWsUrl(rawUrl);
    markClick();

    joinBtn.innerHTML = '<span class="join-spinner"></span>';
    joinBtn.setAttribute('disabled', 'true');

    try {
      await socket.connect(wsUrl);
      socket.sendJoin(state.playerName);
      // Join screen stays visible until PelletSync arrives (gate gameplay on initial data)
      // Fallback: show game after 8s if PelletSync never arrives (avoids stuck state)
      setTimeout(() => {
        if (state.playerId && !joinScreen.classList.contains('hidden')) {
          console.warn('[Game] PelletSync timeout — showing game without pellets');
          joinBtn.innerHTML = 'PLAY';
          joinBtn.removeAttribute('disabled');
          joinScreen.classList.add('hidden');
          hud.show();
          markGameplayReady();
        }
      }, 8000);
    } catch (e) {
      console.error('Failed to connect:', e);
      showJoinError('Could not connect to server. Make sure the server is running.');
      joinBtn.innerHTML = 'PLAY';
      joinBtn.removeAttribute('disabled');
    }
  },
  showError: showJoinError,
  onPreconnect: () => {
    const rawUrl = getWsUrl();
    if (rawUrl) socket.connect(normalizeWsUrl(rawUrl));
  },
});

// Preconnect on load so session starts loading while user enters name (arena visible in background)
const initialWsUrl = getWsUrl();
if (initialWsUrl) socket.connect(normalizeWsUrl(initialWsUrl));

// ── Socket handlers ──────────────────────────────────
socket.onWsOpen = () => markWsOpen();
socket.onWelcome = (msg) => {
  markWelcome();
  state.playerId = msg.playerId;
  hud.setPlayerId(msg.playerId);
  playerMesh.addToScene(sceneManager.scene);
  state.sessionEndsAt = msg.sessionEndsAt;
  state.sessionId = msg.sessionId;
  sessionTimeline.setVisible(true);
  const serverVer = (msg as { version?: string }).version;
  console.log(
    `[Game] Welcome received playerId=${state.playerId} sessionId=${state.sessionId} arena=${msg.arena} serverVersion=${serverVer ?? '?'} clientVersion=${APP_VERSION} isMobile=${isMobile()}`,
  );
  if (serverVer && serverVer !== APP_VERSION) {
    console.warn(`[Game] Version mismatch: client=${APP_VERSION} server=${serverVer}`);
  }
  // If PelletSync already arrived (unlikely), show game now
  if (pelletStore.size > 0 && !joinScreen.classList.contains('hidden')) {
    joinBtn.innerHTML = 'PLAY';
    joinBtn.removeAttribute('disabled');
    joinScreen.classList.add('hidden');
    hud.show();
    markGameplayReady();
  }
};

socket.onSnapshot = (msg) => {
  if (state.gamePhase === 'GAME_OVER' || state.gamePhase === 'MULTIPLIER') return;
  interpolation.pushSnapshot(msg);
};
const DEBUG_LEADERBOARD =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug_leaderboard') === '1';

socket.onLeaderboard = (msg) => {
  state.liveLeaderboard = msg.leaderboard;
  if (DEBUG_LEADERBOARD) {
    console.log(
      `[Leaderboard DEBUG] source=LIVE playerId=${state.playerId} sessionId=${state.sessionId} isMobile=${isMobile()} rows=${msg.leaderboard.length} entries=${JSON.stringify(msg.leaderboard.map((e) => ({ id: e.id, name: e.name, score: Math.floor(e.score) })))}`,
    );
  } else if (import.meta.env?.DEV) {
    console.log(`[Leaderboard] liveLeaderboard updated rows=${state.liveLeaderboard.length}`);
  }
};

socket.onTopScoresResponse = (msg) => {
  if (!pendingGameOverShow) return;
  const p = pendingGameOverShow;
  pendingGameOverShow = null;
  if (pendingGameOverTimeout) {
    clearTimeout(pendingGameOverTimeout);
    pendingGameOverTimeout = null;
  }
  hud.showDeathWithMultiplier(
    p.killerName,
    p.multiplier,
    p.baseScore,
    p.multipliedScore,
    p.playerName,
    state.deathTopScores,
    msg.scores,
  );
};

socket.onDeath = (msg) => {
  if (state.sessionLocked) return;
  state.sessionLocked = true;
  state.gamePhase = 'MULTIPLIER';
  state.playerAlive = false;
  state.inputFrozen = true;
  state.playerFrozen = true;
  state.frozenFinalScore = msg.finalScore;
  state.playerScore = msg.finalScore;
  state.deathKillerName = msg.killerName;
  state.deathTopScores = msg.topScores;
  socket.sendInput(0, 0, prediction.nextSeq());

  const pr = massToRadius(state.playerMass);
  playerDeathLabelAnchor = {
    x: playerMesh.mesh.position.x,
    y: playerMesh.mesh.position.y + pr + 0.5,
    z: playerMesh.mesh.position.z,
  };

  playerMesh.mesh.visible = false;
  mergeAnimManager.startBurst(
    sceneManager.scene,
    playerMesh.mesh.position.x,
    playerMesh.mesh.position.y,
    playerMesh.mesh.position.z,
    pr,
    0xff3333,
  );

  deathFadeOverlay.mount();
  deathFadeOverlay.play(() => {
    runMultiplierFlow(msg.finalScore, state.sessionId, gameOverDeps, (multipliedScore) => {
      state.playerScore = multipliedScore;
      playerDeathLabelAnchor = null;
    });
  });
};

socket.onRespawn = () => {
  state.playerAlive = true;
  // Input stays frozen until "Play Again" is clicked
};

socket.onNewGameStarted = () => {
  console.log('[Game] New game started — resetting client state (per-player respawn)');

  // Reset local state
  state.gamePhase = 'PLAYING';
  state.playerMass = BASE_MASS;
  state.playerScore = 0;
  state.playerAlive = true;
  state.inputFrozen = false;
  state.playerFrozen = false;
  state.sessionLocked = false;

  hud.hideDeath();
  hud.hideLeaderboard();
  deathFadeOverlay.hide();
  playerDeathLabelAnchor = null;

  // Clear network buffers
  interpolation.reset();
  prediction.reset();
  state.liveLeaderboard = [];
  state.smoothedVelX = 0;
  state.smoothedVelZ = 0;

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
  mergeAnimManager.clearAll(sceneManager.scene);

  // Pellet store unchanged (per-player respawn; pellets not regenerated)
};

// ── Room session ended (timer expiry → Game Over for all) ─────────
socket.onRoomSessionEnded = (msg) => {
  console.log(
    `[Game] RoomSessionEnded received sessionId=${msg.sessionId} sessionEndsAt=${msg.sessionEndsAt} socketOpen=${socket.connected}`,
  );
  if (msg.sessionId <= state.sessionId) return; // Guard against duplicate
  const endedSessionId = msg.sessionId - 1; // Session we just finished (server sends new id)
  state.sessionId = msg.sessionId;
  state.sessionEndsAt = msg.sessionEndsAt;

  console.log('[Game] Session ended — showing Game Over');
  if (state.sessionLocked) return;
  state.sessionLocked = true;

  const baseScore = state.playerScore;
  state.frozenFinalScore = baseScore;
  state.playerFrozen = true;
  state.inputFrozen = true;
  state.gamePhase = 'MULTIPLIER';
  state.deathKillerName = 'Session ended';
  state.deathTopScores = state.liveLeaderboard.map((e) => ({ name: e.name, score: e.score }));
  socket.sendInput(0, 0, prediction.nextSeq());

  // Clear scene so we're clean for Start New Game
  interpolation.reset();
  prediction.reset();
  state.smoothedVelX = 0;
  state.smoothedVelZ = 0;
  for (const [id, enemy] of enemyMeshes) {
    enemy.removeFromScene(sceneManager.scene);
    enemyMeshes.delete(id);
  }
  for (const [id, mesh] of splitMeshes) {
    mesh.removeFromScene(sceneManager.scene);
    splitMeshes.delete(id);
  }
  nameTags.clear();
  mergeAnimManager.clearAll(sceneManager.scene);
  deathFadeOverlay.hide();
  playerDeathLabelAnchor = null;

  console.log(
    `[Game] gameOver flow starting (multiplier) socketOpen=${socket.connected}`,
  );
  deathFadeOverlay.mount();
  deathFadeOverlay.play(() => runMultiplierFlow(baseScore, endedSessionId, gameOverDeps));
};

// ── Pellet event handlers ────────────────────────────
socket.onPelletSync = (msg) => {
  pelletStore.sync(msg.pellets);
  const t = Date.now();
  console.log(`[Game] PelletSync received pellets=${msg.pellets.length} t=${t}`);
  // Gate gameplay: hide join screen only after initial pellet sync (ensures pellets visible on start)
  if (state.playerId && !joinScreen.classList.contains('hidden')) {
    joinBtn.innerHTML = 'PLAY';
    joinBtn.removeAttribute('disabled');
    joinScreen.classList.add('hidden');
    hud.show();
    markGameplayReady();
  }
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

  if (!state.playerId) {
    sceneManager.render();
    return;
  }

  if (state.sessionLocked || state.gamePhase === 'GAME_OVER' || state.gamePhase === 'LEADERBOARD' || state.gamePhase === 'MULTIPLIER') {
    sessionTimeline.setVisible(false);
    const displayScore = state.gamePhase === 'GAME_OVER' ? state.frozenFinalScore : state.playerScore;
    hud.updateScore(displayScore);
    sceneManager.followTarget(prediction.renderX, prediction.renderZ, displayScore, dt);
    hud.updateLeaderboard(state.liveLeaderboard, { isMobile: isMobile(), isInGame: false });
    // Keep all labels visible (player, our split cells, opponents + their split cells) — update from interpolation
    interpolation.update();

    mergeAnimManager.update(
      state.playerId!,
      prediction.renderX,
      prediction.renderZ,
      interpolation.entities,
      sceneManager.scene,
      now,
    );

    if (playerDeathLabelAnchor && state.playerId) {
      nameTags.update(state.playerId, state.playerName, playerDeathLabelAnchor.x, playerDeathLabelAnchor.y, playerDeathLabelAnchor.z);
    }
    for (const entity of interpolation.entities) {
      if (!entity.alive) continue;
      if (entity.id === state.playerId && entity.parentId === null) continue;
      if (entity.parentId === state.playerId) {
        let mesh = splitMeshes.get(entity.id);
        if (!mesh) {
          mesh = new PlayerMesh(0xff3333);
          mesh.addToScene(sceneManager.scene);
          splitMeshes.set(entity.id, mesh);
        }
        mesh.update(entity.x, entity.z, entity.mass, dt);
        mesh.mesh.visible = true;
        const sr = massToRadius(entity.mass);
        nameTags.update(entity.id, state.playerName, mesh.mesh.position.x, mesh.mesh.position.y + sr + 0.5, mesh.mesh.position.z);
        continue;
      }
      let enemy = enemyMeshes.get(entity.id);
      if (!enemy) {
        enemy = new EnemyMesh(entity.color);
        enemy.addToScene(sceneManager.scene);
        enemyMeshes.set(entity.id, enemy);
      }
      enemy.update(entity.x, entity.z, entity.mass, dt);
      enemy.setColor(entity.color);
      nameTags.update(
        entity.id,
        entity.name,
        enemy.group.position.x,
        enemy.group.position.y + enemy.sphere.scale.x + 0.5,
        enemy.group.position.z,
      );
    }
    nameTags.endFrame();
    sceneManager.render();
    return;
  }

  sessionTimeline.setVisible(true);

  // ── Session timer (PLAYING only) — server-authoritative; no client expiry trigger ─────────
  if (state.sessionEndsAt > 0) {
    sessionTimeline.update(state.sessionEndsAt);
  }

  // ── 1. Update interpolation for remote entities ────
  interpolation.update();

  // ── 2. Check for new snapshot → reconcile once ─────
  const hasNew = interpolation.consumeNewSnapshot();

  if (hasNew && !state.playerFrozen) {
    // Find the main player entity (parentId === null, id === playerId)
    const myRawEntity = interpolation.latestEntities.find(
      (e) => e.id === state.playerId && e.parentId === null,
    );
    if (myRawEntity) {
      state.playerMass = myRawEntity.mass;
      state.playerAlive = myRawEntity.alive;

      if (myRawEntity.alive) {
        // Score = total mass of ALL owned blobs (main + split cells)
        state.playerScore = myRawEntity.mass;
        for (const e of interpolation.latestEntities) {
          if (e.parentId === state.playerId && e.alive) {
            state.playerScore += e.mass;
          }
        }
        const hasSplitCellsReconcile = interpolation.latestEntities.some(
          (e) => e.parentId === state.playerId && e.alive,
        );
        prediction.reconcile(
          myRawEntity.x,
          myRawEntity.z,
          myRawEntity.mass,
          interpolation.latestSeq,
          hasSplitCellsReconcile,
        );
        if (DEBUG_LOCAL_PATH && prediction.lastReconcileWasSnap) {
          const t = performance.now();
          if (t - snapCountResetTime > 1000) {
            snapCountLastSecond = 0;
            snapCountResetTime = t;
          }
          snapCountLastSecond++;
        }
      }
      // When dead: do NOT update playerScore; wait for Death message with finalScore
    }
  }

  // ── 3. Input ───────────────────────────────────────
  if (!state.inputFrozen) {
    input.update(sceneManager.camera, prediction.renderX, prediction.renderZ);

    if (now - state.lastInputSendTime >= INPUT_SEND_RATE) {
      const seq = prediction.nextSeq();
      socket.sendInput(input.dirX, input.dirZ, seq);
      state.lastInputSendTime = now;
    }
  }

  // ── 3b. Split (spacebar) ───────────────────────────
  if (!state.inputFrozen && input.consumeSplit() && state.playerAlive) {
    socket.sendSplit();
  }

  // ── 4. Client-side prediction (every frame) ────────
  const hasSplitCells = interpolation.entities.some((e) => e.parentId === state.playerId && e.alive);
  if (!state.inputFrozen && !state.playerFrozen) {
    prediction.applyInput(input.dirX, input.dirZ, dt, state.playerMass, hasSplitCells);
  }
  prediction.updateCorrection(dt);

  // ── 5. Update player mesh at VISUAL position ──────
  if (state.playerAlive) {
    playerMesh.update(prediction.renderX, prediction.renderZ, state.playerMass, dt);
    playerMesh.mesh.visible = true;

    // Player name tag (HTML overlay)
    const pr = massToRadius(state.playerMass);
    nameTags.update(
      state.playerId!,
      state.playerName,
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
    mergeAnimManager.trackEntity(entity.id, entity.parentId);

    // Skip the main player entity (rendered via prediction)
    if (entity.id === state.playerId && entity.parentId === null) continue;

    // My own split cells → render as player-colored spheres
    if (entity.parentId === state.playerId) {
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
        state.playerName,
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

  // Clean up removed enemies / merged split cells — start merge animations
  mergeAnimManager.pruneEnemies(activeEnemyIds, enemyMeshes, sceneManager.scene, now);
  mergeAnimManager.pruneSplitCells(activeSplitIds, splitMeshes, state.playerId!, now);

  // ── 6b. Advance merge animations ──────────────────
  mergeAnimManager.update(state.playerId!, prediction.renderX, prediction.renderZ, interpolation.entities, sceneManager.scene, now);

  // ── 6c. Clean up stale name tags ──────────────────
  nameTags.endFrame();

  // ── 7. Update pellets from event-driven store ──────
  pelletManager.update(pelletStore.getArray(), pelletStore.version);

  // ── 8. Camera follows final mesh position ──────────
  const speed = massToSpeed(state.playerMass);
  const targetVelX = input.dirX * speed;
  const targetVelZ = input.dirZ * speed;
  state.smoothedVelX += (targetVelX - state.smoothedVelX) * VELOCITY_SMOOTHING;
  state.smoothedVelZ += (targetVelZ - state.smoothedVelZ) * VELOCITY_SMOOTHING;
  if (Math.abs(state.smoothedVelX) < VELOCITY_DEAD_ZONE) state.smoothedVelX = 0;
  if (Math.abs(state.smoothedVelZ) < VELOCITY_DEAD_ZONE) state.smoothedVelZ = 0;
  const camX = prediction.renderX;
  const camZ = prediction.renderZ;
  sceneManager.followTarget(camX, camZ, state.playerMass, dt, state.smoothedVelX, state.smoothedVelZ);

  if (DEBUG_LOCAL_PATH && state.playerId && now - lastPathDebugLogTime > 100) {
    lastPathDebugLogTime = now;
    console.log(
      `[LocalPath] auth=(${prediction.authoritativeX.toFixed(1)},${prediction.authoritativeZ.toFixed(1)}) ` +
        `pred=(${prediction.predictedX.toFixed(1)},${prediction.predictedZ.toFixed(1)}) ` +
        `visual=(${prediction.renderX.toFixed(1)},${prediction.renderZ.toFixed(1)}) ` +
        `corr=${prediction.correctionMagnitude.toFixed(2)} delta=${prediction.visualAuthDelta.toFixed(2)} ` +
        `snap=${prediction.lastReconcileWasSnap} snaps/s=${now - snapCountResetTime < 1000 ? snapCountLastSecond : 0}`,
    );
  }

  if (DEBUG_LOCAL_PATH && state.playerId) {
    if (!pathDebugEl) {
      pathDebugEl = document.createElement('div');
      pathDebugEl.id = 'path-debug-overlay';
      pathDebugEl.style.cssText =
        'position:fixed;top:80px;left:12px;z-index:9999;font:11px monospace;color:#0f0;background:rgba(0,0,0,0.7);padding:8px;border-radius:4px;pointer-events:none;';
      document.body.appendChild(pathDebugEl);
    }
    const snaps = now - snapCountResetTime < 1000 ? snapCountLastSecond : 0;
    pathDebugEl.textContent =
      `err=${prediction.lastReconcileErrDist.toFixed(2)} delta=${prediction.visualAuthDelta.toFixed(2)} snaps/s=${snaps}`;
  }

  // ── 9. HUD ─────────────────────────────────────────
  hud.updateScore(state.playerScore);
  hud.updateLeaderboard(state.liveLeaderboard, {
    isMobile: isMobile(),
    isInGame: true,
    fallbackScore: state.playerScore,
  });

  // ── 10. Render ─────────────────────────────────────
  sceneManager.render();
}

requestAnimationFrame(gameLoop);
