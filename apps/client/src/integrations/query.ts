import { QueryClient } from "@mp/solid-trpc";
import { env } from "../env";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: env.retryRpcQueries,
        throwOnError: true,
        refetchOnWindowFocus: true,
        refetchOnMount: true,
        refetchOnReconnect: true,
      },
    },
  });
}
