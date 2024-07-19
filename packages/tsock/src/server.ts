import { Server as SocketServer } from "socket.io";
import { id, transports } from "./shared";
import type {
  AnyEventRecord,
  AnyModuleDefinitionRecord,
  ModuleEvents,
  ModuleRecord,
} from "./module";
import type { DiscriminatedEvent } from "./EventBus";

export { Factory } from "./factory";

export type { inferModuleDefinitions } from "./module";

export interface CreateServerOptions<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  ServerContext,
  ClientContext,
> {
  modules: ModuleRecord<ModuleDefinitions>;
  createContext: (clientContext: ClientContext) => ServerContext;
  log?: typeof console.log;
}

export class Server<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  ServerContext,
  ClientContext,
> {
  private wss: SocketServer;

  constructor(
    private options: CreateServerOptions<
      ModuleDefinitions,
      ServerContext,
      ClientContext
    >,
  ) {
    this.wss = new SocketServer({ transports });
    this.wss.on("connection", (socket) => {
      socket.on("message", (moduleName, eventName, payload, clientContext) => {
        const context = this.options.createContext(clientContext);
        this.options.log?.("received", id(moduleName, eventName), {
          payload,
          clientContext,
          context,
        });

        const mod = options.modules[moduleName];
        const event = mod[eventName];
        event({ payload, context });
      });
    });

    for (const [moduleName, mod] of Object.entries(options.modules)) {
      mod.$subscribe(
        (event: DiscriminatedEvent<ModuleEvents<AnyEventRecord>>) => {
          this.options.log?.(
            "emitting",
            id(moduleName, event.name),
            ...event.args,
          );
          this.wss.emit(moduleName, event.name, ...event.args);
        },
      );
    }
  }

  listen(port: number) {
    this.wss.listen(port);
  }

  close() {
    this.wss.close();
  }
}
