import { Server as SocketServer } from "socket.io";
import type { DisconnectReason } from "socket.io";

import { type AnyModuleDefinitionRecord, type ModuleRecord } from "./module";
import type {
  SocketIO_ClientToServerEvents,
  SocketIO_DTOParser,
  SocketIO_DTOSerializer,
  SocketIO_RPC as SocketIO_RPC,
  SocketIO_ServerToClientEvents,
} from "./socket";

export class Server<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  ServerContext,
  ClientContext,
  StateUpdate,
  ClientId extends string = string,
> {
  private wss: SocketServer<
    SocketIO_ClientToServerEvents,
    SocketIO_ServerToClientEvents<StateUpdate>,
    object,
    ClientContext
  >;

  listen: SocketServer["listen"];

  constructor(
    protected readonly options: CreateServerOptions<
      ModuleDefinitions,
      ServerContext,
      StateUpdate,
      ClientId
    >,
  ) {
    const {
      modules,
      createContext,
      parseRPC,
      serializeRPCOutput,
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

    this.wss.on("connection", (socket) => {
      const socketContext = () =>
        createContext({ clientId: socket.id as ClientId });

      try {
        onConnection?.(socket.recovered ? "recovered" : "new", socketContext());
      } catch (e) {
        onError?.(e, "connection");
      }

      socket.once("disconnect", (reason) => {
        try {
          onDisconnect?.(reason, socketContext());
        } catch (e) {
          onError?.(e, "disconnect");
        }
      });

      socket.on("rpc", async (serializedRPC, respondWithOutput) => {
        let message;
        try {
          message = parseRPC(serializedRPC);
          const { moduleName, procedureName, input } = message;
          const module = modules[moduleName];

          if (module.$getProcedureType(procedureName) !== "client-to-server") {
            onMessageIgnored?.(message);
            return;
          }

          const output = await module[procedureName]({
            input,
            context: socketContext(),
          });

          respondWithOutput(serializeRPCOutput(output));
        } catch (e) {
          onError?.(e, "message", message);
        }
      });
    });
  }

  sendStateUpdate(clientId: ClientId, update: StateUpdate) {
    const socket = this.wss.sockets.sockets.get(clientId);
    socket?.emit("stateUpdate", this.options.serializeStateUpdate(update));
  }

  close() {
    this.wss.close();
  }
}

export { Factory } from "./factory";

export interface CreateServerOptions<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  ServerContext,
  StateUpdate,
  ClientId extends string,
> {
  modules: ModuleRecord<ModuleDefinitions>;
  createContext: (options: CreateContextOptions<ClientId>) => ServerContext;
  parseRPC: SocketIO_DTOParser<SocketIO_RPC>;
  serializeRPCOutput: SocketIO_DTOSerializer<unknown>;
  serializeStateUpdate: SocketIO_DTOSerializer<StateUpdate>;
  onConnection?: (reason: ConnectReason, context: ServerContext) => void;
  onDisconnect?: (reason: DisconnectReason, context: ServerContext) => void;
  onError?: ServerErrorHandler;
  onMessageIgnored?: (message: SocketIO_RPC) => void;
}

export interface CreateContextOptions<ClientId extends string> {
  clientId: ClientId;
}

export type ServerErrorHandler = (
  error: unknown,
  procedure: "connection" | "disconnect" | "message",
  message?: SocketIO_RPC,
) => void;

export type { DisconnectReason };
export type { inferModuleDefinitions } from "./module";
export type { SocketIO_DTO } from "./socket";

export type ConnectReason = "new" | "recovered";
