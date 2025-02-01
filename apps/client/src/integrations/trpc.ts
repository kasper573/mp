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

export function createTRPCClient(auth: AuthClient, queryClient: QueryClient) {
  return createTRPCSolidClient<RootRouter>({
    queryClient,
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
  });
}

export const useTRPC = createTRPCHook<RootRouter>();
