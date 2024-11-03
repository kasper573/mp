import { type Server } from "node:http";
import type {
  DocHandle,
  PeerCandidatePayload,
  PeerDisconnectedPayload,
} from "@automerge/automerge-repo";
import { WebSocketServer } from "ws";
import { Repo } from "@automerge/automerge-repo";
import { NodeWSServerAdapter } from "@automerge/automerge-repo-network-websocket";
import type { ClientId } from "./shared";

export class SyncServer<State> {
  private repo: Repo;
  private wssAdapter: NodeWSServerAdapter;
  private handle: DocHandle<State>;

  constructor(private options: SyncServerOptions<State, ClientId>) {
    this.wssAdapter = new NodeWSServerAdapter(
      new WebSocketServer({ server: options.httpServer }),
    );

    this.repo = new Repo({
      network: [this.wssAdapter],
      sharePolicy: () => Promise.resolve(false),
    });

    this.handle = this.repo.create(options.initialState);
    this.wssAdapter.on("peer-candidate", this.onConnection);
    this.wssAdapter.on("peer-disconnected", this.onDisconnect);
  }

  access: StateAccess<State> = (reference, mutateFn) => {
    let result!: ReturnType<typeof mutateFn>;
    this.handle.change((state) => {
      result = mutateFn(state);
      this.options.log?.(
        "[SyncServer.access]",
        JSON.stringify({ reference, state }, null, 2),
      );
    });
    return result;
  };

  dispose() {
    this.wssAdapter.disconnect();
  }

  private onConnection = ({ peerId }: PeerCandidatePayload) => {
    void this.options.onConnection?.(peerId);
  };

  private onDisconnect = ({ peerId }: PeerDisconnectedPayload) => {
    void this.options.onDisconnect?.(peerId);
  };
}

export interface SyncServerOptions<State, ClientId extends string> {
  httpServer: Server;
  initialState: State;
  filterState: (state: State, clientId: ClientId) => State;
  log: typeof console.log;
  onConnection?: (clientId: ClientId) => void | undefined | Promise<unknown>;
  onDisconnect?: (clientId: ClientId) => void | undefined | Promise<unknown>;
}

export type StateAccess<State> = <Result>(
  reference: string,
  mutateFn: (draft: State) => Result,
) => Result;

export * from "./shared";

function getParentFunctionNameFromStackTrace() {
  const stack = new Error("-").stack;
  return stack;
}
