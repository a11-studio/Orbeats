import {
  ClientMsgType,
  ServerMsgType,
  type ClientMsg,
  type ServerMsg,
  type SnapshotMsg,
  type WelcomeMsg,
  type DeathMsg,
  type RespawnMsg,
  type PelletEatenMsg,
  type PelletSpawnedMsg,
  type PelletSyncMsg,
  type NewGameStartedMsg,
} from '@orbeats/shared';

export type SnapshotHandler = (msg: SnapshotMsg) => void;
export type WelcomeHandler = (msg: WelcomeMsg) => void;
export type DeathHandler = (msg: DeathMsg) => void;
export type RespawnHandler = (msg: RespawnMsg) => void;
export type PelletEatenHandler = (msg: PelletEatenMsg) => void;
export type PelletSpawnedHandler = (msg: PelletSpawnedMsg) => void;
export type PelletSyncHandler = (msg: PelletSyncMsg) => void;
export type NewGameStartedHandler = (msg: NewGameStartedMsg) => void;

export class GameSocket {
  private ws: WebSocket | null = null;
  private _connected: boolean = false;

  onSnapshot: SnapshotHandler | null = null;
  onWelcome: WelcomeHandler | null = null;
  onDeath: DeathHandler | null = null;
  onRespawn: RespawnHandler | null = null;
  onPelletEaten: PelletEatenHandler | null = null;
  onPelletSpawned: PelletSpawnedHandler | null = null;
  onPelletSync: PelletSyncHandler | null = null;
  onNewGameStarted: NewGameStartedHandler | null = null;

  get connected(): boolean {
    return this._connected;
  }

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this._connected = true;
        console.log('[Socket] Connected');
        resolve();
      };

      this.ws.onclose = () => {
        this._connected = false;
        console.log('[Socket] Disconnected');
      };

      this.ws.onerror = (e) => {
        console.error('[Socket] Error', e);
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
          }
        } catch (e) {
          console.error('[Socket] Parse error:', e);
        }
      };
    });
  }

  send(msg: ClientMsg): void {
    if (this.ws && this._connected) {
      this.ws.send(JSON.stringify(msg));
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
}
