import {
  Repo,
  type DocHandle,
  type PeerCandidatePayload,
  type PeerDisconnectedPayload,
} from "@automerge/automerge-repo/slim";
import type { WebSocketServer } from "ws";
import { NodeWSServerAdapter } from "@automerge/automerge-repo-network-websocket";
import { type PatchCallback } from "@automerge/automerge/slim";
import type {
  PeerId as ClientId,
  SharePolicy,
} from "@automerge/automerge-repo/slim";
import { produce, original } from "immer";
export { type PeerId as ClientId } from "@automerge/automerge-repo/slim";

export class SyncServer<ServerState, ClientState, ConnectionMetaData> {
  private repo: Repo;
  private wssAdapter: NodeWSServerAdapter;
  private state: ServerState;
  private handles = new Map<ClientId, DocHandle<ClientState>>();

  get clientIds(): Iterable<ClientId> {
    return this.handles.keys();
  }

  constructor(
    private options: SyncServerOptions<
      ServerState,
      ClientState,
      ConnectionMetaData
    >,
  ) {
    this.state = this.options.initialState;
    this.wssAdapter = new NodeWSServerAdapter(options.wss);
    this.repo = new Repo({
      network: [this.wssAdapter],
      sharePolicy: createSharePolicy(this.handles),
    });

    this.wssAdapter.on("peer-candidate", this.onConnection);
    this.wssAdapter.on("peer-disconnected", this.onDisconnect);
  }

  access: StateAccess<ServerState> = (message, accessFn) => {
    let returnValue!: ReturnType<typeof accessFn>;

    const nextState = produce(this.state, (draft) => {
      returnValue = accessFn(draft as ServerState);
      if (returnValue && typeof returnValue === "object") {
        returnValue = original(returnValue) as ReturnType<typeof accessFn>;
      }
      if (returnValue instanceof Promise) {
        throw new TypeError("State access mutations may not be asynchronous");
      }
    });

    if (nextState !== this.state) {
      this.state = nextState;
      applyServerStateToClients(message, nextState, this.handles, this.options);
    }

    return returnValue;
  };

  dispose() {
    this.wssAdapter.disconnect();
  }

  disconnectClient(clientId: ClientId) {
    this.wssAdapter.sockets[clientId]?.close();
  }

  private onConnection = ({ peerId, peerMetadata }: PeerCandidatePayload) => {
    if (this.handles.has(peerId)) {
      throw new Error("Client already connected: " + peerId);
    } else {
      const clientState = this.options.createClientState(this.state, peerId);
      this.handles.set(peerId, this.repo.create(clientState));
    }
    void this.options.onConnection?.(
      peerId,
      Reflect.get(peerMetadata, "custom") as ConnectionMetaData,
    );
  };

  private onDisconnect = ({ peerId }: PeerDisconnectedPayload) => {
    const handle = this.handles.get(peerId);
    if (handle) {
      this.repo.delete(handle.documentId);
      this.handles.delete(peerId);
    }
    void this.options.onDisconnect?.(peerId);
  };
}

export interface SyncServerOptions<ServerState, ClientState, ConnectionMetaData>
  extends ApplyServerStateOptions<ServerState, ClientState> {
  wss: WebSocketServer;
  initialState: ServerState;
  onConnection?: (
    clientId: ClientId,
    meta: ConnectionMetaData,
  ) => void | undefined | Promise<unknown>;
  onDisconnect?: (clientId: ClientId) => void | undefined | Promise<unknown>;
}

export type StateAccess<State> = <Result>(
  /**
   * An explanation of what the access is for, for logging purposes.
   */
  reference: string,
  /**
   * Read or modify the state.
   */
  stateHandler: (draft: State) => Result,
) => Result;

export { WebSocketServer } from "ws";

interface ApplyServerStateOptions<ServerState, ClientState> {
  createClientState: (
    serverState: ServerState,
    clientId: ClientId,
  ) => ClientState;
  patchCallback?: PatchCallback<ClientState>;
}

function applyServerStateToClients<ServerState, ClientState>(
  message: string,
  serverState: ServerState,
  clientHandles: Map<ClientId, DocHandle<ClientState>>,
  options: ApplyServerStateOptions<ServerState, ClientState>,
): void {
  const { patchCallback, createClientState } = options;
  for (const [clientId, clientHandle] of clientHandles.entries()) {
    const clientState = createClientState(serverState, clientId);
    clientHandle.change(
      (doc) => {
        Object.assign(doc as object, clientState);
      },
      {
        patchCallback,
        message,
      },
    );
  }
}

function createSharePolicy(
  handles: Map<ClientId, DocHandle<unknown>>,
): SharePolicy {
  return (clientId, docId) => {
    const handle = handles.get(clientId);
    const shouldShare = handle ? handle.documentId === docId : false;
    return Promise.resolve(shouldShare);
  };
}
