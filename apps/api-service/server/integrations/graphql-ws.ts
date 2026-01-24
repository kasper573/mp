import type http from "http";
import { CloseCode, makeServer } from "graphql-ws";
import type { WebSocketServerOptions } from "@mp/ws/server";
import { WebSocketServer } from "@mp/ws/server";
import type { GraphQLSchema } from "graphql";
import type { Logger } from "@mp/logger";
import { opt as serverOptions } from "../options";
import type { ApiContext } from "../context";

export interface InitGraphQLWSServerOptions {
  schema: GraphQLSchema;
  logger: Logger;
  httpServer: http.Server;
  context: (request: http.IncomingMessage) => ApiContext;
}

export function createGraphQLWSServer(
  opt: InitGraphQLWSServerOptions,
): WebSocketServer {
  const wss = new WebSocketServer({
    ...wssConfig(),
    path: serverOptions.graphqlWssPath,
    server: opt.httpServer,
  });

  const gqlServer = makeServer<{}, { request: http.IncomingMessage }>({
    schema: opt.schema,
    context: ({ extra }) => opt.context(extra.request),
  });

  wss.on("connection", (socket, request) => {
    const closed = gqlServer.opened(
      {
        protocol: socket.protocol,
        send: (data) =>
          new Promise((resolve, reject) => {
            socket.send(data, (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          }),
        close: (code, reason) => socket.close(code, reason),
        onMessage: (cb) => {
          socket.on("message", async (event) => {
            try {
              await cb(event.toString());
            } catch (cause) {
              opt.logger.error(new Error("GraphQL WS socket error", { cause }));
              const exposedError = serverOptions.exposeErrorDetails
                ? errorToString(cause)
                : "Internal Server Error";
              socket.close(CloseCode.InternalServerError, exposedError);
            }
          });
        },
      },
      { request },
    );

    socket.once("close", (code, reason) =>
      closed(code, reason.toString("utf-8")),
    );
  });

  return wss;
}

function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function wssConfig(): WebSocketServerOptions {
  return {
    // Arbitrary safety limit to never send too much data,
    // however, in practice we will limit game client sockets to a much smaller size manually.
    maxPayload: 50_000,
    perMessageDeflate: {
      zlibDeflateOptions: {
        chunkSize: 1024,
        memLevel: 7, // default level
        level: 6, // default is 3, max is 9
      },
      zlibInflateOptions: {
        chunkSize: 10 * 1024,
      },
      clientNoContextTakeover: true, // defaults to negotiated value.
      serverNoContextTakeover: true, // defaults to negotiated value.
      serverMaxWindowBits: 10, // defaults to negotiated value.
      concurrencyLimit: 10, // limits zlib concurrency for perf.
      threshold: 1024, // messages under this size won't be compressed.
    },
  };
}
