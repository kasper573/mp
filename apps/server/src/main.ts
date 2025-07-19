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
  ctxRng,
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
import { opt } from "./options";
import { rateLimiterMiddleware } from "./etc/rate-limiter-middleware";
import { serverFileToPublicUrl } from "./etc/server-file-to-public-url";
import { serverRpcRouter } from "./rpc";
import { setupRpcTransceivers } from "./etc/rpc-wss";
import { loadAreas } from "./etc/load-areas";
import { getSocketId } from "./etc/get-socket-id";
import { createGameStateFlusher } from "./etc/flush-game-state";
import { loadActorModels } from "./etc/load-actor-models";
import { playerRoles } from "./roles";
import { createNpcService } from "./db/services/npc-service";
import { createDbClient } from "./db/client";
import { createCharacterService } from "./db/services/character-service";
import { createUserService } from "./db/services/user-service";
import { createGameStateService } from "./db/services/game-service";
import { createTickMetricsObserver } from "./metrics/tick";
import { createPinoLogger } from "@mp/logger/pino";

// Note that this file is an entrypoint and should not have any exports

registerEncoderExtensions();

const rng = new Rng(opt.rngSeed);
const logger = createPinoLogger(opt.prettyLogs);
logger.info(opt, `Starting server...`);

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
const [areas, actorModels] = await Promise.all([
  loadAreas(path.resolve(opt.publicDir, "areas")),
  loadActorModels(opt.publicDir),
]);

logger.info(`Seeding database...`);
await seed(db, areas, actorModels);

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
  router: serverRpcRouter,
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
  onError: (error) => logger.error(error, "Persist Ticker Error"),
  middleware: () => gameService.persist(gameState),
});

const observeTick = createTickMetricsObserver(metrics);

const updateTicker = new Ticker({
  onError: (error) => logger.error(error, "Update Ticker Error"),
  middleware(opt) {
    // Build an index of commonly accessed entities before each tick.
    // This lets us to easily get some nice performance improvements for for simple lookups.
    // Should only be used for values that don't require more precision than the state of the last tick.
    gameState.actors.index.build();
    observeTick(opt);
  },
});

logger.info(`Getting all NPCs and spawns...`);
const allNpcsAndSpawns = await npcService.getAllSpawnsAndTheirNpcs();

const characterService = createCharacterService(
  db,
  userService,
  areas,
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
