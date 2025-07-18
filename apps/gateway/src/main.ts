import "dotenv/config";
import http from "node:http";
import { WebSocketServer } from "ws";
import { createPinoLogger } from "@mp/logger/pino";
import { baseServerOptions } from "@mp/server-common";
import { GatewayRouter } from "./gateway-router";

const opt = baseServerOptions;
const logger = createPinoLogger(opt.prettyLogs);

logger.info("Starting WebSocket Gateway...");

const server = http.createServer();
const wss = new WebSocketServer({ server });

// Configuration for area servers
const areaServerConfig = new Map([
  ["island", { host: "localhost", port: 8001 }],
  ["forest", { host: "localhost", port: 8002 }],
]);

const router = new GatewayRouter(areaServerConfig, logger);

wss.on("connection", (ws, req) => {
  logger.info(`New WebSocket connection from ${req.socket.remoteAddress}`);
  router.handleConnection(ws);
});

server.listen(opt.port, opt.hostname, () => {
  logger.info(`Gateway listening on ${opt.hostname}:${opt.port}`);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down gracefully");
  wss.close(() => {
    server.close(() => {
      process.exit(0);
    });
  });
});
