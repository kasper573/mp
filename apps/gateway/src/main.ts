import "dotenv/config";
import { opt } from "./options";
import { registerEncoderExtensions } from "@mp/game/server";
import { createPinoLogger } from "@mp/logger/pino";
import type { WebSocket } from "@mp/ws/server";
import { WebSocketServer } from "@mp/ws/server";
import { type } from "@mp/validate";
import type { IncomingMessage } from "http";
import { upsertMapSet } from "@mp/std";
import createCors from "cors";
import express from "express";
import http from "http";
import { createProxyHandler } from "./proxy-handler";

// Note that this file is an entrypoint and should not have any exports

registerEncoderExtensions();

const logger = createPinoLogger(opt.prettyLogs);
logger.info(opt, `Starting gateway...`);

const webServer = express()
  .set("trust proxy", opt.trustProxy)
  .use("/health", (req, res) => res.send("OK"))
  .use(createCors({ origin: opt.corsOrigin }))
  .use(opt.apiEndpointPath, createProxyHandler(opt.apiServiceUrl));

const httpServer = http.createServer(webServer);

const sockets = new Map<SocketType, Set<WebSocket>>();
const wss = new WebSocketServer({
  path: opt.wsEndpointPath,
  server: httpServer,
}); // TODO verifyClient

httpServer.listen(opt.port, opt.hostname, () => {
  logger.info(`Gateway listening on ${opt.hostname}:${opt.port}`);
});

wss.on("connection", (socket, request) => {
  socket.binaryType = "arraybuffer";
  const socketType = getSocketType(request);

  logger.info(`New ${socketType} connection established`);

  upsertMapSet(sockets, socketType, socket);

  socket.on("close", () => {
    logger.info(`${socketType} connection closed`);
    sockets.get(socketType)?.delete(socket);
  });

  socket.on("message", async (data: ArrayBuffer) => {
    // TODO route events based on socket type
  });

  socket.on("error", (err) => {
    logger.error(err, `Error in ${socketType} connection`);
  });
});

const SocketType = type.enumerated("game-client", "game-server");
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
