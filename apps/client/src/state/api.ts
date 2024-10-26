import { rpcSerializer, tokenHeaderName, type ServerModules } from "@mp/server";
import { Client } from "@mp/network/client";
import { AuthClient } from "@mp/auth/client";
import { QueryClient } from "@tanstack/solid-query";
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

export const api = new Client<ServerModules>({
  url: env.serverUrl,
  rpcTimeout: 5000,
  parseRPCResponse: rpcSerializer.parse,
  applyStateUpdate: applyWorldStateUpdate,
  serializeRPC: rpcSerializer.serialize,
  async getHeaders() {
    await loadPromise;
    return { [tokenHeaderName]: await authClient.session?.getToken() };
  },
  onConnect: () => setConnected(true),
  onDisconnect: () => setConnected(false),
});
