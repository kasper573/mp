import { Server as SocketIOServer } from "socket.io";
import type { DisconnectReason } from "socket.io";
import type { SocketIO_Headers } from "./socket";

export class SocketServer<ServerContext, ClientId extends string = string> {
  private wss: SocketIOServer;

  listen: SocketIOServer["listen"];

  constructor(
    protected readonly options: SocketServerOptions<ServerContext, ClientId>,
  ) {
    const { createContext, onError, onConnection, onDisconnect } = options;

    this.wss = new SocketIOServer({
      transports: ["websocket"],
      connectionStateRecovery: {},
    });

    this.listen = (...args) => this.wss.listen(...args);

    this.wss.on("connection", async (socket) => {
      const clientId = socket.id as ClientId;
      const socketContext = (headers?: SocketIO_Headers) => {
        return createContext({
          clientId,
          headers,
        });
      };

      let connectContext;
      try {
        connectContext = await socketContext();
        await onConnection?.(
          clientId,
          socket.recovered ? "recovered" : "new",
          connectContext,
        );
      } catch (error) {
        onError?.({ type: "connection", error, context: connectContext });
      }

      socket.once("disconnect", async (reason) => {
        let disconnectContext;
        try {
          disconnectContext = await socketContext();
          await onDisconnect?.(clientId, reason, disconnectContext);
        } catch (error) {
          onError?.({ type: "disconnect", error, context: disconnectContext });
        }
      });
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

export interface SocketServerOptions<ServerContext, ClientId extends string> {
  createContext: (
    clientInfo: SocketServerClientInfo<ClientId>,
  ) => ServerContext | Promise<ServerContext>;
  onConnection?: (
    clientId: ClientId,
    reason: SocketServerConnectReason,
    context: ServerContext,
  ) => void | undefined | Promise<unknown>;
  onDisconnect?: (
    clientId: ClientId,
    reason: DisconnectReason,
    context: ServerContext,
  ) => void | undefined | Promise<unknown>;
  onError?: SocketServerErrorHandler<ServerContext>;
}

export interface SocketServerClientInfo<ClientId extends string> {
  clientId: ClientId;
  headers?: SocketIO_Headers;
}

export interface SocketServerError<
  ServerContext,
  Type = SocketServerErrorType,
> {
  error: unknown;
  type: Type;
  context?: ServerContext;
}

export type SocketServerErrorType = "connection" | "disconnect" | "rpc";

export type SocketServerErrorHandler<ServerContext> = (
  error: SocketServerError<ServerContext>,
) => void;

export type SocketServerConnectReason = "new" | "recovered";

export { type DisconnectReason as SocketServerDisconnectReason } from "socket.io";
