import { WebSocketServer, type WebSocket } from 'ws';
import { ClientMsgType, type ClientMsg } from '@orbeats/shared';
import { GameLoop } from './GameLoop.js';
import { buildWelcome, sendJSON } from './network.js';

const PORT = Number(process.env.PORT ?? 3001);

const gameLoop = new GameLoop();
gameLoop.start();

// Ensure bots are spawned initially
gameLoop.world.updateBots();

const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

let connectionCounter = 0;

wss.on('connection', (ws: WebSocket) => {
  const connId = `player_${connectionCounter++}`;
  let playerId: string | null = null;

  console.log(`[WS] New connection: ${connId}`);

  ws.on('message', (raw: Buffer) => {
    try {
      const msg: ClientMsg = JSON.parse(raw.toString());

      switch (msg.type) {
        case ClientMsgType.Join: {
          playerId = connId;
          const name = msg.name.slice(0, 16) || 'Anon';
          gameLoop.world.addPlayer(playerId, name);
          gameLoop.registerClient(playerId, ws);

          // Send welcome
          sendJSON(ws, buildWelcome(playerId));

          // Send full pellet state immediately on join
          gameLoop.sendInitialPellets(ws);

          console.log(`[WS] Player joined: ${name} (${playerId})`);
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
          gameLoop.handleNewGame();
          break;
        }
      }
    } catch (e) {
      console.error('[WS] Invalid message:', e);
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Disconnected: ${connId}`);
    if (playerId) {
      gameLoop.unregisterClient(playerId);
      gameLoop.world.removePlayer(playerId);
    }
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error on ${connId}:`, err.message);
  });
});

console.log(`[Server] WS listening on ws://0.0.0.0:${PORT}`);
