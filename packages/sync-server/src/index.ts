import { type Server } from "node:http";
import type {
  DocHandle,
  PeerCandidatePayload,
  PeerDisconnectedPayload,
} from "@automerge/automerge-repo";
import { WebSocketServer } from "ws";
import { Repo } from "@automerge/automerge-repo";
import { NodeWSServerAdapter } from "@automerge/automerge-repo-network-websocket";
import type { PatchCallback } from "@automerge/automerge";
import type { PeerId as ClientId } from "@automerge/automerge-repo";

export class SyncServer<State, ConnectionMetaData> {
  private repo: Repo;
  private wssAdapter: NodeWSServerAdapter;
  private handle: DocHandle<State>;

  get clientIds(): ClientId[] {
    return Object.keys(this.wssAdapter.sockets) as ClientId[];
  }

  constructor(private options: SyncServerOptions<State, ConnectionMetaData>) {
    this.wssAdapter = new NodeWSServerAdapter(
      new WebSocketServer({ server: options.httpServer }),
    );

    this.repo = new Repo({ network: [this.wssAdapter] });
    this.handle = this.repo.create(options.initialState);
    this.wssAdapter.on("peer-candidate", this.onConnection);
    this.wssAdapter.on("peer-disconnected", this.onDisconnect);
  }

  access: StateAccess<State> = (message, mutateFn) => {
    let result!: ReturnType<typeof mutateFn>;
    this.handle.change(
      (state) => {
        result = mutateFn(state);
      },
      { patchCallback: this.options.patchCallback, message },
    );
    return result;
  };

  dispose() {
    this.wssAdapter.disconnect();
  }

  disconnectClient(clientId: ClientId) {
    this.wssAdapter.sockets[clientId]?.close();
  }

  private onConnection = ({ peerId, peerMetadata }: PeerCandidatePayload) => {
    void this.options.onConnection?.(
      peerId,
      Reflect.get(peerMetadata, "custom") as ConnectionMetaData,
    );
  };

  private onDisconnect = ({ peerId }: PeerDisconnectedPayload) => {
    void this.options.onDisconnect?.(peerId);
  };
}

export interface SyncServerOptions<State, ConnectionMetaData> {
  httpServer: Server;
  initialState: State;
  filterState: (state: State, clientId: ClientId) => State;
  patchCallback?: PatchCallback<State>;
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

export { type PeerId as ClientId } from "@automerge/automerge-repo";
