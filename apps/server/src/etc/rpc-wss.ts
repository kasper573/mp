import { type WebSocket } from "@mp/ws/server";
import {
  BinaryRPCTransmitter,
  createRPCInvoker,
  type AnyRouterNode,
} from "@mp/rpc";
import type { WebSocketServer } from "@mp/ws/server";
import { opt } from "../options";

export function acceptRpcViaWebSockets<Context>({
  wss,
  onError,
  router,
  createContext,
}: {
  wss: WebSocketServer;
  onError?: (error: unknown) => void;
  router: AnyRouterNode<Context>;
  createContext: (socket: WebSocket) => Context;
}) {
  wss.on("connection", (socket) => {
    socket.binaryType = "arraybuffer";
    const invokeRPC = createRPCInvoker(router);
    const transmitter = new BinaryRPCTransmitter(
      socket.send.bind(socket),
      invokeRPC,
      (error) => (opt.exposeErrorDetails ? error : "Internal server error"),
    );

    socket.addEventListener("error", (error) =>
      onError?.(new Error("Socket error", { cause: error })),
    );

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    socket.addEventListener("message", async (msg) => {
      const context = createContext(socket);
      const result = await transmitter.handleMessage(
        msg.data as ArrayBuffer,
        context,
      );
      if (result?.isErr()) {
        onError?.(result.error);
      }
    });
  });
}
