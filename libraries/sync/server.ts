import type { WebSocketServer } from "@mp/wss";
import type { PatchableState } from "./patch-state-machine";
import type { PatchStateMachine } from "./patch-state-machine";
import type { MessageEncoder } from "./message-encoder";
import {
  createSyncEncoder,
  createWorkerThreadEncoder,
} from "./message-encoder";
import type { ClientId } from "./shared";

export class SyncServer<State extends PatchableState> {
  private encoder?: MessageEncoder;

  constructor(private options: SyncServerOptions<State>) {}

  flush = async () => {
    if (!this.encoder) {
      throw new Error("Cannot flush without initializing an encoder");
    }

    const promises: Promise<unknown>[] = [];

    for (const [clientId, patch] of this.options.state.flush()) {
      const socket = this.options.getSocket(clientId);
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
  };

  stop = () => {
    this.encoder?.dispose();
    this.encoder = undefined;
  };
}

export interface SyncServerOptions<State extends PatchableState> {
  encoder: "sync" | "worker";
  state: PatchStateMachine<State>;
  wss: WebSocketServer;
  getSocket: (clientId: ClientId) => WebSocket | undefined;
  onError?: (...args: unknown[]) => unknown;
}

export * from "./handshake";
export * from "./patch-state-machine";
