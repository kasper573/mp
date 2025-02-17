import type http from "node:http";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { uuid } from "@mp/std";
import type { Result } from "@mp/std";
import type { Patch } from "immer";
import {
  encodeServerToClientMessage,
  handshakeDataFromRequest,
  type ClientId,
  type HandshakeData,
} from "./shared";
import type { StateAccess, SyncState } from "./PatchStateMachine";
import type { PatchStateMachine } from "./PatchStateMachine";

export class SyncServer<State extends SyncState, HandshakeReturn> {
  private clients: ClientInfoMap = new Map();
  private wss: WebSocketServer;
  private flushQueue = new Map<ClientId, Patch[]>();

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

  access: StateAccess<State> = (accessFn) => {
    const { state } = this.options;
    const [returnValue, clientPatches] = state.access(accessFn);

    for (const client of this.clients.values()) {
      let patchesToAdd: Patch[] | undefined;
      if (client.needsFullState) {
        client.needsFullState = false;
        patchesToAdd = [
          ...createFullStatePatches(state.readClientState(client.id)),
          ...(clientPatches[client.id] ?? []),
        ];
      } else {
        patchesToAdd = clientPatches[client.id];
      }

      if (patchesToAdd?.length) {
        let patchQueue = this.flushQueue.get(client.id);
        if (!patchQueue) {
          patchQueue = [];
          this.flushQueue.set(client.id, patchQueue);
        }
        patchQueue.push(...patchesToAdd);
      }
    }

    return returnValue;
  };

  flush = async () => {
    const promises = this.flushQueue
      .entries()
      .flatMap(([clientId, patches]) => {
        const client = this.clients.get(clientId);
        if (client) {
          const promise = encodeServerToClientMessage({
            type: "patch",
            patches,
          }).then((message): [ClientInfo, Uint8Array] => [client, message]);
          return [promise];
        }
        return [];
      });

    const jobs = await Promise.all(promises);
    for (const [client, message] of jobs) {
      client.socket.send(message);
    }

    this.flushQueue.clear();
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

    const clientInfo: ClientInfo = {
      socket,
      needsFullState: true,
      id: clientId,
    };

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

export interface SyncServerOptions<State extends SyncState, HandshakeReturn> {
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
  needsFullState?: boolean;
}

type ClientInfoMap = Map<ClientId, ClientInfo>;

const newClientId = uuid as unknown as () => ClientId;

export type { ClientId, HandshakeData } from "./shared";

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

function createFullStatePatches(state: object): Patch[] {
  const patches: Patch[] = [];
  for (const key in state) {
    patches.push({
      path: [key],
      op: "replace",
      value: state[key as keyof typeof state],
    });
  }
  return patches;
}
