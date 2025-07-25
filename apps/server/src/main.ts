import "dotenv/config";

import { SyncServer, SyncMap, shouldOptimizeCollects } from "@mp/sync";
import { Ticker } from "@mp/time";
import {
  collectDefaultMetrics,
  MetricsRegistry,
  Pushgateway,
} from "@mp/telemetry/prom";
import { WebSocket } from "@mp/ws/server";
import { ImmutableInjectionContainer } from "@mp/ioc";
import {
  ctxActorModelLookup,
  ctxArea,
  ctxGameStateLoader,
  ctxGameStateServer,
  ctxGlobalServerEventMiddleware,
  ctxLogger,
  ctxNpcSpawner,
  ctxRng,
  ctxGameplaySession,
  gameServerEventRouter,
  NpcAi,
  NpcSpawner,
} from "@mp/game/server";
import { RateLimiter } from "@mp/rate-limiter";
import { Rng } from "@mp/std";
import type { GameState, GameStateServer } from "@mp/game/server";
import {
  movementBehavior,
  combatBehavior,
  characterRemoveBehavior,
  ctxGameState,
  deriveClientVisibility,
} from "@mp/game/server";
import { registerEncoderExtensions } from "@mp/game/server";
import { clientViewDistance } from "@mp/game/server";
import { seed } from "../seed";

import { collectProcessMetrics } from "./metrics/process";
import { collectGameStateMetrics } from "./metrics/game-state";
import { opt } from "./options";
import { rateLimiterMiddleware } from "./etc/rate-limiter-middleware";
import { createGameStateFlusher } from "./etc/flush-game-state";
import { loadActorModels } from "./etc/load-actor-models";

import { createDbClient } from "@mp/db";
import { createTickMetricsObserver } from "./metrics/tick";
import { createPinoLogger } from "@mp/logger/pino";

import { eventRouterHandler } from "./etc/event-router-handler";
import { createGameStatePersistence } from "./etc/game-state-persistence";
import { createApiClient } from "@mp/api/sdk";
import { loadAreaResource } from "@mp/game/server";

// Note that this file is an entrypoint and should not have any exports

registerEncoderExtensions();

const rng = new Rng(opt.rngSeed);
const logger = createPinoLogger(opt.prettyLogs);
logger.info(opt, `Starting server...`);

RateLimiter.enabled = opt.rateLimit;

const api = createApiClient(opt.apiServiceUrl);

const metrics = new MetricsRegistry();
const metricsPushgateway = new Pushgateway(
  opt.metricsPushgateway.url,
  undefined,
  metrics,
);

const db = createDbClient(opt.databaseUrl);
db.$client.on("error", (err) => logger.error(err, "Database error"));

logger.info(`Loading areas and actor models...`);
const [area, actorModels] = await Promise.all([
  api.areaFileUrl
    .query(opt.areaId)
    .then((url) => loadAreaResource(opt.areaId, url)),
  api.actorSpritesheetUrls.query().then(loadActorModels),
]);

const gameStatePersistence = createGameStatePersistence(
  db,
  area,
  actorModels,
  rng,
);

logger.info(`Seeding database...`);
await seed(db, area, actorModels);

const wssUrl = new URL(opt.gatewayWssUrl);
wssUrl.searchParams.set("type", "game-server");

const gatewaySocket = new WebSocket(wssUrl);
gatewaySocket.binaryType = "arraybuffer";
gatewaySocket.on("error", (err) => logger.error(err, "Gateway socket error"));
gatewaySocket.on(
  "message",
  eventRouterHandler({
    logger,
    router: gameServerEventRouter,
    createContext: (session) => ioc.provide(ctxGameplaySession, session),
  }),
);

shouldOptimizeCollects.value = opt.patchOptimizer;

const gameState: GameState = {
  actors: new SyncMap([], {
    type: (actor) => actor.type,
    alive: (actor) => actor.alive.value,
    spawnId: (actor) =>
      actor.type === "npc" ? actor.identity.spawnId : undefined,
  }),
};

const gameStateServer: GameStateServer = new SyncServer({
  clientIds: () =>
    gameState.actors
      .values()
      .flatMap((a) => (a.type === "character" ? [a.identity.id] : [])),
  clientVisibility: deriveClientVisibility(
    clientViewDistance.networkFogOfWarTileCount,
    area,
  ),
});

const persistTicker = new Ticker({
  onError: (error) => logger.error(error, "Persist Ticker Error"),
  middleware: () => gameStatePersistence.persist(gameState),
});

const updateTicker = new Ticker({
  onError: (error) => logger.error(error, "Update Ticker Error"),
  middleware: createTickMetricsObserver(metrics),
});

logger.info(`Getting all NPCs and spawns...`);
const allNpcsAndSpawns = await gameStatePersistence.getAllSpawnsAndTheirNpcs();

const npcSpawner = new NpcSpawner(area, actorModels, allNpcsAndSpawns, rng);

const ioc = new ImmutableInjectionContainer()
  .provide(ctxGlobalServerEventMiddleware, rateLimiterMiddleware)
  .provide(ctxGameStateLoader, gameStatePersistence)
  .provide(ctxGameState, gameState)
  .provide(ctxGameStateServer, gameStateServer)
  .provide(ctxArea, area)
  .provide(ctxLogger, logger)
  .provide(ctxActorModelLookup, actorModels)
  .provide(ctxRng, rng)
  .provide(ctxNpcSpawner, npcSpawner);

collectDefaultMetrics({ register: metrics });
collectProcessMetrics(metrics);
collectGameStateMetrics(metrics, gameState);

const npcAi = new NpcAi(gameState, gameStateServer, area, rng);

updateTicker.subscribe(movementBehavior(gameState, area));
updateTicker.subscribe(npcSpawner.createTickHandler(gameState));
updateTicker.subscribe(combatBehavior(gameState, gameStateServer, area));
updateTicker.subscribe(npcAi.createTickHandler());
updateTicker.subscribe(
  createGameStateFlusher(gameState, gameStateServer, gatewaySocket, metrics),
);
updateTicker.subscribe(characterRemoveBehavior(gameState, logger));

persistTicker.start(opt.persistInterval);
updateTicker.start(opt.tickInterval);
setTimeout(
  () =>
    metricsPushgateway.push({
      jobName: "game-service",
      groupings: { areaId: opt.areaId },
    }),
  opt.metricsPushgateway.interval.totalMilliseconds,
);
