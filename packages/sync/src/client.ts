import type { DocHandle } from "@automerge/automerge-repo";
import { Repo } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { v4 as uuid } from "uuid";
import type { ClientId } from "./shared";

export class SyncClient<State> {
  private wsAdapter?: BrowserWebSocketClientAdapter;
  private repo?: Repo;
  private handle?: DocHandle<State>;
  private subscriptions = new Set<SyncClientSubscription<State>>();

  readonly clientId: ClientId;

  constructor(private options: SyncClientOptions<State>) {
    this.clientId = uuid() as ClientId;
  }

  getState(): State | undefined {
    return this.handle?.docSync();
  }

  start() {
    this.wsAdapter = new BrowserWebSocketClientAdapter(this.options.url);
    this.repo = new Repo({
      network: [this.wsAdapter],
      peerId: this.clientId,
    });
    this.handle = this.repo.create(this.options.initialState);
    this.handle.on("change", this.emitCurrentDocument);
    this.handle.on("delete", this.emitCurrentDocument);

    void this.handle.doc().then(this.emitCurrentDocument);
  }

  stop() {
    if (!this.handle || !this.wsAdapter || !this.repo) {
      throw new Error("Cannot stop a client that hasn't started");
    }

    this.wsAdapter.disconnect();
    this.handle.off("change");
    this.handle.off("delete");
    this.repo.delete(this.handle.url);
    this.wsAdapter = undefined;
    this.repo = undefined;
    this.handle = undefined;
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

export * from "./shared";
