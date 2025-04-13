import { QueryClient } from "@mp/solid-trpc";
import { env } from "../env";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: env.retryRpcQueries ? 1 : false,
        throwOnError: true,
        refetchOnWindowFocus: false,
        refetchOnMount: true,
        refetchOnReconnect: true,
      },
    },
  });
}
