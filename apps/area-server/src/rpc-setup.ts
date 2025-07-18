import type { WebSocket } from "@mp/ws/server";
import {
  BinaryRpcTransceiver,
  createRpcInvoker,
  type AnyRouterNode,
} from "@mp/rpc";
import type { WebSocketServer } from "@mp/ws/server";
import type { Logger } from "@mp/logger";
import { getSocketId } from "@mp/server-common";
import { areaServerOptions } from "@mp/server-common";

export function setupRpcTransceivers<Context>({
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
  const invoke = createRpcInvoker(router);

  wss.on("connection", (socket) => {
    socket.binaryType = "arraybuffer";

    const socketId = getSocketId(socket);

    const transceiver = new BinaryRpcTransceiver({
      invoke,
      send: socket.send.bind(socket),
      formatResponseError: (error) =>
        areaServerOptions.exposeErrorDetails ? error : "Internal server error",
    });

    socket.addEventListener("close", () => {
      // Cleanup handled automatically by WebSocket
    });

    socket.addEventListener("message", async (msg) => {
      const context = createContext(socket);
      const buffer = msg.data as ArrayBuffer;
      const out = await transceiver.handleMessage(buffer, context);
      if (out?.call) {
        const [path, , callId] = out.call;
        logger.info(
          {
            socketId,
            callId,
            messageByteLength: buffer.byteLength,
            path: path.join("."),
          },
          `[rpc]`,
        );
        if (out.result.isErr()) {
          logger.error(out.result.error, `[rpc] ${path.join(".")}`);
        }
      } else if (out?.response) {
        const [callId] = out.response;
        logger.info({ socketId, callId }, `[rpc response]`);
        if (out.result.isErr()) {
          logger.error(out.result.error, `[rpc response] (callId: ${callId})`);
        }
      }
    });
  });
}