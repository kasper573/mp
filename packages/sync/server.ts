import type http from "node:http";
import { produce, original } from "immer";
import type { VerifyClientCallbackAsync, WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { v4 } from "uuid";
import { createPatch } from "rfc6902";
import type { PatchStateMessage, ServerToClientMessage } from "./shared";
import {
  encodeServerToClientMessage,
  handshakeDataFromRequest,
  type ClientId,
  type HandshakeData,
} from "./shared";

export class SyncServer<ServerState, ClientState> {
  private state: ServerState;
  private clients: ClientInfoMap<ClientState> = new Map();
  private wss: WebSocketServer;

  get clientIds(): Iterable<ClientId> {
    return this.clients.keys();
  }

  constructor(private options: SyncServerOptions<ServerState, ClientState>) {
    this.state = this.options.initialState;
    this.wss = new WebSocketServer({
      server: this.options.httpServer,
      path: this.options.path,
      verifyClient: this.verifyClient,
    });
  }

  access: StateAccess<ServerState> = (reference, accessFn) => {
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
      for (const [clientId, client] of this.clients.entries()) {
        const nextClientState = this.options.createClientState(
          nextState,
          clientId,
        );

        let message: ServerToClientMessage<ClientState>;
        if (client.state) {
          const patch = createPatch(client.state, nextClientState);
          if (patch.length === 0) {
            continue;
          }

          message = { type: "patch", patch };
          if (this.options.onPatch) {
            this.options.onPatch({ clientId, reference, patch });
          }
        } else {
          message = { type: "full", state: nextClientState };
        }

        client.state = nextClientState;
        client.socket.send(encodeServerToClientMessage(message));
      }
    }

    return returnValue;
  };

  start() {
    this.wss.addListener("connection", this.onConnection);
    this.wss.addListener("close", this.handleClose);
  }

  stop() {
    this.wss.removeListener("connection", this.onConnection);
    this.wss.removeListener("close", this.handleClose);
  }

  private verifyClient: VerifyClientCallbackAsync<http.IncomingMessage> = (
    { req },
    callback,
  ) => {
    const clientId = newClientId();
    memorizeClientId(req, clientId);
    void this.options
      .handshake(clientId, handshakeDataFromRequest(req))
      .then(callback);
  };

  private onConnection = (socket: WebSocket, req: http.IncomingMessage) => {
    const clientId = recallClientId(req);
    this.clients.set(clientId, { socket });
    this.options.onConnection?.(clientId);

    socket.addEventListener("close", () => {
      this.clients.delete(clientId);
      void this.options.onDisconnect?.(clientId);
    });
  };

  private handleClose = () => {
    for (const { socket } of this.clients.values()) {
      socket.removeAllListeners();
    }
  };
}

export interface SyncServerOptions<ServerState, ClientState> {
  path: string;
  httpServer: http.Server;
  initialState: ServerState;
  handshake: (clientId: ClientId, data: HandshakeData) => Promise<boolean>;
  createClientState: (
    serverState: ServerState,
    clientId: ClientId,
  ) => ClientState;
  onPatch?: PatchHandler;
  onConnection?: (clientId: ClientId) => unknown;
  onDisconnect?: (clientId: ClientId) => unknown;
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

export type PatchHandler = (props: {
  clientId: ClientId;
  reference: string;
  patch: PatchStateMessage["patch"];
}) => void;

interface ClientInfo<ClientState> {
  socket: WebSocket;
  state?: ClientState;
  handshakeData?: HandshakeData;
}

type ClientInfoMap<ClientState> = Map<ClientId, ClientInfo<ClientState>>;

const newClientId = v4 as unknown as () => ClientId;

export type { ClientId, HandshakeData } from "./shared";

const clientIdSymbol = Symbol("clientId");

function memorizeClientId(request: http.IncomingMessage, id: ClientId): void {
  Reflect.set(request, clientIdSymbol, id);
}

function recallClientId(request: http.IncomingMessage): ClientId {
  const id = Reflect.get(request, clientIdSymbol) as ClientId | undefined;
  if (id === undefined) {
    throw new Error("Client ID not found on request");
  }
  return id;
}
