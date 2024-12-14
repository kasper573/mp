import type {
  DocHandle,
  PeerCandidatePayload,
  PeerDisconnectedPayload,
} from "@automerge/automerge-repo";
import { Repo } from "@automerge/automerge-repo";
import type { PatchCallback } from "@automerge/automerge";
import { customPeerMetaDataKey } from "../shared.ts";
import type { PeerId as ClientId } from "@automerge/automerge-repo";
import { WSServerAdapter } from "./WSServerAdapter.ts";

export class SyncServer<State, ConnectionMetaData> {
  private repo: Repo;
  private handle: DocHandle<State>;

  get clientIds(): ClientId[] {
    return Object.keys(this.wssAdapter.sockets) as ClientId[];
  }

  constructor(
    private wssAdapter: WSServerAdapter,
    private options: SyncServerOptions<State, ConnectionMetaData>,
  ) {
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
    this.wssAdapter.sockets.get(clientId)?.close();
  }

  private onConnection = ({ peerId, peerMetadata }: PeerCandidatePayload) => {
    void this.options.onConnection?.(
      peerId,
      Reflect.get(peerMetadata, customPeerMetaDataKey) as ConnectionMetaData,
    );
  };

  private onDisconnect = ({ peerId }: PeerDisconnectedPayload) => {
    void this.options.onDisconnect?.(peerId);
  };
}

export { WSServerAdapter };

export interface SyncServerOptions<State, ConnectionMetaData> {
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

export * from "../shared.ts";
export type { ClientId };
