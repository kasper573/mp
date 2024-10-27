import type { DocHandle } from "@automerge/automerge-repo/slim";
import { Repo } from "@automerge/automerge-repo/slim";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { authenticateEvent, documentId } from "./shared";

export class SyncClient<State> {
  private wsAdapter: BrowserWebSocketClientAdapter;
  private repo: Repo;
  private handle: DocHandle<State>;
  private subscriptions = new Set<SyncClientSubscription<State>>();

  constructor({
    url,
    onConnect = noop,
    onDisconnect = noop,
  }: SyncClientOptions) {
    this.wsAdapter = new BrowserWebSocketClientAdapter(url);
    this.repo = new Repo({ network: [this.wsAdapter] });

    this.handle = this.repo.find(documentId);
    this.handle.on("change", this.emitCurrentDocument);
    this.handle.on("delete", this.emitCurrentDocument);
    if (!this.wsAdapter.socket) {
      throw new Error("WebSocket connection failed");
    }

    this.wsAdapter.socket.on("open", onConnect);
    this.wsAdapter.socket.on("close", onDisconnect);

    void this.handle.doc().then(this.emitCurrentDocument);
  }

  authenticate(authToken: string) {
    const { socket } = this.wsAdapter;
    if (socket) {
      socket.emit(authenticateEvent, authToken);
    }
  }

  getState(): State | undefined {
    return this.handle.docSync();
  }

  dispose() {
    this.handle.off("change");
    this.handle.off("delete");
    this.repo.delete(documentId);
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

export interface SyncClientOptions {
  url: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export type SyncClientSubscription<State> = (state: State) => void;

const noop = () => {};
