import { Server as SocketServer } from "socket.io";
import type { Logger } from "@mp/logger";
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
  createContext: (options: CreateContextOptions) => ServerContext;
  connection?: ServerConnectionModule<ServerContext>;
  parseMessage: Parser<SocketIO_Message>;
  serializeClientState: Serializer<ClientState>;
  logger?: Logger;
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

  private get logger() {
    return this.options.logger?.chain("Server");
  }

  constructor(
    protected readonly options: CreateServerOptions<
      ModuleDefinitions,
      ServerContext,
      ClientState
    >,
  ) {
    const { modules, connection, createContext, parseMessage } = options;
    this.wss = new SocketServer({ transports: ["websocket"] });
    this.wss.on("connection", (socket) => {
      this.logger?.info(`connected`, { clientId: socket.id });

      connection?.connect({
        context: createContext({ clientId: socket.id }),
      });

      socket.once("disconnect", () => {
        this.logger?.info(`disconnected`, { clientContext: socket.data });
        connection?.disconnect({
          payload: "unknown", // TODO: add reason
          context: createContext({ clientId: socket.id }),
        });
      });

      socket.on("message", (serializedMessage) => {
        const { moduleName, eventName, payload } =
          parseMessage(serializedMessage);

        const module = modules[moduleName];
        const log = this.logger?.chain(moduleName, eventName);

        if (module.$getEventType(eventName) !== "client-to-server") {
          log?.warn(`event may not be triggered by clients`, {
            payload,
            socketId: socket.id,
          });
          return;
        }

        log?.info({ clientId: socket.id, payload });

        try {
          module[eventName]({
            payload,
            context: createContext({ clientId: socket.id }),
          });
        } catch (e) {
          log?.error(`error while triggering event`, e);
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
    this.logger?.info(`listening on port ${port}`);
  }

  close() {
    this.wss.close();
    this.logger?.info(`closed`);
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

export type DisconnectReason = "consented" | "unknown";
