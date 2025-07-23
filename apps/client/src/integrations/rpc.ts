import type { ApiRpcRouter } from "@mp/api";
import type { ReactRpcInvoker } from "@mp/rpc/react";
import { createReactRpcInvoker } from "@mp/rpc/react";
import { useContext } from "preact/hooks";
import type { Logger } from "@mp/logger";
import { BinaryRpcTransceiver } from "@mp/rpc";
import { createContext } from "preact";

export type RpcClient = ReactRpcInvoker<ApiRpcRouter>;

export type RpcClientMiddleware = () => Promise<unknown>;

export function createRpcClient(socket: WebSocket, logger: Logger) {
  const transceiver = new BinaryRpcTransceiver({
    send: (data) => socket.send(data),
  });

  const invoker = createReactRpcInvoker<ApiRpcRouter>(transceiver.call);

  function initialize() {
    const handleMessage = transceiver.messageEventHandler(logger.error);
    socket.addEventListener("message", handleMessage);
    return () => {
      socket.removeEventListener("message", handleMessage);
    };
  }

  return [invoker, initialize] as const;
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
