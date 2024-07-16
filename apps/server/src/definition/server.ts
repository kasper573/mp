import express, { type Express } from "express";
import ws from "ws";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { env } from "../env";
import { createContext } from "./context";
import { createTrpcRouter } from "./router";

export function startServer(): Express {
  const app: Express = express();

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

  wss.on("connection", (ws) => {
    console.log(`➕➕ Connection (${wss.clients.size})`);
    ws.once("close", () => {
      console.log(`➖➖ Connection (${wss.clients.size})`);
    });
  });

  console.log(`✅ WebSocket Server listening on ws://localhost:${env.port}`);
  process.on("SIGTERM", () => {
    console.log("SIGTERM");
    handler.broadcastReconnectNotification();
    wss.close();
  });

  return app;
}
