import type http from "http";
import { useServer } from "graphql-ws/use/ws";
import type { WebSocketServerOptions } from "@mp/ws/server";
import { WebSocketServer } from "@mp/ws/server";
import type { GraphQLSchema } from "graphql";
import type { Logger } from "@mp/logger";
import { opt as serverOptions } from "../options";
import type { ApiContext } from "../context";
import type { GraphQLWSConnectionParams } from "../../shared/ws";
import type { ApolloServerPlugin } from "@apollo/server";

export interface InitGraphQLWSServerOptions {
  schema: GraphQLSchema;
  logger: Logger;
  httpServer: http.Server;
  context: (connectionParams?: GraphQLWSConnectionParams) => ApiContext;
}

export function setupGraphQLWSServer(
  opt: InitGraphQLWSServerOptions,
): [WebSocketServer, ApolloServerPlugin[]] {
  const wss = new WebSocketServer({
    ...wssConfig(),
    path: serverOptions.graphqlWssPath,
    server: opt.httpServer,
  });

  // oxlint-disable-next-line rules-of-hooks
  const serverCleanup = useServer(
    {
      schema: opt.schema,
      context: ({ connectionParams }) => opt.context(connectionParams),
    },
    wss,
  );

  const disposePlugin: ApolloServerPlugin = {
    // oxlint-disable-next-line require-await
    async serverWillStart() {
      return {
        async drainServer() {
          await serverCleanup.dispose();
        },
      };
    },
  };

  return [wss, [disposePlugin]];
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
