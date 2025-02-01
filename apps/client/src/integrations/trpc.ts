import type { RootRouter } from "@mp/server";
import { transformer, tokenHeaderName } from "@mp/server";
import {
  createTRPCSolidClient,
  httpBatchLink,
  createTRPCHook,
} from "@mp/solid-trpc";
import { type AuthClient } from "@mp/auth/client";
import { QueryClientContext } from "@tanstack/solid-query";
import { useContext } from "solid-js";
import { env } from "../env";
import { LoggerContext } from "../logger";

export const CANCEL_INVALIDATE = Symbol("CANCEL_INVALIDATE");

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
      return async function onMutation({ meta }) {
        if (!meta?.cancelInvalidate) {
          // Invalidate all queries on successful mutations
          // This is a bit inefficient, but it promotes correctness over performance.
          logger.info("Invalidating all queries due to successful mutation");
          await query?.().invalidateQueries();
        }
      };
    },
  });
}

export const useTRPC = createTRPCHook<RootRouter>();
