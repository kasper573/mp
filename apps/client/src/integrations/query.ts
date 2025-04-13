import { QueryClient } from "@mp/solid-trpc";
import { env } from "../env";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: env.retryRpcQueries ? 3 : false,
        throwOnError: true,
        refetchOnWindowFocus: true,
        refetchOnMount: true,
        refetchOnReconnect: true,
      },
    },
  });
}
