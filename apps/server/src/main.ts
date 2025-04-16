import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { consoleLoggerHandler, Logger } from "@mp/logger";
import express from "express";
import createCors from "cors";
import { createAuthServer } from "@mp/auth/server";
import { createPatchStateMachine } from "@mp/sync";
import { Ticker } from "@mp/time";
import { collectDefaultMetrics, MetricsRegistry } from "@mp/telemetry/prom";
import { WebSocketServer } from "@mp/ws/server";
import { InjectionContainer } from "@mp/ioc";
import { ctxSessionId } from "@mp/game/server";
import { RateLimiter } from "@mp/rate-limiter";
import { createDBClient } from "@mp/db/server";
import { type LocalFile } from "@mp/std";
import { ctxGlobalMiddleware, ctxRpcErrorFormatter } from "@mp/game/server";
import type { GameState, SessionId } from "@mp/game/server";
import {
  ctxAreaFileUrlResolver,
  ctxAreaLookup,
  ClientRegistry,
  movementBehavior,
  npcSpawnBehavior,
  combatBehavior,
  characterRemoveBehavior,
  CharacterService,
  ctxCharacterService,
  npcAIBehavior,
  ctxNpcService,
  ctxGameStateMachine,
  deriveClientVisibility,
  NPCService,
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
import { errorFormatter } from "./etc/error-formatter";
import { rateLimiterMiddleware } from "./etc/rate-limiter-middleware";
import { serverFileToPublicUrl } from "./etc/server-file-to-public-url";
import { rootRouter } from "./router";
import { customFileTypes } from "./etc/custom-filetypes";
import { acceptRpcViaWebSockets } from "./etc/rpc-wss";
import { loadAreas } from "./etc/load-areas";
import { getSocketId } from "./etc/get-socket-id";
import { flushGameState } from "./etc/flush-game-state";

registerEncoderExtensions();

const logger = new Logger();
logger.subscribe(consoleLoggerHandler(console));
logger.info(`Server started with options`, opt);

RateLimiter.enabled = opt.rateLimit;

const clients = new ClientRegistry();
const metrics = new MetricsRegistry();
const auth = createAuthServer(opt.auth);
const db = createDBClient(opt.databaseUrl);

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
      setHeaders: (res, filePath) => {
        for (const fileType of customFileTypes) {
          if (filePath.endsWith(fileType.extension)) {
            res.setHeader("Content-Type", fileType.contentType);
            break;
          }
        }
      },
    }),
  );

const httpServer = http.createServer(webServer);

const areas = await loadAreas(path.resolve(opt.publicDir, "areas"));

const wss = new WebSocketServer({
  path: opt.wsEndpointPath,
  server: httpServer,
});

acceptRpcViaWebSockets({
  wss,
  onError: logger.error,
  router: rootRouter,
  createContext: (socket) => {
    return ioc.provide(
      ctxSessionId,
      getSocketId(socket) as unknown as SessionId,
    );
  },
});

const gameState = createPatchStateMachine<GameState>({
  initialState: { actors: {} },
  clientIds: () => wss.clients.values().map(getSocketId),
  clientVisibility: deriveClientVisibility(
    clients,
    clientViewDistance.networkFogOfWarTileCount,
    areas,
  ),
});

const npcService = new NPCService(db);
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

const characterService = new CharacterService(db, areas);

const ioc = new InjectionContainer()
  .provide(ctxGlobalMiddleware, rateLimiterMiddleware)
  .provide(ctxRpcErrorFormatter, errorFormatter)
  .provide(ctxNpcService, npcService)
  .provide(ctxCharacterService, characterService)
  .provide(ctxGameStateMachine, gameState)
  .provide(ctxAreaLookup, areas)
  .provide(ctxAreaFileUrlResolver, (id) =>
    serverFileToPublicUrl(`areas/${id}.tmj` as LocalFile),
  );

collectDefaultMetrics({ register: metrics });
collectProcessMetrics(metrics);
collectUserMetrics(metrics, clients, gameState);
collectPathFindingMetrics(metrics);

updateTicker.subscribe(npcAIBehavior(gameState, areas));
updateTicker.subscribe(movementBehavior(gameState, areas));
updateTicker.subscribe(npcSpawnBehavior(gameState, npcService, areas));
updateTicker.subscribe(combatBehavior(gameState));
updateTicker.subscribe(() => flushGameState(gameState, wss.clients));
characterRemoveBehavior(clients, gameState, logger, 5000);

clients.on(({ type, clientId, userId }) =>
  logger.info(`[ClientRegistry][${type}]`, { clientId, userId }),
);

httpServer.listen(opt.port, opt.hostname, () => {
  logger.info(`Server listening on ${opt.hostname}:${opt.port}`);
});

persistTicker.start();
updateTicker.start();
