import type { WebSocket } from "@mp/ws/server";

import type { Logger } from "@mp/logger";

import { getSocketId } from "./get-socket-id";
import {
  BinaryEventTransceiver,
  createEventRouterReceiver,
  type AnyEventRouterNode,
} from "@mp/event-router";

export function setupEventRouter<Context>({
  logger,
  router,
  createContext,
}: {
  logger: Logger;
  router: AnyEventRouterNode<Context>;
  createContext: (socket: WebSocket) => Context;
}) {
  const receive = createEventRouterReceiver(router);

  return function setupEventRouterForSocket(socket: WebSocket) {
    const socketId = getSocketId(socket);
    const transceiver = new BinaryEventTransceiver({ receive });

    socket.addEventListener("message", async (msg) => {
      const context = createContext(socket);
      const buffer = msg.data as ArrayBuffer;
      const out = await transceiver.handleMessage(buffer, context);
      if (out?.message) {
        const [path] = out.message;
        logger.info(
          {
            socketId,
            messageByteLength: buffer.byteLength,
            path: path.join("."),
          },
          `[event]`,
        );
        if (out.result.isErr()) {
          logger.error(out.result.error, `[event] ${path.join(".")}`);
        }
      }
    });
  };
}
