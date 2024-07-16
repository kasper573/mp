import ws from "ws";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { env } from "../env";
import { createContext } from "./context";
import { createTrpcRouter } from "./router";

export function startServer() {
  const wss = new ws.Server({ port: env.port });

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

  function handleConnection(ws: ws.WebSocket) {
    console.log(`➕➕ Connection (${wss.clients.size})`);
    ws.once("close", () => {
      console.log(`➖➖ Connection (${wss.clients.size})`);
    });
  }

  function sigterm() {
    console.log("SIGTERM");
    handler.broadcastReconnectNotification();
    wss.close();
  }

  wss.on("connection", handleConnection);
  process.on("SIGTERM", sigterm);

  console.log(`✅ WebSocket Server listening on port ${env.port}`);

  return function close() {
    wss.off("connection", handleConnection);
    wss.close();
    process.off("SIGTERM", sigterm);
  };
}
