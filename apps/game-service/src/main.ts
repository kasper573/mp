import { RiftServer } from "@rift/core";
import { GameServer } from "@rift/modular";
import { WebSocketServer } from "ws";
import { world, modules } from "@mp/world";
import type { AuthenticatedRequest } from "@mp/world";
import { createConsoleLogger } from "@mp/logger";
import { createTokenResolver } from "@mp/auth/server";
import type { AccessToken } from "@mp/auth";
import { playerRoles } from "@mp/keycloak";

const logger = createConsoleLogger();

const port = Number(process.env.MP_GAME_SERVICE_PORT ?? "8090");
const tiledBaseUrl =
  process.env.MP_GAME_SERVICE_TILED_BASE_URL ?? "https://files.mp.localhost/";

const jwksUri = process.env.MP_GAME_SERVICE_AUTH__JWKS_URI;
const issuer = process.env.MP_GAME_SERVICE_AUTH__ISSUER;
const audience = process.env.MP_GAME_SERVICE_AUTH__AUDIENCE;
const allowBypassUsers =
  process.env.MP_GAME_SERVICE_AUTH__ALLOW_BYPASS_USERS === "true";

if (!jwksUri || !issuer || !audience) {
  throw new Error(
    "Missing required auth env vars: MP_GAME_SERVICE_AUTH__JWKS_URI, MP_GAME_SERVICE_AUTH__ISSUER, MP_GAME_SERVICE_AUTH__AUDIENCE",
  );
}

const resolveToken = createTokenResolver({
  jwksUri,
  issuer,
  audience,
  algorithms: ["RS256"],
  allowBypassUsers,
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
