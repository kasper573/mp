import type http from "node:http";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { uuid } from "@mp/std";
import type { Result } from "@mp/std";
import type { Patch } from "immer";
import { original, produceWithPatches, enablePatches } from "immer";
import {
  encodeServerToClientMessage,
  handshakeDataFromRequest,
  type ClientId,
  type HandshakeData,
} from "./shared";

enablePatches();

export class SyncServer<State extends object, HandshakeReturn> {
  private state: State;
  private clients: ClientInfoMap = new Map();
  private patches: Patch[] = [];
  private wss: WebSocketServer;

  get clientIds(): Iterable<ClientId> {
    return this.clients.keys();
  }

  constructor(private options: SyncServerOptions<State, HandshakeReturn>) {
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

  access: StateAccess<State> = (reference, accessFn) => {
    let returnValue!: ReturnType<typeof accessFn>;

    const [nextState, patches] = produceWithPatches(
      this.state,
      function mutateImmerDraft(draft) {
        returnValue = accessFn(draft as State);
        if (returnValue && typeof returnValue === "object") {
          returnValue = original(returnValue) as ReturnType<typeof accessFn>;
        }
        if (returnValue instanceof Promise) {
          throw new TypeError("State access mutations may not be asynchronous");
        }
      },
    );

    this.state = nextState;

    this.patches.push(...patches);

    return returnValue;
  };

  flush = async () => {
    for (const client of this.clients.values()) {
      let patchesToSend: Patch[];
      if (client.needsFullState) {
        client.needsFullState = false;
        patchesToSend = [
          ...createFullStatePatches(this.state),
          ...this.patches,
        ];
      } else {
        patchesToSend = this.patches;
      }

      patchesToSend = this.options.transformStatePatches(
        this.state,
        patchesToSend,
        client.id,
      );

      if (patchesToSend.length > 0) {
        client.socket.send(
          await encodeServerToClientMessage({
            type: "patch",
            patches: patchesToSend,
          }),
        );
      }
    }

    this.patches = [];
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

export interface SyncServerOptions<State, HandshakeReturn> {
  path: string;
  httpServer: http.Server;
  initialState: State;
  handshake: (
    clientId: ClientId,
    data: HandshakeData,
  ) => Promise<Result<HandshakeReturn, string>>;
  transformStatePatches: StatePatchTransformer<State>;
  logger?: Pick<typeof console, "info" | "error">;
  onConnection?: (clientId: ClientId, handshake: HandshakeReturn) => unknown;
  onDisconnect?: (clientId: ClientId) => unknown;
}

export type StatePatchTransformer<State> = (
  state: State,
  patches: Patch[],
  clientId: ClientId,
) => Patch[];

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

interface ClientInfo {
  id: ClientId;
  socket: WebSocket;
  handshakeData?: HandshakeData;
  needsFullState?: boolean;
}

type ClientInfoMap = Map<ClientId, ClientInfo>;

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
