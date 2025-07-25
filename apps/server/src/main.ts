import "dotenv/config";

import { createTokenResolver } from "@mp/auth/server";
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
  ctxClientId,
  ctxClientRegistry,
  ctxGameStateLoader,
  ctxGameStateServer,
  ctxGlobalServerEventMiddleware,
  ctxLogger,
  ctxNpcSpawner,
  ctxRng,
  ctxTokenResolver,
  gameServerEventRouter,
  NpcAi,
  NpcSpawner,
} from "@mp/game/server";
import { RateLimiter } from "@mp/rate-limiter";
import { Rng } from "@mp/std";
import type { GameState } from "@mp/game/server";
import {
  ClientRegistry,
  movementBehavior,
  combatBehavior,
  characterRemoveBehavior,
  ctxGameState,
  deriveClientVisibility,
} from "@mp/game/server";
import { registerEncoderExtensions } from "@mp/game/server";
import { clientViewDistance } from "@mp/game/server";
import { parseBypassUser, type AccessToken, type UserIdentity } from "@mp/auth";
import { seed } from "../seed";
import type { GameStateEvents } from "@mp/game/server";
import { collectProcessMetrics } from "./metrics/process";

import { collectGameStateMetrics } from "./metrics/game-state";
import { opt } from "./options";
import { rateLimiterMiddleware } from "./etc/rate-limiter-middleware";
import { getSocketId } from "./etc/get-socket-id";
import { createGameStateFlusher } from "./etc/flush-game-state";
import { loadActorModels } from "./etc/load-actor-models";
import { playerRoles } from "./roles";
import { createDbClient } from "@mp/db";
import { createTickMetricsObserver } from "./metrics/tick";
import { createPinoLogger } from "@mp/logger/pino";

import { setupEventRouter } from "./etc/setup-event-router";
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

const clients = new ClientRegistry();
const metrics = new MetricsRegistry();
const metricsPushgateway = new Pushgateway(
  opt.metricsPushgateway.url,
  undefined,
  metrics,
);
const tokenResolver = createTokenResolver({
  ...opt.auth,
  getBypassUser,
  onResolve(result) {
    if (result.isOk()) {
      gameStatePersistence.memorizeUserInfo(result.value);
    }
  },
});

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

const gatewaySocket = new WebSocket(opt.gatewayWssUrl);
gatewaySocket.binaryType = "arraybuffer";
gatewaySocket.on("error", (err) => logger.error(err, "Gateway socket error"));
// If we lose connection to the gateway all hell breaks loose and we can't recover,
// so better to just clear all clients. On reconnect clients will begin reconnecting.
gatewaySocket.on("close", () => clients.clearAll());
setupEventRouter({
  socket: gatewaySocket,
  logger,
  router: gameServerEventRouter,
  createContext: (socket) => ioc.provide(ctxClientId, getSocketId(socket)),
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

const gameStateServer = new SyncServer<GameState, GameStateEvents>({
  clientIds: () => clients.getClientIds(),
  clientVisibility: deriveClientVisibility(
    clients,
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
  .provide(ctxClientRegistry, clients)
  .provide(ctxLogger, logger)
  .provide(ctxActorModelLookup, actorModels)
  .provide(ctxRng, rng)
  .provide(ctxTokenResolver, tokenResolver)
  .provide(ctxNpcSpawner, npcSpawner);

collectDefaultMetrics({ register: metrics });
collectProcessMetrics(metrics);
collectGameStateMetrics(metrics, clients, gameState);

const npcAi = new NpcAi(gameState, gameStateServer, area, rng);

updateTicker.subscribe(movementBehavior(gameState, area));
updateTicker.subscribe(npcSpawner.createTickHandler(gameState));
updateTicker.subscribe(combatBehavior(gameState, gameStateServer, area));
updateTicker.subscribe(npcAi.createTickHandler());
updateTicker.subscribe(
  createGameStateFlusher(gameState, gameStateServer, wss.clients, metrics),
);
updateTicker.subscribe(characterRemoveBehavior(clients, gameState, logger));

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

function getBypassUser(token: AccessToken): UserIdentity | undefined {
  if (!opt.auth.allowBypassUsers) {
    return;
  }

  const user = parseBypassUser(token);
  if (!user) {
    return;
  }

  user.roles = new Set(playerRoles);
  return user;
}
