import { type WebSocket } from "@mp/ws/server";
import {
  BinaryRpcTransceiver,
  createRpcInvoker,
  type AnyRouterNode,
} from "@mp/rpc";
import type { WebSocketServer } from "@mp/ws/server";
import type { Logger } from "@mp/logger";
import type { ClientId } from "@mp/game/server";
import { opt } from "../options";
import { getSocketId } from "./get-socket-id";

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
}): ReadonlyMap<ClientId, BinaryRpcTransceiver<Context>> {
  const invoke = createRpcInvoker(router);
  const transceivers = new Map<ClientId, BinaryRpcTransceiver<Context>>();

  wss.on("connection", (socket) => {
    socket.binaryType = "arraybuffer";

    const socketId = getSocketId(socket);

    const transceiver = new BinaryRpcTransceiver({
      invoke,
      send: socket.send.bind(socket),
      formatResponseError: (error) =>
        opt.exposeErrorDetails ? error : "Internal server error",
    });

    transceivers.set(socketId, transceiver);
    socket.addEventListener("close", () => transceivers.delete(socketId));

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    socket.addEventListener("message", async (msg) => {
      const context = createContext(socket);
      const buffer = msg.data as ArrayBuffer;
      const out = await transceiver.handleMessage(buffer, context);

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
      if (info.error) {
        logger.error(`[rpc]`, info);
      } else {
        logger.info(`[rpc]`, info);
      }
    });
  });

  return transceivers;
}
