import type { DisconnectReason } from "socket.io";
import { Server as SocketIOServer } from "socket.io";
import type {
  SocketIO_ClientToServerEvents,
  SocketIO_ServerToClientEvents,
} from "./socket";

export class SocketServer<ClientId extends string = string> {
  private wss: SocketIOServer<
    SocketIO_ClientToServerEvents,
    SocketIO_ServerToClientEvents
  >;

  listen: SocketIOServer["listen"];

  constructor(protected readonly options: SocketServerOptions<ClientId>) {
    const { onAuthenticate, onConnection, onDisconnect } = options;

    this.wss = new SocketIOServer<
      SocketIO_ClientToServerEvents,
      SocketIO_ServerToClientEvents
    >({
      transports: ["websocket"],
      connectionStateRecovery: {},
    });

    this.listen = (...args) => this.wss.listen(...args);

    this.wss.on("connection", async (socket) => {
      const clientId = socket.id as ClientId;

      await onConnection?.(clientId, socket.recovered ? "recovered" : "new");

      socket.on("authenticate", (authToken: string) =>
        onAuthenticate?.(clientId, authToken),
      );

      socket.once("disconnect", async (reason) =>
        onDisconnect?.(clientId, reason),
      );
    });
  }

  sendStateUpdate(clientId: ClientId, update: Uint8Array) {
    const socket = this.wss.sockets.sockets.get(clientId);
    socket?.emit("stateUpdate", update);
  }

  close() {
    this.wss.close();
  }
}

export interface SocketServerOptions<ClientId extends string> {
  onAuthenticate?: (
    clientId: ClientId,
    authToken: string,
  ) => void | undefined | Promise<unknown>;
  onConnection?: (
    clientId: ClientId,
    reason: SocketServerConnectReason,
  ) => void | undefined | Promise<unknown>;
  onDisconnect?: (
    clientId: ClientId,
    reason: DisconnectReason,
  ) => void | undefined | Promise<unknown>;
}

export type SocketServerConnectReason = "new" | "recovered";

export { type DisconnectReason as SocketServerDisconnectReason } from "socket.io";
