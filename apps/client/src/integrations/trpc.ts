import type { RootRouter } from "@mp/server";
import { transformer } from "@mp-modules/trpc";

import {
  createTRPCSolidClient,
  httpBatchLink,
  createTRPCHook,
} from "@mp/solid-trpc";
import { QueryClientContext } from "@mp/solid-trpc";
import { useContext } from "solid-js";
import { AuthContext } from "@mp/auth/client";
import { env } from "../env";
import { LoggerContext } from "../logger";

export function createTRPCClient() {
  return createTRPCSolidClient<RootRouter>({
    links: [
      httpBatchLink({
        url: env.apiUrl,
        transformer,
        headers({ opList: [{ context }] }) {
          const { identity } = context as RequestContext;
          const token = identity()?.token;
          return {
            Authorization: token ? `Bearer ${token}` : undefined,
          };
        },
      }),
    ],
    createRequestContext,
    createMutationHandler,
  });
}

export const useTRPC = createTRPCHook<RootRouter>();

type RequestContext = ReturnType<typeof createRequestContext>;

function createRequestContext() {
  const { identity } = useContext(AuthContext);
  return { identity };
}

function createMutationHandler() {
  const query = useContext(QueryClientContext);
  const logger = useContext(LoggerContext);
  return function onMutation({ meta: { invalidateCache = true } = {} }) {
    if (invalidateCache) {
      // Invalidate all queries on successful mutations
      // This is a bit inefficient, but it promotes correctness over performance.
      logger.info("Invalidating all queries due to successful mutation");
      void query?.().invalidateQueries();
    }
  };
}
