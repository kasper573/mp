import type { WebSocket } from "@mp/ws/server";

import type { Logger } from "@mp/logger";

import { getSocketId } from "./get-socket-id";
import {
  BinaryEventTransceiver,
  createEventRouterReceiver,
  type AnyEventRouterNode,
} from "@mp/event-router";

export function setupEventRouter<Context>(opt: {
  socket: WebSocket;
  logger: Logger;
  router: AnyEventRouterNode<Context>;
  createContext: (socket: WebSocket) => Context;
}): void {
  const receive = createEventRouterReceiver(opt.router);

  const socketId = getSocketId(opt.socket);
  const transceiver = new BinaryEventTransceiver({ receive });

  opt.socket.addEventListener("message", async (msg) => {
    const context = opt.createContext(opt.socket);
    const buffer = msg.data as ArrayBuffer;
    const out = await transceiver.handleMessage(buffer, context);
    if (out?.message) {
      const [path] = out.message;
      opt.logger.info(
        {
          socketId,
          messageByteLength: buffer.byteLength,
          path: path.join("."),
        },
        `[event]`,
      );
      if (out.result.isErr()) {
        opt.logger.error(out.result.error, `[event] ${path.join(".")}`);
      }
    }
  });
}
