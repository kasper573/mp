import { GraphQLClient, graphql } from "@mp/api-service/client";
import apiSchema from "@mp/api-service/client/schema.json";
import { createPinoLogger } from "@mp/logger/pino";
import { Vector } from "@mp/math";
import {
  createShortId,
  setupGracefulShutdown,
  toResult,
  withBackoffRetries,
} from "@mp/std";
import { collectDefaultMetrics, Pushgateway } from "@mp/telemetry/prom";
import {
  AreaModule,
  CharacterModule,
  ChatModule,
  CombatModule,
  InventoryModule,
  MovementModule,
  MovementSpeed,
  NpcAiModule,
  NpcSpawnerModule,
  PersistenceModule,
  buildWorldPersistenceSchema,
  createWorld,
} from "@mp/world/server";
import type {
  ActorModelId,
  CharacterId,
  InventoryId,
  UserId,
} from "@mp/world/server";
import { RiftServer } from "@rift/core";
import { GameServer, defineModule } from "@rift/modular";
import { RiftPersistence } from "@rift/persistence/server";
import type { WebSocket } from "@mp/ws/server";
import { WebSocketServer } from "@mp/ws/server";
import { mkdirSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { dirname } from "node:path";
import "dotenv/config";
import { loadAreaResource } from "./integrations/load-area-resource";
import { opt } from "./options";

// Note that this file is an entrypoint and should not have any exports

collectDefaultMetrics();

const shutdownCleanups: Array<() => unknown> = [];
setupGracefulShutdown(process, shutdownCleanups);

const logger = createPinoLogger({
  ...opt.log,
  bindings: { areaId: opt.areaId },
});
logger.info(opt, `Starting server...`);

const api = new GraphQLClient({
  url: opt.apiServiceUrl,
  schema: apiSchema,
});

logger.info(`Loading area...`);
const area = await withBackoffRetries("load-area-resource", async () => {
  const res = await api.query({
    variables: { areaId: opt.areaId },
    query: graphql(`
      query GameServiceArea($areaId: AreaId!) {
        areaFileUrl(areaId: $areaId, urlType: internal)
      }
    `),
  });
  const { areaFileUrl } = toResult(res)._unsafeUnwrap();
  return loadAreaResource(opt.areaId, areaFileUrl);
});
logger.info(`Area loaded successfully`);

mkdirSync(dirname(opt.databasePath), { recursive: true });

const world = createWorld();
const rift = new RiftServer(world);
const persistence = new RiftPersistence(
  rift,
  buildWorldPersistenceSchema({
    instanceId: opt.areaId,
    dbPath: opt.databasePath,
  }),
);
persistence.start();
shutdownCleanups.push(() => persistence.dispose());

const wss = new WebSocketServer({ port: opt.httpPort });
shutdownCleanups.push(
  () =>
    new Promise<void>((resolve) => {
      wss.close(() => resolve());
    }),
);

const bootModule = defineModule({
  dependencies: [AreaModule, CharacterModule, PersistenceModule] as const,
  server: (ctx) => {
    ctx.using(AreaModule).registerArea(area);
    const characters = ctx.using(CharacterModule);
    const persistenceApi = ctx.using(PersistenceModule);

    wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
      const url = new URL(req.url ?? "/", "http://internal");
      if (url.searchParams.get("gameServiceSecret") !== opt.gatewaySecret) {
        socket.close();
        return;
      }
      const characterId = url.searchParams.get(
        "characterId",
      ) as CharacterId | null;
      const userId = url.searchParams.get("userId") as UserId | null;
      if (!characterId || !userId) {
        socket.close();
        return;
      }

      const clientId = createShortId<string>();
      let entity;
      try {
        entity = characters.spawnCharacter({
          clientId,
          characterId,
          userId,
          inventoryId: characterId as unknown as InventoryId,
          xp: 0,
          areaId: area.id,
          position: new Vector(area.start.x, area.start.y),
          appearance: {
            name: "Player",
            modelId: "default" as ActorModelId,
            color: 0xffffff,
            opacity: 1,
          },
          health: { current: 100, max: 100 },
        });
      } catch (err) {
        logger.error(err, "Failed to spawn character");
        socket.close();
        return;
      }
      entity.set(MovementSpeed, { speed: 3 });
      persistenceApi.activateCharacter(entity);
      ctx.addClient(clientId, socket as never);

      socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
        const buf =
          data instanceof Buffer
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            : data instanceof ArrayBuffer
              ? new Uint8Array(data)
              : new Uint8Array(0);
        rift.handleClientEvent(clientId, buf);
      });
      socket.on("close", () => {
        persistenceApi.deactivateCharacter(entity);
        characters.despawnCharacter(characterId);
        ctx.removeClient(clientId);
      });
    });

    return { api: {}, dispose: () => {} };
  },
});

const gameServer = new GameServer({
  modules: [
    AreaModule,
    CharacterModule,
    MovementModule,
    CombatModule,
    NpcAiModule,
    NpcSpawnerModule,
    ChatModule,
    InventoryModule,
    PersistenceModule,
    bootModule,
  ],
  rift,
  wss: wss as never,
  tickRate: 1000 / opt.tickInterval.totalMilliseconds,
  values: { worldPersistence: persistence },
});
await gameServer.start();
shutdownCleanups.push(() => gameServer.dispose());

if (opt.metricsPushgateway.url) {
  const pg = new Pushgateway(opt.metricsPushgateway.url);
  setInterval(
    () =>
      pg.push({
        jobName: "game-service",
        groupings: { areaId: opt.areaId },
      }),
    opt.metricsPushgateway.interval.totalMilliseconds,
  );
}

logger.info(`Game service started successfully`);
