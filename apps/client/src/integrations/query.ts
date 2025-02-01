import { QueryClient } from "@tanstack/solid-query";

export function createQueryClient() {
  const client: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        throwOnError: true,
        refetchOnWindowFocus: true,
        refetchOnMount: true,
        refetchOnReconnect: true,
      },
      mutations: {
        async onSuccess() {
          // Invalidate all queries on successful mutations
          // This is a bit inefficient, but it promotes correctness over performance.
          await client.invalidateQueries();
        },
      },
    },
  });

  return client;
}
