import { APP_VERSION } from '@orbeats/shared';

/**
 * Orbeats WS server — security protections:
 * - MAX_CONN_PER_IP, MAX_MSG_PER_SEC, BURST, RATE_LIMIT_STRIKES_BEFORE_CLOSE (security.ts)
 * - MIN_SCORE, COOLDOWN_SECONDS (scoreStorage.ts)
 */
import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { ClientMsgType, type ClientMsg } from '@orbeats/shared';
import { GameLoop } from './GameLoop.js';
import { buildWelcome, sendJSON } from './network.js';
import {
  getClientIp,
  incrementIpConn,
  decrementIpConn,
  ipConnCount,
  MAX_CONN_PER_IP,
  createTokenBucket,
  consumeToken,
  RATE_LIMIT_STRIKES_BEFORE_CLOSE,
  type TokenBucket,
} from './security.js';
import { tryRecordScore } from './scoreStorage.js';

const PORT = Number(process.env.PORT ?? 3001);

const gameLoop = new GameLoop();
gameLoop.start();

// Ensure bots are spawned initially
gameLoop.world.updateBots();

const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

let connectionCounter = 0;

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const tConn = Date.now();

  const clientIp = getClientIp(req);

  // Part A: Connection limit per IP — reject if too many from same IP
  const currentCount = ipConnCount.get(clientIp) ?? 0;
  if (currentCount >= MAX_CONN_PER_IP) {
    console.log(
      `[WS] Server-initiated close: too many connections (IP ${clientIp} has ${currentCount})`,
    );
    ws.close(1008, 'Too many connections');
    return;
  }
  incrementIpConn(clientIp);

  const connId = `player_${connectionCounter++}`;
  let playerId: string | null = null;
  const bucket: TokenBucket = createTokenBucket();

  console.log(`[WS] Connection accepted: ${connId} from ${clientIp} (t=0)`);

  function closeAndCleanup(): void {
    decrementIpConn(clientIp);
    if (playerId) {
      gameLoop.unregisterClient(playerId);
      gameLoop.world.removePlayer(playerId);
    }
  }

  ws.on('message', (raw: Buffer) => {
    // Part B: Rate limit — token bucket per connection; parse errors count as strikes
    if (!consumeToken(bucket)) {
      bucket.strikes += 1;
      if (bucket.strikes >= RATE_LIMIT_STRIKES_BEFORE_CLOSE) {
        console.log(
          `[WS] Server-initiated close: rate limit exceeded connId=${connId} strikes=${bucket.strikes}`,
        );
        ws.close(1008, 'Rate limit exceeded');
      }
      return; // Drop message
    }

    try {
      const msg: ClientMsg = JSON.parse(raw.toString());

      switch (msg.type) {
        case ClientMsgType.Join: {
          const tJoin = Date.now();
          const dtConnToJoin = tJoin - tConn;

          playerId = connId;
          const name = msg.name.slice(0, 16) || 'Anon';
          gameLoop.world.addPlayer(playerId, name);
          gameLoop.registerClient(playerId, ws);

          const { sessionEndsAt, sessionId } = gameLoop.getSessionTiming();
          sendJSON(ws, buildWelcome(playerId, sessionEndsAt, sessionId));
          const tWelcome = Date.now();

          const pelletCount = gameLoop.world.pellets.size;
          gameLoop.sendInitialPellets(ws);
          const tPellets = Date.now();
          gameLoop.sendInitialLeaderboard(ws);
          const tLeaderboard = Date.now();

          console.log(
            `[WS] Player joined: ${name} (${playerId}) | pellets=${pelletCount} conn→join=${dtConnToJoin}ms welcome→pellets=${tPellets - tWelcome}ms pellets→lb=${tLeaderboard - tPellets}ms`,
          );
          break;
        }

        case ClientMsgType.Input: {
          if (!playerId) break;
          const player = gameLoop.world.getPlayer(playerId);
          if (!player) break;
          player.setInput(msg.dir, msg.seq);
          gameLoop.updateClientSeq(playerId, msg.seq);
          break;
        }

        case ClientMsgType.Split: {
          if (!playerId) break;
          gameLoop.world.splitAllBlobs(playerId, Date.now());
          break;
        }

        case ClientMsgType.NewGame: {
          if (!playerId) break;
          gameLoop.handleNewGame(playerId);
          break;
        }

        case ClientMsgType.GameOver: {
          // Part C+D: DB write only on GameOver, with MIN_SCORE, cooldown, dedupe
          if (!playerId) break;
          const { finalScore, playerName, sessionId } = msg;
          tryRecordScore(playerId, playerName ?? 'Anon', sessionId, Math.floor(finalScore));
          break;
        }
      }
    } catch (e) {
      // Parse errors count as strikes (prevents JSON spam)
      bucket.strikes += 1;
      console.error('[WS] Invalid message:', e);
      if (bucket.strikes >= RATE_LIMIT_STRIKES_BEFORE_CLOSE) {
        console.log(
          `[WS] Server-initiated close: invalid message connId=${connId} strikes=${bucket.strikes}`,
        );
        ws.close(1008, 'Invalid message');
      }
    }
  });

  ws.on('close', (code: number, reason: Buffer) => {
    const reasonStr = reason?.toString?.() || '';
    console.log(
      `[WS] onclose playerId=${playerId ?? '?'} connId=${connId} code=${code} reason="${reasonStr}"`,
    );
    closeAndCleanup();
  });

  ws.on('error', (err) => {
    console.error(
      `[WS] onerror playerId=${playerId ?? '?'} connId=${connId}:`,
      err.message,
    );
    closeAndCleanup();
  });
});

console.log(`[Server] WS listening on ws://0.0.0.0:${PORT} version=${APP_VERSION}`);
