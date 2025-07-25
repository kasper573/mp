import "dotenv/config";
import http from "node:http";

import express from "express";

import { createTokenResolver } from "@mp/auth/server";
import { SyncServer, SyncMap, shouldOptimizeCollects } from "@mp/sync";
import { Ticker } from "@mp/time";
import { collectDefaultMetrics, MetricsRegistry } from "@mp/telemetry/prom";
import { WebSocketServer } from "@mp/ws/server";
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
import { metricsMiddleware } from "./express/metrics-middleware";
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

const api = createApiClient(opt.apiUrl);

const clients = new ClientRegistry();
const metrics = new MetricsRegistry();
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

const webServer = express()
  .set("trust proxy", opt.trustProxy)
  .use(metricsMiddleware(metrics))
  .use("/health", (req, res) => res.send("OK"));

const httpServer = http.createServer(webServer);

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

const wss = new WebSocketServer({
  path: opt.wsEndpointPath,
  server: httpServer,
  maxPayload: 5000,
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7, // default level
      level: 6, // default is 3, max is 9
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024,
    },
    clientNoContextTakeover: true, // defaults to negotiated value.
    serverNoContextTakeover: true, // defaults to negotiated value.
    serverMaxWindowBits: 10, // defaults to negotiated value.
    concurrencyLimit: 10, // limits zlib concurrency for perf.
    threshold: 1024, // messages under this size won't be compressed.
  },
});

wss.on("error", (err) => logger.error(err, "WebSocketServer error"));

const setupEventRoutingForSocket = setupEventRouter({
  logger,
  router: gameServerEventRouter,
  createContext: (socket) => ioc.provide(ctxClientId, getSocketId(socket)),
});

wss.on("connection", (socket) => {
  socket.binaryType = "arraybuffer";
  setupEventRoutingForSocket(socket);
  socket.on("close", () => clients.removeClient(getSocketId(socket)));
  socket.on("error", (err) =>
    logger.error(err, `WebSocket error for client ${getSocketId(socket)}`),
  );
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
  clientIds: () => wss.clients.values().map(getSocketId),
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

logger.info(`Attempting to listen on ${opt.hostname}:${opt.port}...`);
httpServer.listen(opt.port, opt.hostname, () => {
  logger.info(`Server listening on ${opt.hostname}:${opt.port}`);
});

persistTicker.start(opt.persistInterval);
updateTicker.start(opt.tickInterval);

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
