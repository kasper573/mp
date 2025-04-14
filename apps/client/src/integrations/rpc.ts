import type { RootRouter } from "@mp/server";
import type { RPCNodeApi } from "@mp/rpc";
import { createRPCNodeApi } from "@mp/rpc";
import { createContext, useContext } from "solid-js";

export type RPCClient = RPCNodeApi<RootRouter>;

export function createRPCClient(): RPCClient {
  return createRPCNodeApi<RootRouter>();
}

export function useRPC() {
  const rpc = useContext(RPCClientContext);
  if (!rpc) {
    throw new Error("useRPC must be used within a RPCClientProvider");
  }
  return rpc;
}

export const RPCClientContext = createContext<RPCClient>();
