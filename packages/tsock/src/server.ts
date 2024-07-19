import { Server as SocketServer } from "socket.io";
import { id, transports } from "./shared";
import type { AnyModuleDefinitionRecord, ModuleRecord } from "./module";

export { Factory } from "./factory";

export type { inferModuleDefinitions } from "./module";
export type { EventResult } from "./EventBus";

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

        const module = options.modules[moduleName];

        if (module.getEventType(eventName) === "private") {
          this.options.log?.(
            `Event "${id(moduleName, eventName)}" is private and may not be triggered by clients`,
            { payload, context: clientContext },
          );
          return;
        }

        this.options.log?.("triggering", id(moduleName, eventName), {
          payload,
          clientContext,
          context,
        });

        try {
          module[eventName]({ payload, context });
        } catch (e) {
          this.options.log?.(
            `Error while triggering event "${id(moduleName, eventName)}"`,
            e,
          );
        }
      });
    });

    for (const moduleName in options.modules) {
      const module = options.modules[moduleName];
      module.$subscribe(({ name, args: [{ payload }] }) => {
        this.options.log?.("emitting", id(moduleName, name), payload);
        this.wss.emit(moduleName, name, payload);
      });
    }
  }

  listen(port: number) {
    this.wss.listen(port);
  }

  close() {
    this.wss.close();
  }
}
