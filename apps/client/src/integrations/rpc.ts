import type { RootRouter } from "@mp/server";
import { createRPCHook, RPCClient } from "@mp/rpc";
import { rpcTransformer } from "@mp/game";
import { useContext } from "solid-js";
import { AuthContext } from "@mp/auth/client";
import { env } from "../env";

export function createRPCClient() {
  return new RPCClient<RootRouter>({
    url: env.apiUrl,
    transformer: rpcTransformer,
    headers() {
      const { identity } = useContext(AuthContext);
      const token = identity()?.token;
      return {
        Authorization: token ? `Bearer ${token}` : undefined,
      };
    },
  });
}

export const useRPC = createRPCHook<RootRouter>();
