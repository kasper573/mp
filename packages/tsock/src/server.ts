import { Server as SocketServer } from "socket.io";
import type {
  EventDefinition,
  EventHandlerArg,
  EventOrigin,
  Module,
} from "./module";
import { type AnyModuleDefinitionRecord, type ModuleRecord } from "./module";
import { Logger } from "./logger";
import type {
  SocketIO_ClientToServerEvents,
  SocketIO_Data,
  SocketIO_ServerToClientEvents,
} from "./socket";
import { transformer } from "./transformer";

export { Factory } from "./factory";
export { Logger };

export type { inferModuleDefinitions } from "./module";
export type { EventResult } from "./event";

export interface CreateServerOptions<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  ServerContext,
  ClientContext,
> {
  modules: ModuleRecord<ModuleDefinitions>;
  createContext: (
    options: CreateServerContextOptions<ClientContext>,
  ) => ServerContext;
  connection?: ServerConnectionModule<ServerContext>;
  logger?: Logger;
}

export class Server<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  ServerContext,
  ClientContext,
> {
  private wss: SocketServer<
    SocketIO_ClientToServerEvents<ClientContext>,
    SocketIO_ServerToClientEvents,
    object,
    SocketIO_Data<ClientContext>
  >;

  private get logger() {
    return this.options.logger?.chain("Server");
  }

  constructor(
    private options: CreateServerOptions<
      ModuleDefinitions,
      ServerContext,
      ClientContext
    >,
  ) {
    const { modules, connection, createContext } = options;
    this.wss = new SocketServer({ transports: ["websocket"] });
    this.wss.on("connection", (socket) => {
      socket.once("context", (serializedClientContext) => {
        socket.data = transformer.parse(serializedClientContext);
        this.logger?.info(`connected`, { clientContext: socket.data });
        connection?.connect({
          context: createContext({
            clientContext: socket.data,
            clientId: socket.id,
          }),
        });
      });

      socket.once("disconnect", () => {
        this.logger?.info(`disconnected`, { clientContext: socket.data });
        connection?.disconnect({
          context: createContext({
            clientContext: socket.data,
            clientId: socket.id,
          }),
        });
      });

      socket.on("message", (serializedData) => {
        const { moduleName, eventName, payload, clientContext } =
          transformer.parse(serializedData);

        socket.data = clientContext;

        const module = modules[moduleName];
        const log = this.logger?.chain(moduleName, eventName);

        if (module.$getEventOrigin(eventName) !== "client") {
          log?.warn(`event may not be triggered by clients`, {
            payload,
            clientContext,
            socketId: socket.id,
          });
          return;
        }

        log?.info(`<<`, { payload, clientContext });

        try {
          module[eventName]({
            payload,
            context: createContext({ clientContext, clientId: socket.id }),
          });
        } catch (e) {
          log?.error(`error while triggering event`, e);
        }
      });
    });

    for (const moduleName in options.modules) {
      const module = options.modules[moduleName];
      module.$subscribe((event) => {
        this.logger?.chain(moduleName, event.name).info(">>", ...event.args);
        this.wss.emit(
          "message",
          transformer.serialize({
            moduleName: String(moduleName),
            eventName: String(event.name),
            payload: event.args[0].payload,
          }),
        );
      });
    }
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

export interface CreateServerContextOptions<ClientContext> {
  clientContext: ClientContext;
  clientId: string;
}

/**
 * An optional module that can be used to handle server connection events.
 */
export type ServerConnectionModule<ServerContext> = Module<{
  connect: EventDefinition<EventOrigin, EventHandlerArg<void, ServerContext>>;
  disconnect: EventDefinition<
    EventOrigin,
    EventHandlerArg<void, ServerContext>
  >;
}>;
