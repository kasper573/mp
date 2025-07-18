import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { createConsoleLogger } from "@mp/logger";
import express from "express";
import createCors from "cors";
import { createTokenResolver } from "@mp/auth/server";
import { SyncServer, SyncEntity, SyncMap } from "@mp/sync";
import { Ticker } from "@mp/time";
import { collectDefaultMetrics, MetricsRegistry } from "@mp/telemetry/prom";
import { WebSocketServer } from "@mp/ws/server";
import { ImmutableInjectionContainer } from "@mp/ioc";
import {
  ctxActorModelLookup,
  ctxClientId,
  ctxClientRegistry,
  ctxGameStateServer,
  ctxNpcSpawner,
  ctxTokenResolver,
  ctxUserService,
  NpcAi,
  NpcSpawner,
} from "@mp/game/server";
import { RateLimiter } from "@mp/rate-limiter";
import { Rng, type LocalFile } from "@mp/std";
import { ctxGlobalMiddleware } from "@mp/game/server";
import type { GameState } from "@mp/game/server";
import {
  ctxRng,
  ctxAreaFileUrlResolver,
  ctxAreaLookup,
  ClientRegistry,
  movementBehavior,
  combatBehavior,
  characterRemoveBehavior,
  ctxCharacterService,
  ctxNpcService,
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
import { collectUserMetrics } from "./metrics/user";
import { createExpressLogger } from "./express/logger";
import { areaServerOptions } from "./options";
import { rateLimiterMiddleware } from "./etc/rate-limiter-middleware";
import { serverFileToPublicUrl } from "./etc/server-file-to-public-url";
import { setupRpcTransceivers } from "./etc/rpc-wss";
import { loadAreas } from "./etc/load-areas";
import { getSocketId } from "./etc/get-socket-id";
import { createGameStateFlusher } from "./etc/flush-game-state";
import { loadActorModels } from "./etc/load-actor-models";
import { playerRoles } from "./roles";
import { ctxUpdateTicker } from "./etc/system-rpc";
import { createNpcService } from "./db/services/npc-service";
import { createDbClient } from "./db/client";
import { createCharacterService } from "./db/services/character-service";
import { createUserService } from "./db/services/user-service";
import { createGameStateService } from "./db/services/game-service";
import { createTickMetricsObserver } from "./metrics/tick";
import { areaServerRpcRouter } from "./rpc/area-server-rpc";
import { AreaServerRegistry } from "./services/area-server-registry";

// Note that this file is an entrypoint and should not have any exports

registerEncoderExtensions();

const opt = areaServerOptions;
const rng = new Rng(opt.rngSeed);
const logger = createConsoleLogger();
logger.info(opt, `Starting area server for areas: ${opt.areas.join(", ")}`);

RateLimiter.enabled = opt.rateLimit;

const userService = createUserService();
const clients = new ClientRegistry();
const metrics = new MetricsRegistry();
const tokenResolver = createTokenResolver({
  ...opt.auth,
  getBypassUser,
  onResolve(result) {
    if (result.isOk()) {
      userService.memorizeUserInfo(result.value);
    }
  },
});

const db = createDbClient(opt.databaseUrl);
db.$client.on("error", (err) => logger.error(err, "Database error"));

const webServer = express()
  .set("trust proxy", opt.trustProxy)
  .use(metricsMiddleware(metrics))
  .use("/health", (req, res) => res.send("OK"))
  // the above is intentionally placed before logger since it's so verbose and unnecessary to log
  .use(createExpressLogger(logger))
  .use(createCors({ origin: opt.corsOrigin }))
  .use(
    opt.publicPath,
    express.static(opt.publicDir, {
      maxAge: opt.publicMaxAge * 1000,
    }),
  );

const httpServer = http.createServer(webServer);

logger.info(`Loading areas and actor models...`);
const [allAreas, actorModels] = await Promise.all([
  loadAreas(path.resolve(opt.publicDir, "areas")),
  loadActorModels(opt.publicDir),
]);

// Filter areas to only include the ones this server should handle
const areas = new Map();
for (const areaId of opt.areas) {
  const area = allAreas.get(areaId);
  if (area) {
    areas.set(areaId, area);
  } else {
    logger.warn(`Area ${areaId} not found, skipping`);
  }
}

if (areas.size === 0) {
  throw new Error("No valid areas configured for this server");
}

logger.info(`Seeding database...`);
await seed(db, areas, actorModels);

// Register this area server
const areaServerRegistry = new AreaServerRegistry(db);
await areaServerRegistry.register(opt.serverId, {
  areas: Array.from(areas.keys()),
  endpoint: `${opt.httpBaseUrl}${opt.wsEndpointPath}`,
  healthCheck: `${opt.httpBaseUrl}/health`,
});

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

wss.on("connection", (socket) => {
  socket.on("close", () => clients.removeClient(getSocketId(socket)));
  socket.on("error", (err) =>
    logger.error(err, `WebSocket error for client ${getSocketId(socket)}`),
  );
});

setupRpcTransceivers({
  wss,
  logger,
  router: areaServerRpcRouter,
  createContext: (socket) => ioc.provide(ctxClientId, getSocketId(socket)),
});

SyncEntity.shouldOptimizeCollects = opt.patchOptimizer;

const gameState: GameState = {
  actors: new SyncMap([], {
    type: (actor) => actor.type,
    alive: (actor) => actor.health > 0,
    areaId: (actor) => actor.areaId,
    spawnId: (actor) => (actor.type === "npc" ? actor.spawnId : undefined),
  }),
};

const gameStateServer = new SyncServer<GameState, GameStateEvents>({
  clientIds: () => wss.clients.values().map(getSocketId),
  clientVisibility: deriveClientVisibility(
    clients,
    clientViewDistance.networkFogOfWarTileCount,
    areas,
  ),
});

const npcService = createNpcService(db, areas);
const gameService = createGameStateService(db);

const persistTicker = new Ticker({
  onError: logger.error,
  middleware: () => gameService.persist(gameState),
});

const observeTick = createTickMetricsObserver(metrics);

const updateTicker = new Ticker({
  onError: logger.error,
  middleware(opt) {
    // Build an index of commonly accessed entities before each tick.
    // This lets us to easily get some nice performance improvements for for simple lookups.
    // Should only be used for values that don't require more precision than the state of the last tick.
    gameState.actors.index.build();
    observeTick(opt);
  },
});

logger.info(`Getting all NPCs and spawns for configured areas...`);
const allNpcsAndSpawns = await npcService.getAllSpawnsAndTheirNpcs();

// Filter NPCs and spawns to only include those in our areas
const npcAndSpawns = allNpcsAndSpawns.filter((spawn) =>
  areas.has(spawn.areaId as string),
);

const characterService = createCharacterService(
  db,
  userService,
  areas,
  actorModels,
  rng,
);
const npcSpawner = new NpcSpawner(areas, actorModels, npcAndSpawns, rng);

const ioc = new ImmutableInjectionContainer()
  .provide(ctxGlobalMiddleware, rateLimiterMiddleware)
  .provide(ctxUserService, userService)
  .provide(ctxNpcService, npcService)
  .provide(ctxCharacterService, characterService)
  .provide(ctxGameState, gameState)
  .provide(ctxGameStateServer, gameStateServer)
  .provide(ctxAreaLookup, areas)
  .provide(ctxTokenResolver, tokenResolver)
  .provide(ctxClientRegistry, clients)
  .provide(ctxAreaFileUrlResolver, (id) =>
    serverFileToPublicUrl(`areas/${id}.json` as LocalFile),
  )
  .provide(ctxActorModelLookup, actorModels)
  .provide(ctxUpdateTicker, updateTicker)
  .provide(ctxRng, rng)
  .provide(ctxNpcSpawner, npcSpawner);

collectDefaultMetrics({ register: metrics });
collectProcessMetrics(metrics);
collectUserMetrics(metrics, clients, gameState);

const npcAi = new NpcAi(gameState, gameStateServer, areas, rng);

updateTicker.subscribe(movementBehavior(gameState, areas));
updateTicker.subscribe(npcSpawner.createTickHandler(gameState));
updateTicker.subscribe(combatBehavior(gameState, gameStateServer, areas));
updateTicker.subscribe(npcAi.createTickHandler());
updateTicker.subscribe(
  createGameStateFlusher(gameState, gameStateServer, wss.clients, metrics),
);
updateTicker.subscribe(characterRemoveBehavior(clients, gameState, logger));

logger.info(`Attempting to listen on ${opt.hostname}:${opt.port}...`);
httpServer.listen(opt.port, opt.hostname, () => {
  logger.info(`Area server listening on ${opt.hostname}:${opt.port}`);
});

persistTicker.start(opt.persistInterval);
updateTicker.start(opt.tickInterval);

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down gracefully...");
  await areaServerRegistry.unregister(opt.serverId);
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("Received SIGINT, shutting down gracefully...");
  await areaServerRegistry.unregister(opt.serverId);
  process.exit(0);
});

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