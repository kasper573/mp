import { Server as SocketServer } from "socket.io";
import type { DisconnectReason } from "socket.io";
import type {
  EventDefinition,
  EventHandlerArg,
  EventType,
  Module,
} from "./module";
import { type AnyModuleDefinitionRecord, type ModuleRecord } from "./module";
import type {
  SocketIO_ClientToServerEvents,
  SocketIO_Data,
  SocketIO_Message,
  SocketIO_ServerToClientEvents,
} from "./socket";
import type { Parser, Serializer } from "./serialization";

export { Factory } from "./factory";
export type * from "./serialization";
export type { inferModuleDefinitions } from "./module";
export type { EventResult } from "./event";

export interface CreateServerOptions<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  ServerContext,
  ClientState,
> {
  modules: ModuleRecord<ModuleDefinitions>;
  connection?: ServerConnectionModule<ServerContext>;
  createContext: (options: CreateContextOptions) => ServerContext;
  parseMessage: Parser<SocketIO_Message>;
  serializeClientState: Serializer<ClientState>;
  onError?: (
    error: unknown,
    event: "connection" | "disconnect" | "message",
    message?: SocketIO_Message,
  ) => void;
  onMessageIgnored?: (message: SocketIO_Message) => void;
}

export class Server<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  ServerContext,
  ClientContext,
  ClientState,
> {
  private wss: SocketServer<
    SocketIO_ClientToServerEvents,
    SocketIO_ServerToClientEvents<ClientState>,
    object,
    SocketIO_Data<ClientContext>
  >;

  constructor(
    protected readonly options: CreateServerOptions<
      ModuleDefinitions,
      ServerContext,
      ClientState
    >,
  ) {
    const {
      modules,
      connection,
      createContext,
      parseMessage,
      onError,
      onMessageIgnored: onEventIgnored,
    } = options;
    this.wss = new SocketServer({ transports: ["websocket"] });
    this.wss.on("connection", (socket) => {
      try {
        connection?.connect({
          context: createContext({ clientId: socket.id }),
        });
      } catch (e) {
        onError?.(e, "connection");
      }

      socket.once("disconnect", (reason) => {
        try {
          connection?.disconnect({
            payload: reason,
            context: createContext({ clientId: socket.id }),
          });
        } catch (e) {
          onError?.(e, "disconnect");
        }
      });

      socket.on("message", (serializedMessage) => {
        let message;
        try {
          message = parseMessage(serializedMessage);
          const { moduleName, eventName, payload } = message;
          const module = modules[moduleName];

          if (module.$getEventType(eventName) !== "client-to-server") {
            onEventIgnored?.(message);
            return;
          }

          module[eventName]({
            payload,
            context: createContext({ clientId: socket.id }),
          });
        } catch (e) {
          onError?.(e, "message", message);
        }
      });
    });
  }

  sendClientState(clientId: string, clientState: ClientState) {
    const socket = this.wss.sockets.sockets.get(clientId);
    socket?.emit("clientState", this.options.serializeClientState(clientState));
  }

  listen(port: number) {
    this.wss.listen(port);
  }

  close() {
    this.wss.close();
  }
}

export interface CreateContextOptions {
  clientId: string;
}

/**
 * An optional module that can be used to handle server connection events.
 */
export type ServerConnectionModule<ServerContext> = Module<{
  connect: EventDefinition<EventType, EventHandlerArg<void, ServerContext>>;
  disconnect: EventDefinition<
    EventType,
    EventHandlerArg<DisconnectReason, ServerContext>
  >;
}>;

export type { DisconnectReason };
