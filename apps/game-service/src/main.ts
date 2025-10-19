import { createApiClient } from "@mp/api-service/sdk";
import { createDbClient } from "@mp/db";
import {
  createEventInvoker,
  createProxyEventInvoker,
  QueuedEventInvoker,
} from "@mp/event-router";
import type { GameState } from "@mp/game-shared";
import {
  clientViewDistance,
  eventMessageEncoding,
  eventWithSessionEncoding,
  GameServiceConfig,
  gameServiceConfigRedisKey,
  GameStateGlobals,
  loadAreaResource,
  registerEncoderExtensions,
  syncMessageWithRecipientEncoding,
} from "@mp/game-shared";
import { InjectionContainer } from "@mp/ioc";
import { createPinoLogger } from "@mp/logger/pino";
import { RateLimiter } from "@mp/rate-limiter";
import { createRedisSyncEffect, Redis } from "@mp/redis";
import { signal } from "@mp/state";
import { Rng, withBackoffRetries } from "@mp/std";
import { shouldOptimizeTrackedProperties, SyncMap, SyncServer } from "@mp/sync";
import {
  collectDefaultMetrics,
  MetricsHistogram,
  Pushgateway,
} from "@mp/telemetry/prom";
import { Ticker } from "@mp/time";
import { parseSocketError, ReconnectingWebSocket } from "@mp/ws/server";
import "dotenv/config";
import {
  ctxActorModelLookup,
  ctxArea,
  ctxGameEventClient,
  ctxGameState,
  ctxGameStateLoader,
  ctxGameStateServer,
  ctxItemDefinitionLookup,
  ctxLogger,
  ctxNpcSpawner,
  ctxRng,
  ctxUserSession,
} from "./context";
import { createActorModelLookup } from "./etc/actor-model-lookup";
import { deriveClientVisibility } from "./etc/client-visibility";
import { combatBehavior } from "./etc/combat-behavior";
import { gameStateDbSyncBehavior as startGameStateDbSync } from "./etc/db-sync-behavior";
import {
  createItemDefinitionLookup,
  GameDataLoader,
} from "./etc/game-data-loader";
import type { GameStateServer } from "./etc/game-state-server";
import { movementBehavior } from "./etc/movement-behavior";
import { NpcRewardSystem } from "./etc/npc-reward-system";
import { NpcAi } from "./etc/npc/npc-ai";
import { NpcSpawner } from "./etc/npc/npc-spawner";
import { collectGameStateMetrics } from "./metrics/game-state";
import { byteBuckets } from "./metrics/shared";
import { createTickMetricsObserver } from "./metrics/tick";
import { opt } from "./options";
import { gameServiceEvents, type GameServiceEvents } from "./router";

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
  shouldOptimizeTrackedProperties.value = config.isPatchOptimizerEnabled;
});

const metricsPushgateway = new Pushgateway(opt.metricsPushgateway.url);

const db = createDbClient(opt.databaseConnectionString);
await db.initialize();
db.driver.master.on("error", (err: Error) => logger.error(err, "Database error"));

logger.info(`Loading area and actor models...`);
const [area, actorModels] = await withBackoffRetries(() =>
  Promise.all([
    api.areaFileUrl
      .query({ areaId: opt.areaId, urlType: "internal" })
      .then((url) => loadAreaResource(opt.areaId, url)),
    api.actorModelIds.query().then(createActorModelLookup),
  ]),
).catch((error) => {
  logger.error(error, "Failed to load area and actor data from API service");
  process.exit(1);
});

const gameDataLoader = new GameDataLoader(db, area, actorModels, rng);
const perSessionEventLimit = new RateLimiter({ points: 20, duration: 1 });

const eventInvoker = new QueuedEventInvoker({
  invoke: createEventInvoker(gameServiceEvents),
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

const gameEventBroadcastClient = createProxyEventInvoker<GameServiceEvents>(
  (event) => gatewaySocket.send(eventMessageEncoding.encode(event)),
);

function handleGatewayMessage({ data }: MessageEvent<ArrayBuffer>) {
  // Handle game client -> game service messages
  const eventWithSession = eventWithSessionEncoding.decode(data);
  if (eventWithSession.isOk()) {
    const { character } = eventWithSession.value.session;
    if (character && !gameState.actors.has(character.id)) {
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
    return;
  }

  logger.warn(
    { size: data.byteLength, error: event.error },
    `Received unknown message from game service. ` +
      `Message decode error: ${event.error}`,
    `Event decode error: ${eventWithSession.error}`,
  );
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
  globals: new SyncMap([
    ["instance", GameStateGlobals.create({ areaId: opt.areaId })],
  ]),
  actors: new SyncMap(),
  items: new SyncMap(),
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
const npcSpawner = new NpcSpawner(
  area,
  actorModels,
  await gameDataLoader.getAllSpawnsAndTheirNpcs(),
  rng,
);

const ioc = new InjectionContainer()
  .provide(ctxGameStateLoader, gameDataLoader)
  .provide(ctxGameState, gameState)
  .provide(ctxGameStateServer, gameStateServer)
  .provide(ctxArea, area)
  .provide(ctxLogger, logger)
  .provide(ctxActorModelLookup, actorModels)
  .provide(ctxRng, rng)
  .provide(ctxNpcSpawner, npcSpawner)
  .provide(ctxGameEventClient, gameEventBroadcastClient)
  .provide(
    ctxItemDefinitionLookup,
    createItemDefinitionLookup(await gameDataLoader.getAllItemDefinitions()),
  );

logger.info(`Getting all NPC rewards...`);
const npcRewardSystem = new NpcRewardSystem(
  ioc,
  await gameDataLoader.getAllNpcRewards(),
);

const npcAi = new NpcAi(gameState, gameStateServer, area, rng);

updateTicker.subscribe(movementBehavior(ioc));
updateTicker.subscribe(npcSpawner.createTickHandler(gameState));
updateTicker.subscribe(
  combatBehavior(gameState, gameStateServer, area, npcRewardSystem),
);
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
