import { RiftServer } from "@rift/core";
import { GameServer } from "@rift/modular";
import { WebSocketServer } from "ws";
import { world, modules } from "@mp/world";
import type { AuthenticatedRequest } from "@mp/world";
import { createConsoleLogger } from "@mp/logger";
import { createTokenResolver } from "@mp/auth/server";
import type { AccessToken } from "@mp/auth";
import { playerRoles } from "@mp/keycloak";
import { opt } from "./options";

const logger = createConsoleLogger();

const port = opt.port ?? 8090;
const tiledBaseUrl = opt.tiledBaseUrl ?? "https://files.mp.localhost/";

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
  port,
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
    (info.req as AuthenticatedRequest).__user = result.value;
    cb(true);
  },
});

const rift = new RiftServer(world);

const server = new GameServer({
  modules,
  rift,
  wss,
  tickRate: 20,
  values: { tiledBaseUrl },
});

await server.start();

logger.info(`Game service connected on port ${port}`);
