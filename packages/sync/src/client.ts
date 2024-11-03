import type { DocHandle } from "@automerge/automerge-repo";
import { Repo } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { authenticateEvent } from "./shared";

export class SyncClient<State> {
  private wsAdapter: BrowserWebSocketClientAdapter;
  private repo: Repo;
  private handle?: DocHandle<State>;
  private subscriptions = new Set<SyncClientSubscription<State>>();

  get socket(): WebSocket | undefined {
    // This assertion is a workaround of automerge using isomorphic-ws,
    // which automatically uses the @types/ws installed in this package.
    // However, @types/ws is installed for the server module, which actually uses the ws
    // module. But on the client, ws isn't being used.
    // In reality the browser WebSocket API is being used.
    return this.wsAdapter.socket as unknown as WebSocket;
  }

  constructor(private options: SyncClientOptions<State>) {
    this.wsAdapter = new BrowserWebSocketClientAdapter(options.url);
    this.repo = new Repo({ network: [this.wsAdapter] });
  }

  authenticate(authToken: string) {
    this.socket?.dispatchEvent(
      new CustomEvent(authenticateEvent, { detail: authToken }),
    );
  }

  getState(): State | undefined {
    return this.handle?.docSync();
  }

  start() {
    this.handle = this.repo.create(this.options.initialState);
    this.handle.on("change", this.emitCurrentDocument);
    this.handle.on("delete", this.emitCurrentDocument);

    void this.handle.doc().then(this.emitCurrentDocument);
  }

  stop() {
    if (!this.handle) {
      throw new Error("Cannot stop a client that hasn't started");
    }

    this.handle.off("change");
    this.handle.off("delete");
    this.repo.delete(this.handle.url);
    this.wsAdapter.disconnect();
  }

  subscribe = (handler: SyncClientSubscription<State>) => {
    this.subscriptions.add(handler);
    return () => this.subscriptions.delete(handler);
  };

  private emitCurrentDocument = () => {
    const state = this.getState();
    if (!state) {
      return;
    }

    for (const handler of this.subscriptions) {
      handler(state);
    }
  };
}

export interface SyncClientOptions<State> {
  initialState: State;
  url: string;
}

export type SyncClientSubscription<State> = (state: State) => void;

const noop = () => {};
