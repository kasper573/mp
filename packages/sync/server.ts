import type http from "node:http";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { uuid } from "@mp/std";
import type { Result } from "@mp/std";
import { type ClientId } from "./shared";
import { type HandshakeData } from "./handshake";
import { handshakeDataFromRequest } from "./handshake";
import type { PatchableState } from "./PatchStateMachine";
import type { PatchStateMachine } from "./PatchStateMachine";
import { createMessageEncoder } from "./messageEncoder";

export class SyncServer<State extends PatchableState, HandshakeReturn> {
  private clients: ClientInfoMap = new Map();
  private wss: WebSocketServer;
  private encodeMessage = createMessageEncoder();

  get clientIds(): Iterable<ClientId> {
    return this.clients.keys();
  }

  constructor(private options: SyncServerOptions<State, HandshakeReturn>) {
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

  flush = async () => {
    const promises: Promise<unknown>[] = [];

    for (const [clientId, patch] of this.options.state.flush()) {
      const client = this.clients.get(clientId);
      if (client) {
        promises.push(
          this.encodeMessage(patch).then((msg) => client.socket.send(msg)),
        );
      }
    }

    await Promise.all(promises);
  };

  start = () => {
    this.wss.addListener("connection", this.onConnection);
    this.wss.addListener("close", this.handleClose);
  };

  stop = () => {
    this.wss.removeListener("connection", this.onConnection);
    this.wss.removeListener("close", this.handleClose);
  };

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

    const clientInfo: ClientInfo = { socket, id: clientId };

    this.clients.set(clientId, clientInfo);
    this.options.onConnection?.(clientId, handshakeReturn);

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

export interface SyncServerOptions<
  State extends PatchableState,
  HandshakeReturn,
> {
  path: string;
  state: PatchStateMachine<State>;
  httpServer: http.Server;
  handshake: (
    clientId: ClientId,
    data: HandshakeData,
  ) => Promise<Result<HandshakeReturn, string>>;
  logger?: Pick<typeof console, "info" | "error">;
  onConnection?: (clientId: ClientId, handshake: HandshakeReturn) => unknown;
  onDisconnect?: (clientId: ClientId) => unknown;
}

interface ClientInfo {
  id: ClientId;
  socket: WebSocket;
  handshakeData?: HandshakeData;
}

type ClientInfoMap = Map<ClientId, ClientInfo>;

const newClientId = uuid as unknown as () => ClientId;

export type { ClientId } from "./shared";

export * from "./PatchStateMachine";

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
