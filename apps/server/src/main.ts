import "dotenv/config";

import {
  SyncServer,
  SyncMap,
  shouldOptimizeCollects,
  flushResultEncoding,
} from "@mp/sync";
import { Ticker } from "@mp/time";
import { collectDefaultMetrics, Pushgateway } from "@mp/telemetry/prom";
import { ReconnectingWebSocket } from "@mp/ws/server";
import { ImmutableInjectionContainer } from "@mp/ioc";
import {
  ctxActorModelLookup,
  ctxArea,
  ctxGameStateLoader,
  ctxGameStateServer,
  ctxLogger,
  ctxNpcSpawner,
  ctxRng,
  ctxUserSession,
  eventWithSessionEncoding,
  gameServerEventRouter,
  GameStateAreaEntity,
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
import { collectGameStateMetrics } from "./metrics/game-state";
import { opt } from "./options";
import { createDbClient } from "@mp/db-client";
import { createTickMetricsObserver } from "./metrics/tick";
import { createPinoLogger } from "@mp/logger/pino";
import { createGameStateLoader } from "./db/game-state-loader";
import { createApiClient } from "@mp/api/sdk";
import { loadAreaResource } from "@mp/game/server";
import { createEventInvoker, QueuedEventInvoker } from "@mp/event-router";
import { gameStateDbSyncBehavior as startGameStateDbSync } from "./db/game-state-db-sync";
import { gameStateFlushHistogram } from "./metrics/game-state-flush";
import { createActorModelLookup } from "./db/actor-model-lookup";

// Note that this file is an entrypoint and should not have any exports

registerEncoderExtensions();
collectDefaultMetrics();
shouldOptimizeCollects.value = opt.patchOptimizer;
RateLimiter.enabled = opt.rateLimit;

const rng = new Rng(opt.rngSeed);
const logger = createPinoLogger(opt.prettyLogs);
logger.info(opt, `Starting server...`);

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
    api.actorSpritesheetUrls.query().then(createActorModelLookup),
  ]),
).catch((error) => {
  logger.error(error, "Failed to load area and actor data from API service");
  process.exit(1);
});

const gameStateLoader = createGameStateLoader(db, area, actorModels, rng);

logger.info(`Seeding database...`);
await seed(db, area, actorModels);

const perSessionEventLimit = new RateLimiter({ points: 20, duration: 1 });

const eventInvoker = new QueuedEventInvoker({
  invoke: createEventInvoker(gameServerEventRouter),
  logger,
});
const gatewaySocket = new ReconnectingWebSocket(opt.gatewayWssUrl);
gatewaySocket.binaryType = "arraybuffer";
gatewaySocket.addEventListener("error", (err) =>
  logger.error(err, "Gateway socket error"),
);
gatewaySocket.addEventListener("message", handleGatewayMessage);

function handleGatewayMessage(event: MessageEvent<ArrayBuffer>) {
  const message = eventWithSessionEncoding.decode(event.data);
  if (message.isOk()) {
    eventInvoker.addEvent(
      message.value.event,
      ioc.provide(ctxUserSession, message.value.session),
      () => perSessionEventLimit.consume(message.value.session.id),
    );
  }
}

function flushGameState() {
  const flushResult = gameStateServer.flush(gameState);
  if (flushResult.clientEvents.size || flushResult.clientPatches.size) {
    const time = new Date();
    const encoded = flushResultEncoding().encode([flushResult, time]);
    gameStateFlushHistogram.observe(encoded.byteLength);
    gatewaySocket.send(encoded);
  }
}

const gameState: GameState = {
  area: new SyncMap([["current", new GameStateAreaEntity({ id: area.id })]]),
  actors: new SyncMap([], {
    type: (actor) => actor.type,
    alive: (actor) => actor.alive.value,
    spawnId: (actor) =>
      actor.type === "npc" ? actor.identity.spawnId : undefined,
  }),
};

collectGameStateMetrics(gameState);

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
  .provide(ctxGameStateLoader, gameStateLoader)
  .provide(ctxGameState, gameState)
  .provide(ctxGameStateServer, gameStateServer)
  .provide(ctxArea, area)
  .provide(ctxLogger, logger)
  .provide(ctxActorModelLookup, actorModels)
  .provide(ctxRng, rng)
  .provide(ctxNpcSpawner, npcSpawner);

const npcAi = new NpcAi(gameState, gameStateServer, area, rng);

updateTicker.subscribe(movementBehavior(ioc));
updateTicker.subscribe(npcSpawner.createTickHandler(gameState));
updateTicker.subscribe(combatBehavior(gameState, gameStateServer, area));
updateTicker.subscribe(npcAi.createTickHandler());
updateTicker.subscribe(flushGameState);
updateTicker.subscribe(characterRemoveBehavior(gameState, logger));

startGameStateDbSync(
  db,
  area,
  gameState,
  gameStateServer,
  actorModels,
  rng,
  logger,
);

updateTicker.start(opt.tickInterval);

setInterval(
  () =>
    metricsPushgateway.push({
      jobName: "game-service",
      groupings: { areaId: opt.areaId },
    }),
  opt.metricsPushgateway.interval.totalMilliseconds,
);
