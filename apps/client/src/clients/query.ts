import { QueryClient } from "@tanstack/solid-query";
import { env } from "../env";

export function createQueryClient() {
  const staleTime = 60_000;
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: true,
        refetchOnMount: true,
        refetchOnReconnect: true,
        staleTime,
        refetchInterval: env.mode === "production" ? staleTime : false,
      },
    },
  });
}
