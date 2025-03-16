import { QueryClient } from "@mp/solid-trpc";

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

declare module "@mp/solid-trpc" {
  interface Register {
    mutationMeta: {
      invalidateCache?: boolean;
    };
  }
}
