import type http from "node:http";
import { produce, original } from "immer";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { uuid } from "@mp/std";
import { createPatch } from "rfc6902";
import type { Result } from "@mp/std";
import type { PatchStateMessage, ServerToClientMessage } from "./shared";
import {
  encodeServerToClientMessage,
  handshakeDataFromRequest,
  type ClientId,
  type HandshakeData,
} from "./shared";

export class SyncServer<ServerState, ClientState, HandshakeReturn> {
  private state: ServerState;
  private clients: ClientInfoMap<ClientState> = new Map();
  private wss: WebSocketServer;

  get clientIds(): Iterable<ClientId> {
    return this.clients.keys();
  }

  constructor(
    private options: SyncServerOptions<
      ServerState,
      ClientState,
      HandshakeReturn
    >,
  ) {
    this.state = this.options.initialState;
    this.wss = new WebSocketServer({
      server: this.options.httpServer,
      path: this.options.path,
      verifyClient: ({ req }, callback) => {
        void this.verifyClient(req).then((success) => {
          if (success) {
            callback(true);
          } else {
            callback(false, 401, "Unauthorized");
          }
        });
      },
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
        this.updateClientState(reference, clientId, client, nextState);
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

  private updateClientState(
    reference: string,
    clientId: ClientId,
    client: ClientInfo<ClientState>,
    nextState: ServerState,
  ) {
    const nextClientState = this.options.createClientState(nextState, clientId);

    let message: ServerToClientMessage<ClientState>;
    if (client.state) {
      const patch = createPatch(client.state, nextClientState);
      if (patch.length === 0) {
        return;
      }

      message = { type: "patch", patch };
      if (this.options.logSyncPatches) {
        this.options.logger?.info("SyncServer patch", {
          clientId,
          reference,
          patch,
        });
      }
    } else {
      message = { type: "full", state: nextClientState };
    }

    client.state = nextClientState;
    client.socket.send(encodeServerToClientMessage(message));
  }

  private async verifyClient(req: http.IncomingMessage) {
    const clientId = newClientId();

    try {
      const result = await this.options.handshake(
        clientId,
        handshakeDataFromRequest(req),
      );

      if (result.isOk()) {
        memorizeClientMetaData(req, {
          clientId,
          handshakeReturn: result.value,
        });
        return true;
      } else {
        this.options.logger?.error("Handshake failed", result.error);
      }
    } catch (error) {
      this.options.logger?.error("Error during handshake", error);
      // noop
    }

    return false;
  }

  private onConnection = (socket: WebSocket, req: http.IncomingMessage) => {
    const { clientId, handshakeReturn } =
      recallClientMetaData<HandshakeReturn>(req);

    const clientInfo: ClientInfo<ClientState> = { socket };
    this.clients.set(clientId, clientInfo);
    this.options.onConnection?.(clientId, handshakeReturn);

    this.updateClientState(
      "initial state on new connection",
      clientId,
      clientInfo,
      this.state,
    );

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

export interface SyncServerOptions<ServerState, ClientState, HandshakeReturn> {
  path: string;
  httpServer: http.Server;
  initialState: ServerState;
  handshake: (
    clientId: ClientId,
    data: HandshakeData,
  ) => Promise<Result<HandshakeReturn, string>>;
  createClientState: (
    serverState: ServerState,
    clientId: ClientId,
  ) => ClientState;
  onPatch?: PatchHandler;
  logSyncPatches?: boolean;
  logger?: Pick<typeof console, "info" | "error">;
  onConnection?: (clientId: ClientId, handshake: HandshakeReturn) => unknown;
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

const newClientId = uuid as unknown as () => ClientId;

export type { ClientId, HandshakeData } from "./shared";

const clientMetaDataSymbol = Symbol("clientMetaData");

interface ClientMetaData<HandshakeReturn> {
  clientId: ClientId;
  handshakeReturn: HandshakeReturn;
}

function memorizeClientMetaData<HandshakeReturn>(
  request: http.IncomingMessage,
  data: ClientMetaData<HandshakeReturn>,
): void {
  Reflect.set(request, clientMetaDataSymbol, data);
}

function recallClientMetaData<HandshakeReturn>(
  request: http.IncomingMessage,
): ClientMetaData<HandshakeReturn> {
  const data = Reflect.get(request, clientMetaDataSymbol) as
    | ClientMetaData<HandshakeReturn>
    | undefined;
  if (data === undefined) {
    throw new Error("Client meta data not found on request");
  }
  return data;
}
