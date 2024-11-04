import type { DocHandle, DocumentPayload } from "@automerge/automerge-repo";
import { Repo } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { v4 as uuid } from "uuid";
import type { ClientId } from "./shared";

export class SyncClient<State> {
  private wsAdapter?: BrowserWebSocketClientAdapter;
  private repo?: Repo;
  private handle?: DocHandle<State>;
  private stateSubscriptions = new Set<SyncClientSubscription<State>>();

  readonly clientId: ClientId;

  constructor(private url: string) {
    this.clientId = uuid() as ClientId;
  }

  getState(): State | undefined {
    return this.handle?.docSync();
  }

  start() {
    if (this.repo) {
      throw new Error("Cannot start a client that has already started");
    }
    this.wsAdapter = new BrowserWebSocketClientAdapter(this.url);
    this.repo = new Repo({
      network: [this.wsAdapter],
      peerId: this.clientId,
      sharePolicy: () => Promise.resolve(false),
    });
    this.repo.on("document", this.acceptDocument);
  }

  stop() {
    if (!this.repo) {
      throw new Error("Cannot stop a client that hasn't started");
    }

    this.wsAdapter?.disconnect();
    this.handle?.off("change");
    this.repo.off("document");
    this.wsAdapter = undefined;
    this.repo = undefined;
    this.handle = undefined;
  }

  subscribe = (handler: SyncClientSubscription<State>) => {
    this.stateSubscriptions.add(handler);
    return () => this.stateSubscriptions.delete(handler);
  };

  private acceptDocument = ({ handle }: DocumentPayload) => {
    this.handle?.off("change");
    this.handle = handle;
    this.handle.on("change", this.emitState);
    void this.handle.doc().then(this.emitState);
  };

  private emitState = () => {
    for (const handler of this.stateSubscriptions) {
      handler(this.getState());
    }
  };
}

export type SyncClientSubscription<State> = (state?: State) => void;

export * from "./shared";
