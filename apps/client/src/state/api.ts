import type { ClientStateUpdate } from "@mp/server";
import { serialization, tokenHeaderName, type ServerModules } from "@mp/server";
import { Client } from "@mp/network/client";
import { AuthClient } from "@mp/auth/client";
import { QueryClient } from "@tanstack/solid-query";
import { env } from "../env";
import { applyWorldStateUpdate } from "./signals";

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

export const api = new Client<ServerModules, ClientStateUpdate>({
  url: env.serverUrl,
  rpcTimeout: 5000,
  parseStateUpdate: serialization.stateUpdate.parse,
  parseRPCResponse: serialization.rpc.parse,
  applyStateUpdate: applyWorldStateUpdate,
  serializeRPC: serialization.rpc.serialize,
  async getHeaders() {
    await loadPromise;
    return { [tokenHeaderName]: await authClient.session?.getToken() };
  },
});
