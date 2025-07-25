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
import proxy from "express-http-proxy";
import { metricsMiddleware } from "./metrics-middleware";
import { MetricsRegistry, collectDefaultMetrics } from "@mp/telemetry/prom";

// Note that this file is an entrypoint and should not have any exports

registerEncoderExtensions();

const logger = createPinoLogger(opt.prettyLogs);
logger.info(opt, `Starting gateway...`);

const gatewayMetrics = new MetricsRegistry();
collectDefaultMetrics({ register: gatewayMetrics });

const webServer = express()
  .set("trust proxy", opt.trustProxy)
  .use("/health", (req, res) => res.send("OK"))
  .use(metricsMiddleware(gatewayMetrics))
  .use(createCors({ origin: opt.corsOrigin }))
  .use(opt.apiEndpointPath, proxy(opt.apiServiceUrl));

const httpServer = http.createServer(webServer);

const sockets = new Map<SocketType, Set<WebSocket>>();
const wss = new WebSocketServer({
  path: opt.wsEndpointPath,
  server: httpServer,
  maxPayload: 5000,
  // TODO verifyClient
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7, // default level
      level: 6, // default is 3, max is 9
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024,
    },
    clientNoContextTakeover: true, // defaults to negotiated value.
    serverNoContextTakeover: true, // defaults to negotiated value.
    serverMaxWindowBits: 10, // defaults to negotiated value.
    concurrencyLimit: 10, // limits zlib concurrency for perf.
    threshold: 1024, // messages under this size won't be compressed.
  },
});

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

  socket.on("message", (data: ArrayBuffer) => {
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
