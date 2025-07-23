import "dotenv/config";
import { opt } from "./options";
import { registerEncoderExtensions } from "@mp/game/server";
import { createPinoLogger } from "@mp/logger/pino";
import type { WebSocket } from "@mp/ws/server";
import { WebSocketServer } from "@mp/ws/server";
import { type } from "@mp/validate";
import type { IncomingMessage } from "http";
import { Rng, upsertMapSet } from "@mp/std";
import { BinaryRpcBroker } from "@mp/rpc";

// Note that this file is an entrypoint and should not have any exports

registerEncoderExtensions();

const rng = new Rng();
const logger = createPinoLogger(opt.prettyLogs);
logger.info(opt, `Starting gateway...`);

const sockets = new Map<SocketType, Set<WebSocket>>();
const wss = new WebSocketServer({ port: opt.port });

wss.on("connection", (socket, request) => {
  socket.binaryType = "arraybuffer";
  const socketType = getSocketType(request);
  logger.info(`New ${socketType} connection established`);
  upsertMapSet(sockets, socketType, socket);

  const rpcBroker = new BinaryRpcBroker({
    sendCall: (data) => rng.oneOfMaybe(sockets.get("api-server"))?.send(data),
    sendResponse: socket.send.bind(socket),
  });

  socket.on("close", () => {
    logger.info("Connection closed");
    sockets.get(socketType)?.delete(socket);
  });

  socket.on("message", async (data: ArrayBuffer) => {
    if (await rpcBroker.handleMessage(data)) {
      logger.info(`RPC message passed onto broker`);
      return;
    }
  });

  socket.on("error", (err) => {
    logger.error(err, "WebSocket error");
  });
});

const SocketType = type.enumerated("api-server", "game-client", "game-server");
type SocketType = typeof SocketType.infer;

function getSearchParams(path = ""): URLSearchParams {
  return new URL(path, "http://localhost").searchParams;
}

function getSocketType(req: IncomingMessage): SocketType {
  const typeParam = getSearchParams(req.url).get("type");
  const result = SocketType(typeParam);
  if (result instanceof type.errors) {
    throw new Error(`Could not determine socket type`, {
      cause: result.summary,
    });
  }
  return result;
}
