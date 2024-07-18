import { Server as SocketServer } from "socket.io";
import { transports } from "./shared";
import type { AnyModules } from "./module";

export { Factory } from "./factory";

export interface CreateServerOptions<
  Modules extends AnyModules<ServerContext>,
  ServerContext,
  ClientContext,
> {
  modules: Modules;
  createContext: (clientContext: ClientContext) => ServerContext;
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
        console.log("received", moduleName, eventName, payload, clientContext);
        const context = this.options.createContext(clientContext);
        options.modules[moduleName].invoke(eventName, payload, context);
      });
    });

    for (const [moduleName, mod] of Object.entries(options.modules)) {
      mod.subscribeAny((eventName, payload, context) => {
        console.log("emitting", moduleName, eventName, payload, context);
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
