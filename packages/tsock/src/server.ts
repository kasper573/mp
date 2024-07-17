import { Server as SocketServer } from "socket.io";
import type {
  AnyRouterOrOperationDefinition,
  CreateContextOptions,
  OperationDefinition,
  OperationEmitter,
  RouterDefinition,
  Unsubscribe,
} from "./shared";
import { Initializer } from "./shared";
import type {
  ClientToServerEvents,
  InterServerEvents,
  RouterPath,
  ServerToClientEvents,
  SocketData,
} from "./socket";

export { CreateContextOptions };

export class Server<
  ClientContext,
  ServerContext,
  Router extends RouterDefinition<ServerContext>,
> {
  private socketServer = new SocketServer<
    ClientToServerEvents<ClientContext>,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >();

  constructor(
    private options: CreateServerOptions<ClientContext, ServerContext, Router>,
  ) {}

  listen(port: number): Unsubscribe {
    this.socketServer.on("connection", (socket) => {
      this.logClientCount();
      socket.on("operation", this.handleOperation.bind(this));
      socket.on("disconnect", this.logClientCount.bind(this));
    });
    this.socketServer.listen(port);
    return () => this.socketServer.close();
  }

  private async handleOperation(
    clientContext: ClientContext,
    path: RouterPath,
    input: unknown,
  ) {
    const serverContext = this.options.createContext({ clientContext });
    const handlerResult = this.unsafelySelectHandler(path);
    if (!handlerResult.ok) {
      // TODO send error ack to client
      this.log(handlerResult.error);
      return;
    }

    this.log("handling operation", path, {
      clientContext,
      input,
    });

    const emit: OperationEmitter<unknown> = {
      complete: () => this.log("emitter complete"),
      error: (error) => this.log("emitter error", error),
      next: (value) => this.log("emitter next", value),
    };

    handlerResult.value({ context: serverContext, input, emit });
  }

  private unsafelySelectHandler(
    path: RouterPath,
  ): Result<OperationDefinition<ServerContext, unknown>, string> {
    const handler = path.reduce(
      (current, key: string) => current?.[key as keyof typeof current],
      this.options.router as AnyRouterOrOperationDefinition<ServerContext>,
    );

    if (!handler) {
      return {
        ok: false,
        error: `No handler found for path: ${path.join(".")}`,
      };
    }

    return {
      ok: true,
      value: handler as OperationDefinition<ServerContext, unknown>,
    };
  }

  private logClientCount() {
    this.log("clients", this.socketServer.sockets.sockets.size);
  }

  private log(...args: unknown[]) {
    this.options.log?.("[tsock server]", ...args);
  }
}

export interface CreateServerOptions<
  ClientContext,
  ServerContext,
  Router extends RouterDefinition<ServerContext>,
> {
  router: Router;
  createContext: (
    options: CreateContextOptions<ClientContext>,
  ) => ServerContext;
  log?: typeof console.log;
}

export const init = new Initializer();

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
