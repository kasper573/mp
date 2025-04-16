import type { RootRouter } from "@mp/server";
import type { SolidRPCInvoker } from "@mp/rpc";
import { BinaryRPCTransmitter, createSolidRPCInvoker } from "@mp/rpc";
import { createContext, onCleanup, useContext } from "solid-js";
import type { EnhancedWebSocket } from "@mp/ws/client";

export type RPCClient = SolidRPCInvoker<RootRouter>;

export function createRPCClient(socket: EnhancedWebSocket): RPCClient {
  const transmitter = new BinaryRPCTransmitter(socket.send);
  onCleanup(socket.subscribeToMessage(transmitter.handleMessage));
  return createSolidRPCInvoker<RootRouter>(transmitter);
}

export function useRPC() {
  return useContext(RPCClientContext);
}

export const RPCClientContext = createContext<RPCClient>(
  new Proxy({} as RPCClient, {
    get: () => {
      throw new Error("RPCClientContext must be provided");
    },
  }),
);

export const SocketContext = createContext<EnhancedWebSocket>(
  new Proxy({} as EnhancedWebSocket, {
    get: () => {
      throw new Error("SocketContext must be provided");
    },
  }),
);
