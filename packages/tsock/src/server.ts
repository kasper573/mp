import { Server as SocketServer } from "socket.io";
import type {
  EventHandler,
  EventPath,
  EventPayload,
  SocketIO_ClientToServerEvents,
  SocketIO_ServerToClientEvents,
} from "./shared";
import { Initializer, transports } from "./shared";
import { flattened } from "./flattened";

export function createServer<Router, ServerContext, ClientContext>({
  createContext,
  router,
}: CreateServerOptions<Router, ServerContext, ClientContext>): Server<
  Router,
  ClientContext
> {
  const handlers = flattened(router);
  const server = new SocketServer({ transports });
  server.on("connection", (socket) => {
    socket.onAny(
      <Path extends EventPath<Router>>(
        path: Path,
        payload: EventPayload<Path, Router>,
        clientContext: ClientContext,
      ) => {
        const context = createContext(clientContext);
        const handler = handlers[path] as
          | EventHandler<EventPayload<Path, Router>, ServerContext>
          | undefined;

        handler?.({ payload, context });
      },
    );
  });
  return server;
}

export interface CreateServerOptions<Router, ServerContext, ClientContext> {
  router: Router;
  createContext: (clientContext: ClientContext) => ServerContext;
}

export const init = new Initializer();

export type Server<Router, ClientContext> = SocketServer<
  SocketIO_ClientToServerEvents<Router, ClientContext>,
  SocketIO_ServerToClientEvents<Router>
>;
