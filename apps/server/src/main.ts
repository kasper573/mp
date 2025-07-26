import "dotenv/config";

import { SyncServer, SyncMap, shouldOptimizeCollects } from "@mp/sync";
import { Ticker } from "@mp/time";
import {
  collectDefaultMetrics,
  metricsRegister,
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
  ctxUserSession,
  eventWithSessionEncoding,
  gameServerEventRouter,
  NpcAi,
  NpcSpawner,
} from "@mp/game/server";
import { RateLimiter } from "@mp/rate-limiter";
import { Rng, withBackoffRetries } from "@mp/std";
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

import { createDbClient } from "@mp/db-client";
import { createTickMetricsObserver } from "./metrics/tick";
import { createPinoLogger } from "@mp/logger/pino";

import { createGameStateLoader } from "./etc/game-state-loader";
import { createApiClient } from "@mp/api/sdk";
import { loadAreaResource } from "@mp/game/server";
import { createEventInvoker, QueuedEventInvoker } from "@mp/event-router";
import { gameStateDbSyncBehavior as startGameStateDbSync } from "./etc/game-state-db-sync";

// Note that this file is an entrypoint and should not have any exports

registerEncoderExtensions();

metricsRegister.setDefaultLabels({ areaId: opt.areaId });

const rng = new Rng(opt.rngSeed);
const logger = createPinoLogger(opt.prettyLogs);
logger.info(opt, `Starting server...`);

RateLimiter.enabled = opt.rateLimit;

const api = createApiClient(opt.apiServiceUrl);

const metricsPushgateway = new Pushgateway(opt.metricsPushgateway.url);

const db = createDbClient(opt.databaseConnectionString);
db.$client.on("error", (err) => logger.error(err, "Database error"));

logger.info(`Loading areas and actor models...`);
const [area, actorModels] = await withBackoffRetries(() =>
  Promise.all([
    api.areaFileUrl
      .query(opt.areaId)
      .then((url) => loadAreaResource(opt.areaId, url)),
    api.actorSpritesheetUrls.query().then(loadActorModels),
  ]),
).catch((error) => {
  logger.error(error, "Failed to load area and actor data from API service");
  process.exit(1);
});

const gameStateLoader = createGameStateLoader(db, area);

logger.info(`Seeding database...`);
await seed(db, area, actorModels);

const wssUrl = new URL(opt.gatewayWssUrl);
wssUrl.searchParams.set("type", "game-server");
const eventInvoker = new QueuedEventInvoker({
  invoke: createEventInvoker(gameServerEventRouter),
  logger,
});
const gatewaySocket = new WebSocket(wssUrl);
gatewaySocket.binaryType = "arraybuffer";
gatewaySocket.on("error", (err) => logger.error(err, "Gateway socket error"));
gatewaySocket.on("message", (buffer: ArrayBuffer) => {
  const result = eventWithSessionEncoding.decode(buffer);
  if (result.isOk()) {
    eventInvoker.addEvent(
      result.value.event,
      ioc.provide(ctxUserSession, result.value.session),
    );
  }
});

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

const updateTicker = new Ticker({
  onError: (error) => logger.error(error, "Update Ticker Error"),
  middleware: createTickMetricsObserver(),
});

logger.info(`Getting all NPCs and spawns...`);
const allNpcsAndSpawns = await gameStateLoader.getAllSpawnsAndTheirNpcs();

const npcSpawner = new NpcSpawner(area, actorModels, allNpcsAndSpawns, rng);

const ioc = new ImmutableInjectionContainer()
  .provide(ctxGlobalServerEventMiddleware, rateLimiterMiddleware)
  .provide(ctxGameStateLoader, gameStateLoader)
  .provide(ctxGameState, gameState)
  .provide(ctxGameStateServer, gameStateServer)
  .provide(ctxArea, area)
  .provide(ctxLogger, logger)
  .provide(ctxActorModelLookup, actorModels)
  .provide(ctxRng, rng)
  .provide(ctxNpcSpawner, npcSpawner);

collectDefaultMetrics();
collectProcessMetrics();
collectGameStateMetrics(gameState);

const npcAi = new NpcAi(gameState, gameStateServer, area, rng);

updateTicker.subscribe(movementBehavior(gameState, area));
updateTicker.subscribe(npcSpawner.createTickHandler(gameState));
updateTicker.subscribe(combatBehavior(gameState, gameStateServer, area));
updateTicker.subscribe(npcAi.createTickHandler());
updateTicker.subscribe(
  createGameStateFlusher(gameState, gameStateServer, gatewaySocket),
);
updateTicker.subscribe(characterRemoveBehavior(gameState, logger));

startGameStateDbSync(db, area, gameState, gameStateServer);
updateTicker.start(opt.tickInterval);
setInterval(
  () => metricsPushgateway.push({ jobName: "game-service" }),
  opt.metricsPushgateway.interval.totalMilliseconds,
);
