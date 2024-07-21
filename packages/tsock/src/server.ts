import { Server as SocketServer } from "socket.io";
import { type AnyModuleDefinitionRecord, type ModuleRecord } from "./module";
import { Logger } from "./logger";

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
  createContext: (clientContext: ClientContext) => ServerContext;
  logger?: Logger;
}

export class Server<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  ServerContext,
  ClientContext,
> {
  private wss: SocketServer;

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
    this.wss = new SocketServer({ transports: ["websocket"] });
    this.wss.on("connection", (socket) => {
      socket.on("message", (moduleName, eventName, payload, context) => {
        const module = options.modules[moduleName];
        const log = this.logger?.chain(moduleName, eventName);

        if (module.$getEventOrigin(eventName) !== "client") {
          log?.warn(`event may not be triggered by clients`, {
            payload,
            context,
          });
          return;
        }

        log?.info(`<<`, { payload, context });

        try {
          module[eventName]({
            payload,
            context: options.createContext(context),
          });
        } catch (e) {
          log?.error(`error while triggering event`, e);
        }
      });
    });

    for (const moduleName in options.modules) {
      const module = options.modules[moduleName];
      module.$subscribe(({ name, args: [{ payload, context }] }) => {
        this.logger?.chain(moduleName, name).info(">>", { payload, context });
        this.wss.emit(moduleName, name, payload);
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
