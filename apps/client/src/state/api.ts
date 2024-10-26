import { tokenHeaderName } from "@mp/server";
import { SocketClient } from "@mp/network/client";
import { AuthClient } from "@mp/auth/client";
import { QueryClient } from "@tanstack/solid-query";

import type { RootRouter } from "@mp/server";
import { transformer } from "@mp/server";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createEffect, createSignal, onCleanup } from "solid-js";
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

const getToken = () => loadPromise.then(() => authClient.session?.getToken());

export function useApiClient() {
  const [getToken, setToken] = createSignal<string | null>(null);
  const client = new SocketClient({
    url: env.wsUrl,
    applyStateUpdate: applyWorldStateUpdate,
    onConnect: () => setConnected(true),
    onDisconnect: () => setConnected(false),
  });

  function refreshToken() {
    void authClient.session?.getToken().then(setToken);
  }

  createEffect(() => {
    const token = getToken();
    if (token) {
      client.authenticate(token);
    }
  });

  onCleanup(authClient.addListener(refreshToken));
  onCleanup(() => client.dispose());

  return client;
}

export const trpc = createTRPCClient<RootRouter>({
  links: [
    httpBatchLink({
      url: env.apiUrl,
      transformer,
      async headers() {
        return { [tokenHeaderName]: (await getToken()) ?? "" };
      },
    }),
  ],
});
