import type { RootRouter } from "@mp/server";
import { tokenHeaderName, transformer } from "@mp/server";
import {
  createTRPCHook,
  createTRPCSolidClient,
  httpBatchLink,
} from "@mp/solid-trpc";
import { type AuthClient } from "@mp/auth-client";
import { QueryClientContext } from "@tanstack/solid-query";
import { useContext } from "npm:solid-js";
import { env } from "../env.ts";
import { LoggerContext } from "../logger.ts";

export function createTRPCClient(auth: AuthClient) {
  return createTRPCSolidClient<RootRouter>({
    links: [
      httpBatchLink({
        url: env.apiUrl,
        transformer,
        async headers() {
          await auth.refresh(); // Ensure we have the latest user identity
          return {
            [tokenHeaderName]: auth.identity()?.token ?? "",
          };
        },
      }),
    ],
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
