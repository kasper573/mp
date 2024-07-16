import http from "http";
import ws from "ws";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { env } from "../env";
import { createContext } from "./context";
import { createTrpcRouter } from "./router";

export function startServer() {
  const wss = new ws.Server({ port: env.wsPort });

  const handler = applyWSSHandler({
    wss,
    router: createTrpcRouter(),
    createContext,
    keepAlive: {
      enabled: true,
      pingMs: 30000,
      pongWaitMs: 5000,
    },
  });

  wss.on("connection", (ws) => {
    console.log(`➕➕ Connection (${wss.clients.size})`);
    ws.once("close", () => {
      console.log(`➖➖ Connection (${wss.clients.size})`);
    });
  });

  process.on("SIGTERM", () => {
    console.log("SIGTERM");
    handler.broadcastReconnectNotification();
    wss.close();
  });

  const httpServer = http
    .createServer((req, res) => {
      if (req.url === "/healthz") {
        res.writeHead(200);
        res.end("ok");
        return;
      }
    })
    .listen(env.httpPort);

  console.log(`✅ WebSocket Server listening on port ${env.wsPort}`);
  console.log(`✅ HTTP Server listening on port ${env.httpPort}`);

  return function close() {
    wss.close();
    httpServer.close();
  };
}
