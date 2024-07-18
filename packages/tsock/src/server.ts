import { Server as SocketServer } from "socket.io";
import { id, transports } from "./shared";
import type { AnyModules } from "./module";

export { Factory } from "./factory";

export interface CreateServerOptions<
  Modules extends AnyModules<ServerContext>,
  ServerContext,
  ClientContext,
> {
  modules: Modules;
  createContext: (clientContext: ClientContext) => ServerContext;
  log?: typeof console.log;
}

export class Server<
  Modules extends AnyModules<ServerContext>,
  ServerContext,
  ClientContext,
> {
  private wss: SocketServer;

  constructor(
    private options: CreateServerOptions<Modules, ServerContext, ClientContext>,
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

        options.modules[moduleName].invoke(eventName, payload, context);
      });
    });

    for (const [moduleName, mod] of Object.entries(options.modules)) {
      mod.subscribeAny((eventName, payload, context) => {
        this.options.log?.("emitting", id(moduleName, eventName), {
          payload,
          context,
        });
        this.wss.emit(moduleName, eventName, payload, context);
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
