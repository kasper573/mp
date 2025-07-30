import { createApiClient } from "@mp/api-service/sdk";
import { createDbClient } from "@mp/db";
import {
  createEventInvoker,
  createProxyEventInvoker,
  eventMessageEncoding,
  QueuedEventInvoker,
} from "@mp/event-router";
import type { GameStateServer } from "@mp/game/server";
import {
  combatBehavior,
  ctxArea,
  ctxGameEventClient,
  ctxGameStateLoader,
  ctxGameStateServer,
  ctxNpcSpawner,
  ctxRng,
  deriveClientVisibility,
  gameServerEventRouter,
  movementBehavior,
  NpcAi,
  NpcSpawner,
} from "@mp/game/server";
import type { GameEventClient, GameState } from "@mp/game/shared";
import {
  clientViewDistance,
  ctxActorModelLookup,
  ctxGameState,
  ctxLogger,
  ctxUserSession,
  eventWithSessionEncoding,
  GameServiceConfig,
  gameServiceConfigRedisKey,
  GameStateAreaEntity,
  loadAreaResource,
  registerEncoderExtensions,
  syncMessageWithRecipientEncoding,
} from "@mp/game/shared";
import { ImmutableInjectionContainer } from "@mp/ioc";
import { createPinoLogger } from "@mp/logger/pino";
import { RateLimiter } from "@mp/rate-limiter";
import { createRedisSyncEffect, Redis } from "@mp/redis";
import { signal } from "@mp/state";
import { Rng, withBackoffRetries } from "@mp/std";
import { shouldOptimizeCollects, SyncMap, SyncServer } from "@mp/sync";
import {
  collectDefaultMetrics,
  MetricsHistogram,
  Pushgateway,
} from "@mp/telemetry/prom";
import { Ticker } from "@mp/time";
import { parseSocketError, ReconnectingWebSocket } from "@mp/ws/server";
import "dotenv/config";
import { createActorModelLookup } from "./db/actor-model-lookup";
import { gameStateDbSyncBehavior as startGameStateDbSync } from "./db/game-state-db-sync";
import { createGameStateLoader } from "./db/game-state-loader";
import { collectGameStateMetrics } from "./metrics/game-state";
import { byteBuckets } from "./metrics/shared";
import { createTickMetricsObserver } from "./metrics/tick";
import { opt } from "./options";

// Note that this file is an entrypoint and should not have any exports

registerEncoderExtensions();
collectDefaultMetrics();
RateLimiter.enabled = opt.rateLimit;

const rng = new Rng(opt.rngSeed);
const logger = createPinoLogger(opt.prettyLogs, { areaId: opt.areaId });
logger.info(opt, `Starting server...`);

const api = createApiClient(opt.apiServiceUrl);

const redisClient = new Redis(opt.redisPath);

const gameServiceConfig = signal<GameServiceConfig>({
  isPatchOptimizerEnabled: true,
});

createRedisSyncEffect(
  redisClient,
  gameServiceConfigRedisKey,
  GameServiceConfig,
  gameServiceConfig,
);

gameServiceConfig.subscribe((config) => {
  shouldOptimizeCollects.value = config.isPatchOptimizerEnabled;
});

const metricsPushgateway = new Pushgateway(opt.metricsPushgateway.url);

const db = createDbClient(opt.databaseConnectionString);
db.$client.on("error", (err) => logger.error(err, "Database error"));

logger.info(`Loading area and actor models...`);
const [area, actorModels] = await withBackoffRetries(() =>
  Promise.all([
    api.areaFileUrl
      .query({ areaId: opt.areaId, urlType: "internal" })
      .then((url) => loadAreaResource(opt.areaId, url)),
    api.actorSpritesheetUrls.query("internal").then(createActorModelLookup),
  ]),
).catch((error) => {
  logger.error(error, "Failed to load area and actor data from API service");
  process.exit(1);
});

const gameStateLoader = createGameStateLoader(db, area, actorModels, rng);
const perSessionEventLimit = new RateLimiter({ points: 20, duration: 1 });

const eventInvoker = new QueuedEventInvoker({
  invoke: createEventInvoker(gameServerEventRouter),
  logger,
});

const gatewayWssUrl = new URL(opt.gatewayWssUrl);
gatewayWssUrl.searchParams.set("gameServiceSecret", opt.gatewaySecret);
gatewayWssUrl.searchParams.set("gameServiceAreaId", opt.areaId);

const gatewaySocket = new ReconnectingWebSocket(gatewayWssUrl.toString());
gatewaySocket.binaryType = "arraybuffer";
gatewaySocket.addEventListener("error", (err) =>
  logger.error(parseSocketError(err), "Gateway socket error"),
);
gatewaySocket.addEventListener("message", handleGatewayMessage);

const gameEventBroadcastClient: GameEventClient = createProxyEventInvoker(
  (event) => gatewaySocket.send(eventMessageEncoding.encode(event)),
);

function handleGatewayMessage({ data }: MessageEvent<ArrayBuffer>) {
  // Handle game client -> game service messages
  const eventWithSession = eventWithSessionEncoding.decode(data);
  if (eventWithSession.isOk()) {
    const { characterId } = eventWithSession.value.session;
    if (characterId && !gameState.actors.has(characterId)) {
      // Messages for unknown characters can be safely ignored.
      // These are just broadcasts from the gateway,
      // and the intent is for the appropriate game service instance to react.
      return;
    }

    eventInvoker.addEvent(
      eventWithSession.value.event,
      ioc.provide(ctxUserSession, eventWithSession.value.session),
      () => perSessionEventLimit.consume(eventWithSession.value.session.id),
    );
    return;
  }

  // Handle game service -> game service messages
  const event = eventMessageEncoding.decode(data);
  if (event.isOk()) {
    eventInvoker.addEvent(event.value, ioc);
  }
}

function flushGameState() {
  const { clientEvents, clientPatches } = gameStateServer.flush(gameState);

  if (clientEvents.size || clientPatches.size) {
    const time = new Date();

    const recipientIds = new Set([
      ...clientEvents.keys(),
      ...clientPatches.keys(),
    ]);

    for (const recipientId of recipientIds) {
      const patch = clientPatches.get(recipientId);
      const events = clientEvents.get(recipientId);
      if (patch?.length || events?.length) {
        const encodedMessage = syncMessageWithRecipientEncoding.encode([
          [patch, time, events],
          recipientId,
        ]);
        syncMessageSizeHistogram.observe(encodedMessage.byteLength);
        gatewaySocket.send(encodedMessage);
      }
    }
  }
}

const syncMessageSizeHistogram = new MetricsHistogram({
  name: "game_service_to_gateway_sync_message_byte_size",
  help: "This measures the data sent over the internal network",
  buckets: byteBuckets,
});

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
  .provide(ctxNpcSpawner, npcSpawner)
  .provide(ctxGameEventClient, gameEventBroadcastClient);

const npcAi = new NpcAi(gameState, gameStateServer, area, rng);

updateTicker.subscribe(movementBehavior(ioc));
updateTicker.subscribe(npcSpawner.createTickHandler(gameState));
updateTicker.subscribe(combatBehavior(gameState, gameStateServer, area));
updateTicker.subscribe(npcAi.createTickHandler());
updateTicker.subscribe(flushGameState);

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
