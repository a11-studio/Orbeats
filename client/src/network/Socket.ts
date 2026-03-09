import {
  ClientMsgType,
  ServerMsgType,
  type ClientMsg,
  type ServerMsg,
  type SnapshotMsg,
  type WelcomeMsg,
  type LeaderboardMsg,
  type DeathMsg,
  type RespawnMsg,
  type PelletEatenMsg,
  type PelletSpawnedMsg,
  type PelletSyncMsg,
  type NewGameStartedMsg,
  type RoomSessionEndedMsg,
} from '@orbeats/shared';

export type SnapshotHandler = (msg: SnapshotMsg) => void;
export type LeaderboardHandler = (msg: LeaderboardMsg) => void;
export type WelcomeHandler = (msg: WelcomeMsg) => void;
export type DeathHandler = (msg: DeathMsg) => void;
export type RespawnHandler = (msg: RespawnMsg) => void;
export type PelletEatenHandler = (msg: PelletEatenMsg) => void;
export type PelletSpawnedHandler = (msg: PelletSpawnedMsg) => void;
export type PelletSyncHandler = (msg: PelletSyncMsg) => void;
export type NewGameStartedHandler = (msg: NewGameStartedMsg) => void;
export type RoomSessionEndedHandler = (msg: RoomSessionEndedMsg) => void;

export class GameSocket {
  private ws: WebSocket | null = null;
  private _connected: boolean = false;
  private connectPromise: Promise<void> | null = null;
  private lastSkippedLogTime = 0;
  private readonly SKIP_LOG_THROTTLE_MS = 2000;

  onSnapshot: SnapshotHandler | null = null;
  onLeaderboard: LeaderboardHandler | null = null;
  onWelcome: WelcomeHandler | null = null;
  /** Called when WS opens (for startup timing) */
  onWsOpen: (() => void) | null = null;
  onDeath: DeathHandler | null = null;
  onRespawn: RespawnHandler | null = null;
  onPelletEaten: PelletEatenHandler | null = null;
  onPelletSpawned: PelletSpawnedHandler | null = null;
  onPelletSync: PelletSyncHandler | null = null;
  onNewGameStarted: NewGameStartedHandler | null = null;
  onRoomSessionEnded: RoomSessionEndedHandler | null = null;

  get connected(): boolean {
    return this._connected;
  }

  connect(url: string): Promise<void> {
    if (this._connected) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this._connected = true;
        this.connectPromise = null;
        this.onWsOpen?.();
        console.log('[Socket] onopen');
        resolve();
      };

      this.ws.onclose = (ev: CloseEvent) => {
        this._connected = false;
        this.connectPromise = null;
        this.ws = null;
        console.log(
          `[Socket] onclose code=${ev.code} reason="${ev.reason}" wasClean=${ev.wasClean} readyStateBefore=CLOSED`,
        );
      };

      this.ws.onerror = (e) => {
        this.connectPromise = null;
        this.ws = null;
        console.error('[Socket] onerror', e);
        reject(e);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: ServerMsg = JSON.parse(event.data as string);
          switch (msg.type) {
            case ServerMsgType.Welcome:
              this.onWelcome?.(msg);
              break;
            case ServerMsgType.Snapshot:
              this.onSnapshot?.(msg);
              break;
            case ServerMsgType.Leaderboard:
              this.onLeaderboard?.(msg);
              break;
            case ServerMsgType.Death:
              this.onDeath?.(msg);
              break;
            case ServerMsgType.Respawn:
              this.onRespawn?.(msg);
              break;
            case ServerMsgType.PelletEaten:
              this.onPelletEaten?.(msg);
              break;
            case ServerMsgType.PelletSpawned:
              this.onPelletSpawned?.(msg);
              break;
            case ServerMsgType.PelletSync:
              this.onPelletSync?.(msg);
              break;
            case ServerMsgType.NewGameStarted:
              this.onNewGameStarted?.(msg);
              break;
            case ServerMsgType.RoomSessionEnded:
              this.onRoomSessionEnded?.(msg);
              break;
          }
        } catch (e) {
          console.error('[Socket] Parse error:', e);
        }
      };
    });
    return this.connectPromise;
  }

  send(msg: ClientMsg): void {
    if (!this.ws) {
      this.logSkippedSend('no ws', msg.type);
      return;
    }
    if (this.ws.readyState !== WebSocket.OPEN) {
      this.logSkippedSend(`readyState=${this.ws.readyState}`, msg.type);
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  private logSkippedSend(reason: string, type: string): void {
    const now = Date.now();
    if (now - this.lastSkippedLogTime >= this.SKIP_LOG_THROTTLE_MS) {
      this.lastSkippedLogTime = now;
      console.log(`[Socket] send skipped (${reason}) type=${type}`);
    }
  }

  sendJoin(name: string): void {
    this.send({ type: ClientMsgType.Join, name });
  }

  sendInput(dirX: number, dirZ: number, seq: number): void {
    this.send({ type: ClientMsgType.Input, dir: { x: dirX, z: dirZ }, seq });
  }

  sendSplit(): void {
    this.send({ type: ClientMsgType.Split });
  }

  sendNewGame(): void {
    this.send({ type: ClientMsgType.NewGame });
  }

  sendGameOver(finalScore: number, playerName: string, sessionId: number): void {
    this.send({
      type: ClientMsgType.GameOver,
      finalScore,
      playerName,
      sessionId,
    });
  }
}
