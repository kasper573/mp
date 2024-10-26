import { tokenHeaderName } from "@mp/server";
import { SocketClient } from "@mp/network/client";
import { AuthClient } from "@mp/auth/client";
import { QueryClient } from "@tanstack/solid-query";

import type { RootRouter } from "@mp/server";
import { transformer } from "@mp/server";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { env } from "../env";
import { applyWorldStateUpdate, setConnected } from "./signals";

const staleTime = 60_000;
export const queryClient = new QueryClient({
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

export const authClient = new AuthClient(env.auth.publishableKey);
const loadPromise = authClient.load();

export const api = new SocketClient({
  url: env.wsUrl,
  applyStateUpdate: applyWorldStateUpdate,
  async getHeaders() {
    await loadPromise;
    return { [tokenHeaderName]: await authClient.session?.getToken() };
  },
  onConnect: () => setConnected(true),
  onDisconnect: () => setConnected(false),
});

export const trpc = createTRPCClient<RootRouter>({
  links: [
    httpBatchLink({
      url: env.apiUrl,
      transformer,
      async headers() {
        await loadPromise;
        return {
          [tokenHeaderName]: (await authClient.session?.getToken()) ?? "",
        };
      },
    }),
  ],
});
