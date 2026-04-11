import { createDbRepository } from "@mp/db";
import { createPinoLogger } from "@mp/logger/pino";
import type { AccessToken } from "@mp/auth";
import { createTokenResolver } from "@mp/auth/server";
import { playerRoles } from "@mp/keycloak";
import { setupGracefulShutdown } from "@mp/std";
import {
  collectDefaultMetrics,
  MetricsGague,
  metricsMiddleware,
} from "@mp/telemetry/prom";
import type { WebSocketServerOptions } from "@mp/ws/server";
import { WebSocket, WebSocketServer } from "@mp/ws/server";
import "dotenv/config";
import express from "express";
import http from "http";
import type { IncomingMessage } from "http";
import { opt } from "./options";

type CharacterId = string & { __brand: "CharacterId" };

// Note that this file is an entrypoint and should not have any exports

const shutdownCleanups: Array<() => unknown> = [];
setupGracefulShutdown(process, shutdownCleanups);

const logger = createPinoLogger(opt.log);
logger.info(opt, `Starting gateway (PID: ${process.pid})...`);

collectDefaultMetrics();

const webServer = express()
  .use("/health", (req, res) => res.send("OK"))
  .use(metricsMiddleware());

const httpServer = http.createServer(webServer);
shutdownCleanups.push(() => httpServer.close());

const db = createDbRepository(opt.databaseConnectionString);
db.subscribeToErrors((err) => logger.error(err, "Database error"));
shutdownCleanups.push(() => db.dispose());

const resolveAccessToken = createTokenResolver({
  ...opt.auth,
  bypassUserRoles: playerRoles,
});

const wss = new WebSocketServer({
  ...wssConfig(),
  path: opt.wsEndpointPath,
  server: httpServer,
});
shutdownCleanups.push(() => wss.close());

httpServer.listen(opt.port, opt.hostname, () => {
  logger.info(`Gateway listening on ${opt.hostname}:${opt.port}`);
});

const activeConnections = new Set<WebSocket>();

wss.on("connection", (clientSocket, request) => {
  clientSocket.binaryType = "arraybuffer";
  void handleClientConnection(clientSocket, request);
});

async function handleClientConnection(
  clientSocket: WebSocket,
  request: IncomingMessage,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://internal");
  const accessToken = url.searchParams.get("accessToken") as AccessToken | null;
  const characterId = url.searchParams.get("characterId") as CharacterId | null;

  if (!accessToken || !characterId) {
    clientSocket.close(4400, "Missing accessToken or characterId");
    return;
  }

  const tokenResult = await resolveAccessToken(accessToken);
  if (tokenResult.isErr()) {
    logger.warn({ err: tokenResult.error }, "Token resolution failed");
    clientSocket.close(4401, "Unauthorized");
    return;
  }
  const user = tokenResult.value;

  const areaResult = await db.selectCharacterAreaForUser({
    userId: user.id,
    characterId: characterId as never,
  });
  if (areaResult.isErr()) {
    logger.error({ err: areaResult.error }, "Failed to resolve character area");
    clientSocket.close(1011, "Internal error");
    return;
  }
  const areaId = areaResult.value;
  if (!areaId) {
    clientSocket.close(4403, "Forbidden");
    return;
  }

  const upstreamUrl = opt.gameServiceUrls[areaId];
  if (!upstreamUrl) {
    logger.error(
      { areaId },
      "No game-service URL configured for area; closing client",
    );
    clientSocket.close(1011, "No game-service for area");
    return;
  }

  const upstream = new URL(upstreamUrl);
  upstream.searchParams.set("gameServiceSecret", opt.gameServiceSecret);
  upstream.searchParams.set("characterId", characterId);
  upstream.searchParams.set("userId", user.id);

  const upstreamSocket = new WebSocket(upstream.toString());
  upstreamSocket.binaryType = "arraybuffer";
  activeConnections.add(clientSocket);

  const cleanup = () => {
    activeConnections.delete(clientSocket);
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.close();
    }
    if (
      upstreamSocket.readyState === WebSocket.OPEN ||
      upstreamSocket.readyState === WebSocket.CONNECTING
    ) {
      upstreamSocket.close();
    }
  };

  const pendingFromClient: ArrayBuffer[] = [];
  let upstreamReady = false;

  upstreamSocket.on("open", () => {
    upstreamReady = true;
    for (const buf of pendingFromClient) {
      upstreamSocket.send(buf);
    }
    pendingFromClient.length = 0;
  });

  upstreamSocket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
    if (clientSocket.readyState !== WebSocket.OPEN) return;
    clientSocket.send(toArrayBuffer(data));
  });

  upstreamSocket.on("close", cleanup);
  upstreamSocket.on("error", (err) => {
    logger.error(err, "Upstream game-service socket error");
    cleanup();
  });

  clientSocket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
    const buf = toArrayBuffer(data);
    if (buf.byteLength > maxMessageSizeFromGameClient) {
      logger.warn(
        { size: buf.byteLength, characterId },
        "Client message too large; closing connection",
      );
      clientSocket.close(1009, "Message too large");
      return;
    }
    if (!upstreamReady) {
      pendingFromClient.push(buf);
      return;
    }
    upstreamSocket.send(buf);
  });

  clientSocket.on("close", cleanup);
  clientSocket.on("error", (err) => {
    logger.error(err, "Client socket error");
    cleanup();
  });
}

function toArrayBuffer(data: Buffer | ArrayBuffer | Buffer[]): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const buf = Buffer.isBuffer(data) ? data : Buffer.concat(data);
  const out = new ArrayBuffer(buf.byteLength);
  new Uint8Array(out).set(buf);
  return out;
}

// Cap on inbound client message size. Real client traffic is ~100B; the
// limit guards against abusive clients sending oversize frames.
const maxMessageSizeFromGameClient = 500;

function wssConfig(): WebSocketServerOptions {
  return {
    maxPayload: 50_000,
    perMessageDeflate: {
      zlibDeflateOptions: {
        chunkSize: 1024,
        memLevel: 7,
        level: 6,
      },
      zlibInflateOptions: {
        chunkSize: 10 * 1024,
      },
      clientNoContextTakeover: true,
      serverNoContextTakeover: true,
      serverMaxWindowBits: 10,
      concurrencyLimit: 10,
      threshold: 1024,
    },
  };
}

const _metrics = {
  clientCount: new MetricsGague({
    name: "active_client_count",
    help: "Number of active websocket connections",
    collect() {
      this.set(activeConnections.size);
    },
  }),
};
