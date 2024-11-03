import { type Server } from "node:http";
import type { DocHandle, PeerId } from "@automerge/automerge-repo";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { Repo } from "@automerge/automerge-repo";
import { NodeWSServerAdapter } from "@automerge/automerge-repo-network-websocket";
import { v4 as uuid } from "uuid";
import { authenticateEvent } from "./shared";

export class SyncServer<State, ClientId extends string> {
  private repo: Repo;
  private wss: WebSocketServer;
  private handle: DocHandle<State>;

  constructor(private options: SyncServerOptions<State, ClientId>) {
    this.wss = new WebSocketServer({ server: options.httpServer });
    this.repo = new Repo({
      network: [new NodeWSServerAdapter(this.wss)],
      peerId: options.peerId as PeerId,
      sharePolicy: () => Promise.resolve(false),
    });

    this.handle = this.repo.create(options.initialState);
    this.wss.on("connection", this.onConnection);
  }

  access: StateAccess<State> = (mutateFn) => {
    let result!: ReturnType<typeof mutateFn>;
    this.handle.change((draft) => {
      result = mutateFn(draft);
    });
    return result;
  };

  dispose() {
    this.repo.delete(this.handle.url);
    this.wss.off("connection", this.onConnection);
    this.wss.close();
  }

  private onConnection = (socket: WebSocket) => {
    const { onAuthenticate, onConnection, onDisconnect } = this.options;

    void handleSocket(socket);

    async function handleSocket(socket: WebSocket) {
      const clientId = uuid() as ClientId;

      await onConnection?.(clientId);

      socket.on(
        authenticateEvent,
        (authToken: string) => void onAuthenticate?.(clientId, authToken),
      );

      socket.once("disconnect", (reason) => void onDisconnect?.(clientId));
    }
  };
}

export interface SyncServerOptions<State, ClientId extends string> {
  httpServer: Server;
  initialState: State;
  filterState: (state: State, clientId: ClientId) => State;
  peerId: string;
  log: typeof console.log;
  onAuthenticate?: (
    clientId: ClientId,
    authToken: string,
  ) => void | undefined | Promise<unknown>;
  onConnection?: (clientId: ClientId) => void | undefined | Promise<unknown>;
  onDisconnect?: (clientId: ClientId) => void | undefined | Promise<unknown>;
}

export type StateAccess<State> = <Result>(
  mutateFn: (draft: State) => Result,
) => Result;
