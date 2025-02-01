import type { RootRouter } from "@mp/server";
import { transformer, tokenHeaderName } from "@mp/server";
import {
  createTRPCSolidClient,
  httpBatchLink,
  createTRPCHook,
} from "@mp/solid-trpc";
import { type AuthClient } from "@mp/auth/client";
import type { QueryClient } from "@tanstack/solid-query";
import { env } from "../env";

export const CANCEL_INVALIDATE = Symbol("CANCEL_INVALIDATE");

export function createTRPCClient(auth: AuthClient, query: QueryClient) {
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
    async onMutation({ meta }) {
      if (!meta?.cancelInvalidate) {
        // Invalidate all queries on successful mutations
        // This is a bit inefficient, but it promotes correctness over performance.
        await query.invalidateQueries();
      }
    },
  });
}

export const useTRPC = createTRPCHook<RootRouter>();
