import { createServer as createHttpServer } from "node:http";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { wssTransport } from "@rift/wss";
import { MpRiftServer, wsHandshakeAccessTokenParam } from "@mp/world";
import { createPinoLogger } from "@mp/logger/pino";
import { Rng, setupGracefulShutdown } from "@mp/std";
import { createTokenResolver } from "@mp/auth/server";
import { playerRoles } from "@mp/keycloak";
import type { AccessToken } from "@mp/auth";
import {
  SessionRegistry,
  sessionRegistryFeature,
  combatFeature,
  fnv1a64,
  loadAreaResource,
  movementFeature,
  npcAiFeature,
  npcRewardFeature,
  npcSpawnerFeature,
  visibilityFeature,
  schemaComponents,
  schemaEvents,
  createItemDefinitionLookup,
} from "@mp/world";
import type { AreaId, AreaResource } from "@mp/world";
import {
  characterDirectoryFeature,
  persistenceFeature,
  createDbRepository,
} from "@mp/db";
import * as fixtures from "@mp/fixtures";
import "dotenv/config";
import { opt } from "./options";
import type { UserSessionIdentity } from "@mp/world";

const shutdownCleanups: Array<() => unknown> = [];
setupGracefulShutdown(process, shutdownCleanups);

const logger = createPinoLogger(opt.log);
logger.info(opt, `Starting game-server (PID: ${process.pid})...`);

const repo = createDbRepository(opt.databaseConnectionString);
repo.subscribeToErrors((err) => logger.error(err, "Database error"));

const resolveAccessToken = createTokenResolver({
  ...opt.auth,
  bypassUserRoles: playerRoles,
});

logger.info(`Loading area resources...`);
const loadedAreas = await Promise.all(
  fixtures.areas.map(async (meta) => {
    const url = `${opt.fileServerBaseUrl}/areas/${meta.id}.json`;
    return [meta.id, await loadAreaResource(meta.id, url)] as const;
  }),
);
const areas = new Map<AreaId, AreaResource>(loadedAreas);
logger.info(`Loaded ${areas.size} area(s)`);

const userByWs = new WeakMap<WebSocket, UserSessionIdentity>();

const httpServer = createHttpServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200);
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", async (req, socket, head) => {
  const url = new URL(req.url ?? "", "ws://x");
  const token = url.searchParams.get(wsHandshakeAccessTokenParam);
  if (!token) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  const result = await resolveAccessToken(token as AccessToken);
  if (result.isErr()) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const { id, roles, name } = result.value;
    userByWs.set(ws, { id, roles, name });
    wss.emit("connection", ws, req);
  });
});

const transport = wssTransport(wss);
const registry = new SessionRegistry();
const itemLookup = createItemDefinitionLookup(
  fixtures.consumables,
  fixtures.equipment,
);

const defaultArea = fixtures.areas[0];
const defaultModelId = fixtures.actorModels[0].id;
const defaultAreaResource = areas.get(defaultArea.id);
if (!defaultAreaResource) {
  throw new Error(`Default area "${defaultArea.id}" not loaded`);
}
const rng = new Rng();

const server = new MpRiftServer({
  transport,
  hash: fnv1a64,
  tickRateHz: opt.tickRateHz,
  features: [
    { components: schemaComponents, events: schemaEvents },
    sessionRegistryFeature(registry),
    characterDirectoryFeature({
      repo,
      registry,
      defaultModelId,
      defaultSpawn: {
        areaId: defaultArea.id,
        coords: defaultAreaResource.start,
      },
    }),
    persistenceFeature({
      repo,
      registry,
      syncIntervalMs: opt.syncIntervalMs,
      defaultModelId,
      actorModels: fixtures.actorModelsById,
      spawnPointForArea: (id) => areas.get(id)?.start,
    }),
    movementFeature({ areas }),
    combatFeature(),
    visibilityFeature({
      viewDistance: fixtures.viewDistance,
      areas,
      registry,
    }),
    npcSpawnerFeature({
      areas,
      npcs: fixtures.npcs,
      spawns: fixtures.npcSpawns,
      actorModels: fixtures.actorModelsById,
      rng,
    }),
    npcAiFeature({ areas, rng }),
    npcRewardFeature({
      rewardsByNpcId: fixtures.npcRewardsByNpcId,
      itemLookup,
    }),
  ],
});

transport.on((event) => {
  if (event.type !== "open") return;
  const ws = event.ws as WebSocket | undefined;
  if (!ws) return;
  const user = userByWs.get(ws);
  if (user !== undefined) {
    registry.recordConnection(event.clientId, user);
  }
});

await server.start();

httpServer.listen(opt.port, opt.hostname);
logger.info(`game service connected on ${opt.hostname}:${opt.port}`);

shutdownCleanups.push(async () => {
  await server.stop();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});
