import { createServer as createHttpServer } from "node:http";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { RiftServer } from "@rift/core";
import { wssTransport } from "@rift/wss";
import { createPinoLogger } from "@mp/logger/pino";
import { setupGracefulShutdown } from "@mp/std";
import { createTokenResolver } from "@mp/auth/server";
import { playerRoles } from "@mp/keycloak";
import type { AccessToken, UserId } from "@mp/auth";
import {
  ClientCharacterRegistry,
  CombatModule,
  ItemSpawnModule,
  MovementModule,
  NpcAiModule,
  NpcRewardModule,
  NpcSpawnerModule,
  VisibilityModule,
  createItemDefinitionLookup,
  loadAreaResource,
  schema,
} from "@mp/world";
import type { AreaId, AreaResource } from "@mp/world";
import {
  CharacterDirectoryModule,
  PersistenceModule,
  createDbRepository,
} from "@mp/db";
import * as fixtures from "@mp/fixtures";
import "dotenv/config";
import { opt } from "./options";

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

const userIdByWs = new WeakMap<WebSocket, UserId>();

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
  const token = url.searchParams.get("accessToken");
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
    userIdByWs.set(ws, result.value.id);
    wss.emit("connection", ws, req);
  });
});

const transport = wssTransport(wss);

const registry = new ClientCharacterRegistry();
const itemLookup = createItemDefinitionLookup(
  fixtures.consumables,
  fixtures.equipment,
);

const server = new RiftServer({
  schema,
  transport,
  tickRateHz: opt.tickRateHz,
  modules: [
    registry,
    new CharacterDirectoryModule({ repo }),
    new PersistenceModule({
      repo,
      syncIntervalMs: opt.syncIntervalMs,
      defaultModelId: fixtures.actorModels[0].id,
      spawnPointForArea: (id) => {
        const meta = fixtures.areasById.get(id);
        return meta
          ? { x: meta.spawnPoint.x, y: meta.spawnPoint.y }
          : undefined;
      },
    }),
    new MovementModule({ areas }),
    new CombatModule(),
    new VisibilityModule({ viewDistance: fixtures.viewDistance }),
    new NpcSpawnerModule({
      areas,
      npcs: fixtures.npcs,
      spawns: fixtures.npcSpawns,
    }),
    new NpcAiModule({ areas }),
    new NpcRewardModule({
      rewardsByNpcId: fixtures.npcRewardsByNpcId,
      itemLookup,
    }),
    new ItemSpawnModule({ items: fixtures.items }),
  ],
});

transport.on((event) => {
  if (event.type !== "open") return;
  const ws = event.ws as WebSocket | undefined;
  if (!ws) return;
  const userId = userIdByWs.get(ws);
  if (userId !== undefined) {
    registry.recordConnection(event.clientId, userId);
  }
});

await server.start();

httpServer.listen(opt.port, opt.hostname, () => {
  logger.info(`Game server listening on ${opt.hostname}:${opt.port}`);
});

shutdownCleanups.push(async () => {
  await server.stop();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

logger.info(`Game server started successfully`);
