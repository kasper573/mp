import type { ServerRpcRouter } from "@mp/server";
import type { SolidRpcInvoker } from "@mp/rpc/solid";
import { createSolidRpcInvoker } from "@mp/rpc/solid";
import { createContext, onCleanup, useContext } from "solid-js";
import type { Logger } from "@mp/logger";
import { BinaryRpcTransceiver, createRpcInvoker } from "@mp/rpc";
import { clientRpcRouter } from "@mp/game/client";

export type RpcClient = SolidRpcInvoker<ServerRpcRouter>;

export function createRpcClient(socket: WebSocket, logger: Logger): RpcClient {
  const transceiver = new BinaryRpcTransceiver({
    send: (data) => socket.send(data),
    invoke: createRpcInvoker(clientRpcRouter),
  });
  const handleMessage = transceiver.messageEventHandler(logger.error);
  socket.addEventListener("message", handleMessage);
  onCleanup(() => socket.removeEventListener("message", handleMessage));
  return createSolidRpcInvoker<ServerRpcRouter>(transceiver.call);
}

export function useRpc() {
  return useContext(RpcClientContext);
}

export const RpcClientContext = createContext<RpcClient>(
  new Proxy({} as RpcClient, {
    get: () => {
      throw new Error("RpcClientContext must be provided");
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
