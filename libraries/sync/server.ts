import type { WebSocketServer } from "@mp/wss";
import { type ClientId } from "./shared";
import type { PatchableState } from "./patch-state-machine";
import type { PatchStateMachine } from "./patch-state-machine";
import type { MessageEncoder } from "./message-encoder";
import {
  createSyncEncoder,
  createWorkerThreadEncoder,
} from "./message-encoder";

export class SyncServer<State extends PatchableState> {
  private sockets: Map<ClientId, WebSocket> = new Map();
  private encoder?: MessageEncoder;

  constructor(private options: SyncServerOptions<State>) {}

  flush = async () => {
    if (!this.encoder) {
      throw new Error("Cannot flush without initializing an encoder");
    }

    const promises: Promise<unknown>[] = [];

    for (const [clientId, patch] of this.options.state.flush()) {
      const socket = this.sockets.get(clientId);
      if (socket) {
        promises.push(
          this.encoder.encode(patch).then((msg) => socket.send(msg)),
        );
      }
    }

    await Promise.all(promises);
  };

  start = () => {
    this.stop();
    this.encoder =
      this.options.encoder === "sync"
        ? createSyncEncoder()
        : createWorkerThreadEncoder();
    this.options.wss.addListener("connection", this.onConnection);
  };

  stop = () => {
    this.encoder?.dispose();
    this.encoder = undefined;
    this.options.wss.removeListener("connection", this.onConnection);
  };

  private onConnection = (socket: WebSocket) => {
    const clientId = this.options.getClientId(socket);
    if (clientId === undefined) {
      this.options.onError?.(
        "Received connection but would not retrieve client id for socket",
      );
      return;
    }
    this.sockets.set(clientId, socket);
    socket.addEventListener("close", () => this.sockets.delete(clientId));
  };
}

export interface SyncServerOptions<State extends PatchableState> {
  encoder: "sync" | "worker";
  state: PatchStateMachine<State>;
  wss: WebSocketServer;
  getClientId: (socket: WebSocket) => ClientId | undefined;
  onError?: (...args: unknown[]) => unknown;
}

export * from "./handshake";
export * from "./patch-state-machine";
