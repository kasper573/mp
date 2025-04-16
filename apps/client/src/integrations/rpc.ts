import type { RootRouter } from "@mp/server";
import type { SolidRPCInvoker } from "@mp/rpc";
import { BinaryRPCTransmitter, createSolidRPCInvoker } from "@mp/rpc";
import { createContext, onCleanup, useContext } from "solid-js";
import type { Logger } from "@mp/logger";

export type RPCClient = SolidRPCInvoker<RootRouter>;

export function createRPCClient(socket: WebSocket, logger: Logger): RPCClient {
  const transmitter = new BinaryRPCTransmitter((data) => socket.send(data));
  const handleMessage = transmitter.messageEventHandler(logger.error);
  socket.addEventListener("message", handleMessage);
  onCleanup(() => socket.removeEventListener("message", handleMessage));
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

export const SocketContext = createContext<WebSocket>(
  new Proxy({} as WebSocket, {
    get: () => {
      throw new Error("SocketContext must be provided");
    },
  }),
);
