import type { WebSocket } from "@mp/ws/server";
import {
  BinaryRpcTransceiver,
  createRpcInvoker,
  type AnyRpcRouterNode,
} from "@mp/rpc";

import type { Logger } from "@mp/logger";

import { opt } from "../options";
import { getSocketId } from "./get-socket-id";

export function setupRpc<Context>({
  logger,
  router,
  createContext,
}: {
  logger: Logger;
  router: AnyRpcRouterNode<Context>;
  createContext: (socket: WebSocket) => Context;
}) {
  const invoke = createRpcInvoker(router);

  return function setupRpcForSocket(socket: WebSocket) {
    const socketId = getSocketId(socket);

    const transceiver = new BinaryRpcTransceiver({
      invoke,
      send: socket.send.bind(socket),
      formatResponseError: (error) =>
        opt.exposeErrorDetails ? error : "Internal server error",
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
  };
}
