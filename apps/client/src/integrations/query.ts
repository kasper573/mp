import { QueryClient } from "@tanstack/solid-query";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        throwOnError: true,
        refetchOnWindowFocus: true,
        refetchOnMount: true,
        refetchOnReconnect: true,
      },
    },
  });
}