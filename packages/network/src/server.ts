import { Server as SocketServer } from "socket.io";
import type { DisconnectReason } from "socket.io";

import { type AnyModuleDefinitionRecord, type ModuleRecord } from "./module";
import type {
  SocketIO_ClientToServerEvents,
  SocketIO_DTOParser,
  SocketIO_DTOSerializer,
  SocketIO_Headers,
  SocketIO_RPC as SocketIO_RPC,
  SocketIO_RPCResponse,
  SocketIO_ServerToClientEvents,
} from "./socket";

export class Server<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  ServerContext,
  ClientId extends string = string,
> {
  private wss: SocketServer<
    SocketIO_ClientToServerEvents,
    SocketIO_ServerToClientEvents,
    object
  >;

  listen: SocketServer["listen"];

  constructor(
    protected readonly options: CreateServerOptions<
      ModuleDefinitions,
      ServerContext,
      ClientId
    >,
  ) {
    const {
      modules,
      createContext,
      parseRPC,
      serializeRPCResponse,
      onError,
      onMessageIgnored,
      onConnection,
      onDisconnect,
    } = options;

    this.wss = new SocketServer({
      transports: ["websocket"],
      connectionStateRecovery: {},
    });

    this.listen = (...args) => this.wss.listen(...args);

    this.wss.on("connection", async (socket) => {
      const socketContext = (headers?: SocketIO_Headers) => {
        return createContext({
          clientId: socket.id as ClientId,
          headers,
        });
      };

      let connectContext;
      try {
        connectContext = await socketContext();
        await onConnection?.(
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
          await onDisconnect?.(reason, disconnectContext);
        } catch (error) {
          onError?.({ type: "disconnect", error, context: disconnectContext });
        }
      });

      socket.on("rpc", async (serializedRPC, respondWithOutput) => {
        let rpc;
        let rpcContext;
        try {
          rpc = parseRPC(serializedRPC);
          const { moduleName, procedureName, input, headers } = rpc;
          const module = modules[moduleName];

          if (module.$getProcedureType(procedureName) !== "client-to-server") {
            onMessageIgnored?.(rpc);
            return;
          }

          rpcContext = await socketContext(headers);
          const output: unknown = await module[procedureName]({
            input,
            context: rpcContext,
          });

          respondWithOutput(serializeRPCResponse({ ok: true, output }));
        } catch (error) {
          respondWithOutput(
            serializeRPCResponse({ ok: false, error: String(error) }),
          );
          onError?.({ type: "rpc", error, rpc, context: rpcContext });
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

export { Factory } from "./factory";

export interface CreateServerOptions<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  ServerContext,
  ClientId extends string,
> {
  modules: ModuleRecord<ModuleDefinitions>;
  createContext: (
    options: CreateContextOptions<ClientId>,
  ) => ServerContext | Promise<ServerContext>;
  parseRPC: SocketIO_DTOParser<SocketIO_RPC>;
  serializeRPCResponse: SocketIO_DTOSerializer<SocketIO_RPCResponse<unknown>>;
  onConnection?: (
    reason: ConnectReason,
    context: ServerContext,
  ) => void | undefined | Promise<unknown>;
  onDisconnect?: (
    reason: DisconnectReason,
    context: ServerContext,
  ) => void | undefined | Promise<unknown>;
  onError?: ServerErrorHandler<ServerContext>;
  onMessageIgnored?: (message: SocketIO_RPC) => void;
}

export interface CreateContextOptions<ClientId extends string> {
  clientId: ClientId;
  headers?: SocketIO_Headers;
}

export interface ServerError<ServerContext, Type = ServerErrorType> {
  error: unknown;
  type: Type;
  rpc?: SocketIO_RPC;
  context?: ServerContext;
}

export type ServerErrorType = "connection" | "disconnect" | "rpc";

export type ServerErrorHandler<ServerContext> = (
  error: ServerError<ServerContext>,
) => void;

export type { inferModuleDefinitions } from "./module";
export type { SocketIO_DTO } from "./socket";

export type ConnectReason = "new" | "recovered";

export { type DisconnectReason } from "socket.io";
