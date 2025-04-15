import type { RootRouter } from "@mp/server";
import type { SolidRPCInvoker } from "@mp/rpc";
import { createSolidRPCInvoker } from "@mp/rpc";
import { createContext, useContext } from "solid-js";

export type RPCClient = SolidRPCInvoker<RootRouter>;

export function createRPCClient(): RPCClient {
  return createSolidRPCInvoker<RootRouter>();
}

export function useRPC() {
  const rpc = useContext(RPCClientContext);
  if (!rpc) {
    throw new Error("useRPC must be used within a RPCClientProvider");
  }
  return rpc;
}

export const RPCClientContext = createContext<RPCClient>();
