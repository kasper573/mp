import { QueryClient } from "npm:@tanstack/solid-query";

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

declare module "npm:@tanstack/solid-query" {
  interface Register {
    mutationMeta: {
      invalidateCache?: boolean;
    };
  }
}
