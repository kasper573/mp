import { type WebSocket } from "@mp/ws/server";
import {
  BinaryRPCTransmitter,
  createRPCInvoker,
  type AnyRouterNode,
  type RPCError,
} from "@mp/rpc";
import type { WebSocketServer } from "@mp/ws/server";

export function acceptRpcViaWebSockets<Context>(opt: {
  wss: WebSocketServer;
  onError?: (error: RPCError) => void;
  router: AnyRouterNode<Context>;
  createContext: (socket: WebSocket) => Context;
}) {
  opt.wss.on("connection", (socket) => {
    socket.binaryType = "arraybuffer";
    const invokeRPC = createRPCInvoker(opt.router);
    const transmitter = new BinaryRPCTransmitter(
      socket.send.bind(socket),
      invokeRPC,
    );

    socket.addEventListener("error", (error) =>
      opt.onError?.(new Error("Socket error", { cause: error })),
    );

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    socket.addEventListener("message", async (msg) => {
      const context = opt.createContext(socket);
      const result = await transmitter.handleMessage(
        msg.data as ArrayBuffer,
        context,
      );
      if (result?.isErr()) {
        opt.onError?.(result.error);
      }
    });
  });
}
