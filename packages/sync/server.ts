import { produce, original } from "immer";
import type { WebSocket, WebSocketServer } from "ws";
import { v4 } from "uuid";
import {
  decodeClientToServerMessage,
  encodeServerToClientMessage,
  type ClientId,
  type HandshakeData,
  type ServerToClientMessage,
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
    this.wss = this.options.wss;
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
      const { patchCallback, createClientState } = this.options;
      for (const [clientId, client] of this.clients.entries()) {
        const clientState = createClientState(nextState, clientId);
        const message = { type: "full", state: clientState } as const;
        patchCallback?.(message);
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
  }

  disconnectClient(clientId: ClientId) {
    this.clients.get(clientId)?.socket.close();
  }

  private onConnection = (socket: WebSocket) => {
    const clientId = newClientId();
    const state = this.options.createClientState(this.state, clientId);
    const info: ClientInfo<ClientState> = { socket, state };
    const handshakeTimeoutId = setTimeout(
      () => socket.close(),
      this.options.handshakeTimeout,
    );

    socket.addEventListener("message", (event) => {
      const message = decodeClientToServerMessage(
        event.data as ArrayBufferLike,
      );
      switch (message.type) {
        case "handshake":
          clearTimeout(handshakeTimeoutId);
          this.clients.set(clientId, info);
          void this.options.onConnection?.(clientId, message);
          break;
      }
    });

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

export interface SyncServerOptions<ServerState, ClientState>
  extends ApplyServerStateOptions<ServerState, ClientState> {
  wss: WebSocketServer;
  initialState: ServerState;
  handshakeTimeout: number;
  onConnection?: (
    clientId: ClientId,
    data: HandshakeData,
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
  patchCallback?: (message: ServerToClientMessage<ClientState>) => unknown;
}

interface ClientInfo<ClientState> {
  socket: WebSocket;
  state: ClientState;
  handshakeData?: HandshakeData;
}

type ClientInfoMap<ClientState> = Map<ClientId, ClientInfo<ClientState>>;

const newClientId = v4 as unknown as () => ClientId;

export type { ClientId, HandshakeData } from "./shared";
