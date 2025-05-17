import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { consoleLoggerHandler, Logger } from "@mp/logger";
import express from "express";
import createCors from "cors";
import { createTokenVerifier } from "@mp/auth/server";
import { createSyncStateMachine } from "@mp/sync";
import { Ticker } from "@mp/time";
import { collectDefaultMetrics, MetricsRegistry } from "@mp/telemetry/prom";
import { WebSocketServer } from "@mp/ws/server";
import { InjectionContainer } from "@mp/ioc";
import {
  ctxActorModelLookup,
  ctxClientId,
  ctxClientRegistry,
  ctxTokenVerifier,
  gameStatePatchOptimizers,
  NpcAi,
  NpcSpawner,
} from "@mp/game/server";
import { RateLimiter } from "@mp/rate-limiter";
import { createDbClient } from "@mp/db/server";
import { type LocalFile } from "@mp/std";
import { ctxGlobalMiddleware } from "@mp/game/server";
import type { GameStateMachine } from "@mp/game/server";
import {
  ctxAreaFileUrlResolver,
  ctxAreaLookup,
  ClientRegistry,
  movementBehavior,
  combatBehavior,
  characterRemoveBehavior,
  CharacterService,
  ctxCharacterService,
  ctxNpcService,
  ctxGameStateMachine,
  deriveClientVisibility,
  NpcService,
  GameService,
} from "@mp/game/server";
import { registerEncoderExtensions } from "@mp/game/server";
import { clientViewDistance } from "@mp/game/server";

import { collectProcessMetrics } from "./metrics/process";
import { metricsMiddleware } from "./express/metrics-middleware";
import { collectUserMetrics } from "./metrics/user";
import { createTickMetricsObserver } from "./metrics/tick";
import { createExpressLogger } from "./express/logger";
import { collectPathFindingMetrics } from "./metrics/path-finding";
import { opt } from "./options";
import { rateLimiterMiddleware } from "./etc/rate-limiter-middleware";
import { serverFileToPublicUrl } from "./etc/server-file-to-public-url";
import { serverRpcRouter } from "./rpc";
import { setupRpcTransceivers } from "./etc/rpc-wss";
import { loadAreas } from "./etc/load-areas";
import { getSocketId } from "./etc/get-socket-id";
import { createGameStateFlusher } from "./etc/flush-game-state";
import { loadActorModels } from "./etc/load-actor-models";

registerEncoderExtensions();

const logger = new Logger();
logger.subscribe(consoleLoggerHandler(console));
logger.info(`Server started with options`, opt);

RateLimiter.enabled = opt.rateLimit;

const clients = new ClientRegistry();
const metrics = new MetricsRegistry();
const tokenVerifier = createTokenVerifier(opt.auth);
const db = createDbClient(opt.databaseUrl);

db.$client.on("error", logger.error);

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

const [areas, actorModels] = await Promise.all([
  loadAreas(path.resolve(opt.publicDir, "areas")),
  loadActorModels(opt.publicDir),
]);

const wss = new WebSocketServer({
  path: opt.wsEndpointPath,
  server: httpServer,
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

wss.on("connection", (socket) => {
  socket.on("close", () => clients.remove(getSocketId(socket)));
});

const rpcTransceivers = setupRpcTransceivers({
  wss,
  logger,
  router: serverRpcRouter,
  createContext: (socket) => ioc.provide(ctxClientId, getSocketId(socket)),
});

const gameState: GameStateMachine = createSyncStateMachine({
  initialState: { actors: {} },
  patchOptimizers: gameStatePatchOptimizers,
  clientIds: () => wss.clients.values().map(getSocketId),
  clientVisibility: deriveClientVisibility(
    clients,
    clientViewDistance.networkFogOfWarTileCount,
    areas,
  ),
});

const npcService = new NpcService(db);
const gameService = new GameService(db);

const persistTicker = new Ticker({
  onError: logger.error,
  interval: opt.persistInterval,
  middleware: () => gameService.persist(gameState),
});

const updateTicker = new Ticker({
  onError: logger.error,
  interval: opt.tickInterval,
  middleware: createTickMetricsObserver(metrics),
});

const characterService = new CharacterService(db, areas, actorModels);

const ioc = new InjectionContainer()
  .provide(ctxGlobalMiddleware, rateLimiterMiddleware)
  .provide(ctxNpcService, npcService)
  .provide(ctxCharacterService, characterService)
  .provide(ctxGameStateMachine, gameState)
  .provide(ctxAreaLookup, areas)
  .provide(ctxTokenVerifier, tokenVerifier)
  .provide(ctxClientRegistry, clients)
  .provide(ctxAreaFileUrlResolver, (id) =>
    serverFileToPublicUrl(`areas/${id}.json` as LocalFile),
  )
  .provide(ctxActorModelLookup, actorModels);

collectDefaultMetrics({ register: metrics });
collectProcessMetrics(metrics);
collectUserMetrics(metrics, clients, gameState);
collectPathFindingMetrics(metrics);

const npcSpawner = new NpcSpawner(areas, actorModels);
const npcAi = new NpcAi(gameState, areas);

updateTicker.subscribe(npcAi.createTickHandler());
updateTicker.subscribe(movementBehavior(gameState, areas));
updateTicker.subscribe(npcSpawner.createTickHandler(gameState, npcService));
updateTicker.subscribe(combatBehavior(gameState, areas));
updateTicker.subscribe(createGameStateFlusher(gameState, wss.clients, metrics));
characterRemoveBehavior(clients, gameState, logger, 5000);

clients.on(({ type, clientId, user }) =>
  logger.info(`[ClientRegistry][${type}]`, { clientId, userId: user.id }),
);

httpServer.listen(opt.port, opt.hostname, () => {
  logger.info(`Server listening on ${opt.hostname}:${opt.port}`);
});

persistTicker.start();
updateTicker.start();
