import type { RootRouter } from "@mp/server";
import { transformer, tokenHeaderName } from "@mp/server";
import {
  createTRPCSolidClient,
  httpBatchLink,
  createTRPCHook,
} from "@mp/solid-trpc";
import { QueryClientContext } from "@tanstack/solid-query";
import { useContext } from "solid-js";
import { env } from "../env";
import { LoggerContext } from "../logger";
import { UserIdentityContext } from "./userIdentity";

export function createTRPCClient() {
  return createTRPCSolidClient<RootRouter>({
    links: [
      httpBatchLink({
        url: env.apiUrl,
        transformer,
        headers({ opList: [{ context }] }) {
          const { identity } = context as RequestContext;
          return { [tokenHeaderName]: identity()?.token ?? "" };
        },
      }),
    ],
    createRequestContext,
    createMutationHandler() {
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
    },
  });
}

export const useTRPC = createTRPCHook<RootRouter>();

type RequestContext = ReturnType<typeof createRequestContext>;

function createRequestContext() {
  const identity = useContext(UserIdentityContext);
  return { identity };
}
