import { createServer } from "node:http";
import { RiftServer } from "@rift/core";
import { GameServer } from "@rift/modular";
import { WebSocketServer } from "ws";
import { world, modules } from "@mp/world";
import type { ConnectionRequest } from "@rift/modular";
import { createConsoleLogger } from "@mp/logger";
import { createTokenResolver } from "@mp/auth/server";
import type { AccessToken } from "@mp/auth";
import { playerRoles } from "@mp/keycloak";
import { collectDefaultMetrics, metricsRegister } from "@mp/telemetry/prom";
import { opt } from "./options";

const logger = createConsoleLogger();

const resolveToken = createTokenResolver({
  jwksUri: opt.auth.jwksUri,
  issuer: opt.auth.issuer,
  audience: opt.auth.audience,
  algorithms: ["RS256"],
  allowBypassUsers: opt.auth.allowBypassUsers ?? false,
  bypassUserRoles: playerRoles,
  onResolve(result) {
    if (result.isErr()) {
      logger.warn(`Token rejected: ${result.error}`);
    }
  },
});

const wss = new WebSocketServer({
  port: opt.port,
  verifyClient: async (info, cb) => {
    const url = new URL(info.req.url ?? "/", `http://${info.req.headers.host}`);
    const token = url.searchParams.get("accessToken") as
      | AccessToken
      | undefined;
    const result = await resolveToken(token ?? undefined);
    if (result.isErr()) {
      cb(false, 401, "Unauthorized");
      return;
    }
    (info.req as ConnectionRequest).user = result.value;
    cb(true);
  },
});

const rift = new RiftServer(world);

const server = new GameServer({
  modules,
  rift,
  wss,
  tickRate: 20,
  values: { tiledBaseUrl: opt.tiledBaseUrl },
});

collectDefaultMetrics();

createServer(async (req, res) => {
  if (req.url === "/metrics" && req.method === "GET") {
    res.setHeader("Content-Type", metricsRegister.contentType);
    res.end(await metricsRegister.metrics());
  } else {
    res.writeHead(404).end();
  }
}).listen(opt.metricsPort);

await server.start();

logger.info(`Game server started on port ${opt.port}`);
logger.info(`Metrics server listening on port ${opt.metricsPort}`);
