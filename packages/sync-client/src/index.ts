import type {
  DocHandle,
  DocumentPayload,
  PeerMetadata,
} from "@automerge/automerge-repo";
import { Repo } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { v4 as uuid } from "uuid";
import type { PeerId as ClientId } from "@automerge/automerge-repo";

export class SyncClient<State, ConnectionMetaData> {
  private wsAdapter?: WSClientAdapterWithCustomMetaData<ConnectionMetaData>;
  private repo?: Repo;
  private handle?: DocHandle<State>;
  private stateHandlers = new Set<EventHandler<State>>();
  private readyStateHandlers = new Set<EventHandler<SyncClientReadyState>>();
  private readyStateIntervalId?: NodeJS.Timeout;
  private lastEmittedReadyState?: SyncClientReadyState;

  readonly clientId: ClientId;

  constructor(
    private url: string,
    private getConnectionMetaData: () => ConnectionMetaData,
  ) {
    this.clientId = uuid() as ClientId;
  }

  getReadyState(): SyncClientReadyState {
    return coerceReadyState(this.wsAdapter?.socket?.readyState);
  }

  getState(): State | undefined {
    return this.handle?.docSync();
  }

  start() {
    if (this.repo) {
      throw new Error("Cannot start a client that has already started");
    }

    this.wsAdapter = new WSClientAdapterWithCustomMetaData(
      this.url,
      this.getConnectionMetaData,
    );

    this.repo = new Repo({
      network: [this.wsAdapter],
      peerId: this.clientId,
      sharePolicy: () => Promise.resolve(false),
    });

    this.readyStateIntervalId = setInterval(this.pollReadyState, 1000);
    this.repo.on("document", this.acceptDocument);
  }

  stop() {
    if (!this.repo) {
      throw new Error("Cannot stop a client that hasn't started");
    }

    clearInterval(this.readyStateIntervalId);
    this.wsAdapter?.disconnect();
    this.handle?.off("change");
    this.repo.off("document");
    this.wsAdapter = undefined;
    this.repo = undefined;
    this.handle = undefined;
    this.pollReadyState();
  }

  subscribeToState = (handler: EventHandler<State>): Unsubscribe => {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  };

  subscribeToReadyState = (
    handler: EventHandler<SyncClientReadyState>,
  ): Unsubscribe => {
    this.readyStateHandlers.add(handler);
    return () => this.readyStateHandlers.delete(handler);
  };

  private acceptDocument = ({ handle }: DocumentPayload) => {
    this.handle?.off("change");
    this.handle = handle;
    this.handle.on("change", this.emitState);
    void this.handle.doc().then(this.emitState);
  };

  private emitState = () => {
    for (const handler of this.stateHandlers) {
      handler(this.getState());
    }
  };

  private pollReadyState = () => {
    const readyState = this.getReadyState();
    console.log("pollReadyState", readyState);
    if (readyState !== this.lastEmittedReadyState) {
      this.lastEmittedReadyState = readyState;
      for (const handler of this.readyStateHandlers) {
        handler(readyState);
      }
    }
  };
}

const webSocketToSyncClientReadyState = {
  [WebSocket.CONNECTING]: "connecting",
  [WebSocket.OPEN]: "open",
  [WebSocket.CLOSING]: "closing",
  [WebSocket.CLOSED]: "closed",
} as const;

function coerceReadyState(
  state: keyof typeof webSocketToSyncClientReadyState = WebSocket.CLOSED,
): SyncClientReadyState {
  return webSocketToSyncClientReadyState[state];
}

export type SyncClientReadyState =
  (typeof webSocketToSyncClientReadyState)[keyof typeof webSocketToSyncClientReadyState];

class WSClientAdapterWithCustomMetaData<
  Custom,
> extends BrowserWebSocketClientAdapter {
  constructor(
    serverUrl: string,
    private getCustom?: () => Custom,
  ) {
    super(serverUrl);
  }

  override connect(peerId: ClientId, peerMetadata?: PeerMetadata) {
    // This is a patched behavior that seems to fix infinite reconnects.
    // BrowserWebSocketClientAdapter creates new WebSocket instances
    // on connection retries without closing the old ones.,
    if (this.socket) {
      this.disconnect();
    }

    super.connect(peerId, {
      ...peerMetadata,
      custom: this.getCustom?.(),
    } as PeerMetadata);
  }
}

export { type PeerId as ClientId } from "@automerge/automerge-repo";

type EventHandler<State> = (state?: State) => void;

type Unsubscribe = () => void;
