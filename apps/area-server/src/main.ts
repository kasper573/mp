import "dotenv/config";
import http from "node:http";
import path from "node:path";
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
import { seed } from "@mp/server-common";
import type { GameStateEvents } from "@mp/game/server";
import { createExpressLogger } from "@mp/server-common";
import { metricsMiddleware } from "@mp/server-common";
import { collectProcessMetrics } from "@mp/server-common";
import { collectUserMetrics } from "@mp/server-common";
import { rateLimiterMiddleware } from "@mp/server-common";
import { serverFileToPublicUrl } from "@mp/server-common";
import { loadAreas } from "@mp/server-common";
import { loadActorModels } from "@mp/server-common";
import { playerRoles } from "@mp/server-common";
import { createTickMetricsObserver } from "@mp/server-common";
import { createDbClient } from "@mp/server-common";
import { createCharacterService } from "@mp/server-common";
import { createUserService } from "@mp/server-common";
import { createNpcService } from "@mp/server-common";
import { createGameStateService } from "@mp/server-common";
import { areaServerOptions } from "@mp/server-common";
import { createPinoLogger } from "@mp/logger/pino";
import { setupRpcTransceivers } from "./rpc-setup";
import { areaServerRpcRouter } from "./rpc";
import { getSocketId } from "@mp/server-common";
import { createGameStateFlusher } from "@mp/server-common";
import { ctxUpdateTicker } from "./system-rpc";

// Note that this file is an entrypoint and should not have any exports

registerEncoderExtensions();

const opt = areaServerOptions;
const logger = createPinoLogger(opt.prettyLogs);
logger.info(opt, `Starting area server for areas: ${opt.areaIds.join(", ")}...`);

RateLimiter.enabled = opt.rateLimit;

const rng = new Rng(opt.rngSeed);
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
  .use(createExpressLogger(logger))
  .use(createCors({ origin: opt.corsOrigin }));

const httpServer = http.createServer(webServer);

logger.info(`Loading areas and actor models...`);
const [allAreas, actorModels] = await Promise.all([
  loadAreas(path.resolve(opt.publicDir, "areas")),
  loadActorModels(opt.publicDir),
]);

// Filter areas to only include those this server should handle
const areas = new Map(
  [...allAreas.entries()].filter(([areaId]) => 
    opt.areaIds.includes(areaId)
  )
);

logger.info(`This server will handle ${areas.size} areas: ${Array.from(areas.keys()).join(", ")}`);

logger.info(`Seeding database...`);
await seed(db, allAreas, actorModels);

const wss = new WebSocketServer({
  path: opt.wsEndpointPath,
  server: httpServer,
  maxPayload: 5000,
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 6,
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024,
    },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 10,
    concurrencyLimit: 10,
    threshold: 1024,
  },
});

wss.on("error", (err) => logger.error(err, "WebSocketServer error"));

wss.on("connection", (socket) => {
  socket.on("close", () => clients.removeClient(getSocketId(socket)));
  socket.on("error", (err) =>
    logger.error(err, `WebSocket error for client ${getSocketId(socket)}`),
  );
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
    // Filter actors to only include those in areas this server handles
    const localActors = new Map();
    for (const [id, actor] of gameState.actors.entries()) {
      if (areas.has(actor.areaId)) {
        localActors.set(id, actor);
      }
    }
    
    // Build index for local actors only
    gameState.actors.index.build();
    observeTick(opt);
  },
});

logger.info(`Getting NPCs and spawns for handled areas...`);
const allNpcsAndSpawns = await npcService.getAllSpawnsAndTheirNpcs();

const characterService = createCharacterService(
  db,
  userService,
  allAreas, // Character service needs all areas for movement validation
  actorModels,
  rng,
);
const npcSpawner = new NpcSpawner(areas, actorModels, allNpcsAndSpawns, rng);

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

setupRpcTransceivers({
  wss,
  logger,
  router: areaServerRpcRouter,
  createContext: (socket) => ioc.provide(ctxClientId, getSocketId(socket)),
});

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