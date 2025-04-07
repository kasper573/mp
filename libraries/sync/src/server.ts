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
      const send = this.options.getSender(clientId);
      if (send) {
        promises.push(this.encoder.encode(patch).then(send));
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
  getSender: (
    clientId: ClientId,
  ) => ((buffer: Uint8Array<ArrayBufferLike>) => unknown) | undefined;
  onError?: (...args: unknown[]) => unknown;
}

export * from "./patch-state-machine";
