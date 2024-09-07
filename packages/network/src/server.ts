import { Server as SocketServer } from "socket.io";
import type { DisconnectReason } from "socket.io";

import { type AnyModuleDefinitionRecord, type ModuleRecord } from "./module";
import type {
  SocketIO_Auth,
  SocketIO_ClientToServerEvents,
  SocketIO_DTOParser,
  SocketIO_DTOSerializer,
  SocketIO_RPC as SocketIO_RPC,
  SocketIO_ServerToClientEvents,
} from "./socket";

export class Server<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  ServerContext,
  StateUpdate,
  ClientId extends string = string,
> {
  private wss: SocketServer<
    SocketIO_ClientToServerEvents,
    SocketIO_ServerToClientEvents<StateUpdate>,
    object
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

    this.wss.on("connection", async (socket) => {
      const socketContext = () => {
        return createContext({
          clientId: socket.id as ClientId,
          auth: options.parseAuth?.(socket.handshake.auth),
        });
      };

      try {
        await onConnection?.(
          socket.recovered ? "recovered" : "new",
          await socketContext(),
        );
      } catch (e) {
        onError?.(e, "connection");
      }

      socket.once("disconnect", async (reason) => {
        try {
          await onDisconnect?.(reason, await socketContext());
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
            context: await socketContext(),
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
  createContext: (
    options: CreateContextOptions<ClientId>,
  ) => ServerContext | Promise<ServerContext>;
  parseRPC: SocketIO_DTOParser<SocketIO_RPC>;
  parseAuth?: (auth: Record<string, string>) => SocketIO_Auth | undefined;
  serializeRPCOutput: SocketIO_DTOSerializer<unknown>;
  serializeStateUpdate: SocketIO_DTOSerializer<StateUpdate>;
  onConnection?: (
    reason: ConnectReason,
    context: ServerContext,
  ) => unknown | Promise<unknown>;
  onDisconnect?: (
    reason: DisconnectReason,
    context: ServerContext,
  ) => unknown | Promise<unknown>;
  onError?: ServerErrorHandler;
  onMessageIgnored?: (message: SocketIO_RPC) => void;
}

export interface CreateContextOptions<ClientId extends string> {
  clientId: ClientId;
  auth?: SocketIO_Auth;
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
