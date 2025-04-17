import { type WebSocket } from "@mp/ws/server";
import {
  BinaryRpcTransmitter,
  createRpcInvoker,
  type AnyRouterNode,
} from "@mp/rpc";
import type { WebSocketServer } from "@mp/ws/server";
import type { Logger } from "@mp/logger";
import { opt } from "../options";
import { getSocketId } from "./get-socket-id";

export function acceptRpcViaWebSockets<Context>({
  wss,
  logger,
  router,
  createContext,
}: {
  wss: WebSocketServer;
  logger: Logger;
  router: AnyRouterNode<Context>;
  createContext: (socket: WebSocket) => Context;
}) {
  const invokeRpc = createRpcInvoker(router);

  wss.on("connection", (socket) => {
    socket.binaryType = "arraybuffer";

    const socketId = getSocketId(socket);

    const transmitter = new BinaryRpcTransmitter(
      socket.send.bind(socket),
      invokeRpc,
      (error) => (opt.exposeErrorDetails ? error : "Internal server error"),
    );

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    socket.addEventListener("message", async (msg) => {
      const context = createContext(socket);
      const buffer = msg.data as ArrayBuffer;
      const out = await transmitter.handleMessage(buffer, context);

      const info: Record<string, unknown> = { socketId };
      if (out?.call) {
        const [path, input, callId] = out.call;
        info.call = {
          path: path.join("."),
          messageByteLength: buffer.byteLength,
          callId,
        };
      }
      if (out?.response) {
        const [callId] = out.response;
        info.response = { callId };
      }
      if (out?.result.isErr()) {
        info.error = out.result.error;
      }
      logger.error(`[RPC]`, info);
    });
  });
}
