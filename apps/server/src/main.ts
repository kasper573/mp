#!/usr/bin/env node

import "dotenv-flow/config";
import path from "node:path";
import http from "node:http";
import { Logger } from "@mp/logger";
import express from "express";
import { type PathToLocalFile, type UrlToPublicFile } from "@mp/data";
import createCors from "cors";
import { createAuthClient } from "@mp/auth/server";
import * as trpcExpress from "@trpc/server/adapters/express";
import { SyncServer } from "@mp/sync/server";
import type { WorldState } from "./modules/world/schema";
import type { AuthToken, HttpSessionId } from "./context";
import { type ClientId, type ServerContext } from "./context";
import { loadAreas } from "./modules/area/loadAreas";
import { readCliOptions, type CliOptions } from "./cli";
import { createDBClient } from "./db/client";
import { loadWorldState, persistWorldState } from "./modules/world/persistence";
import { ClientRegistry } from "./modules/world/ClientRegistry";
import { createRootRouter } from "./modules/router";
import { createDynamicDeltaFn, Ticker } from "./Ticker";
import { tokenHeaderName } from "./tokenHeaderName";

async function main(opt: CliOptions) {
  const delta = createDynamicDeltaFn(() => performance.now());
  const logger = new Logger(console);
  logger.info(serverTextHeader(opt));

  const auth = createAuthClient({ secretKey: opt.authSecretKey });
  const db = createDBClient(opt.databaseUrl);
  const areas = await loadAreas(path.resolve(opt.publicDir, "areas"));

  if (areas.isErr() || areas.value.size === 0) {
    logger.error(
      "Cannot start server without areas",
      areas.isErr() ? areas.error : "No areas found",
    );
    process.exit(1);
  }

  const defaultAreaId = [...areas.value.keys()][0];
  const initialWorldState = await loadWorldState(db);
  if (initialWorldState.isErr()) {
    logger.error("Failed to load world state", initialWorldState.error);
    process.exit(1);
  }

  const expressApp = express();

  expressApp.use(createExpressLogger(logger.chain("http")));
  expressApp.use(createCors({ origin: opt.corsOrigin }));
  expressApp.use(opt.publicPath, express.static(opt.publicDir));

  if (opt.clientDir !== undefined) {
    const indexFile = path.resolve(opt.clientDir, "index.html");
    expressApp.use("/", express.static(opt.clientDir));
    expressApp.get("*", (_, res) => res.sendFile(indexFile));
  }

  const httpServer = http.createServer(expressApp);

  httpServer.listen(opt.port, opt.listenHostname, () => {
    logger.info(`Server listening on ${opt.listenHostname}:${opt.port}`);
  });

  const worldState = new SyncServer<WorldState>({
    initialState: initialWorldState.value,
    filterState: deriveWorldStateForClient,
    httpServer,
    patchCallback: opt.logSyncPatches
      ? (patches) => logger.chain("sync").info(patches)
      : undefined,
    onConnection(clientId) {
      logger.info("Client connected", clientId);
    },
    onDisconnect(clientId) {
      logger.info("Client disconnected", clientId);
      clients.deleteClient(clientId);
    },
  });

  const persistTicker = new Ticker({
    delta,
    middleware: persist,
    interval: opt.persistInterval,
  });

  const ticker = new Ticker({
    interval: opt.tickInterval,
    delta,
  });

  const apiRouter = createRootRouter({
    areas: areas.value,
    defaultAreaId,
    state: worldState.access,
    createUrl,
    buildVersion: opt.buildVersion,
    ticker,
    doesCurrentRequestHaveAccessToClient,
  });

  expressApp.use(
    "/api",
    trpcExpress.createExpressMiddleware({
      router: apiRouter,
      createContext: ({ req }) =>
        createServerContext(
          `${req.ip}-${req.headers["user-agent"]}` as HttpSessionId,
          req.headers[tokenHeaderName] as AuthToken,
        ),
    }),
  );

  const clients = new ClientRegistry();

  persistTicker.start();
  ticker.start();

  async function persist() {
    const state = worldState.access("persist", (state) => state);
    const result = await persistWorldState(db, state);
    if (result.isErr()) {
      logger.error("Failed to persist world state", result.error);
    }
  }

  function deriveWorldStateForClient(state: WorldState, clientId: ClientId) {
    const characterId = clients.getCharacterId(clientId);
    if (!characterId) {
      throw new Error(
        "Could not derive world state for client: client has no associated character",
      );
    }

    // TODO use character id to derive state for client

    return state;
  }

  function createServerContext(
    sessionId: HttpSessionId,
    authToken: ServerContext["authToken"],
  ): ServerContext {
    return {
      sessionId,
      accessWorldState: worldState.access,
      authToken,
      auth,
      logger,
      clients,
    };
  }

  function createUrl(fileInPublicDir: PathToLocalFile): UrlToPublicFile {
    const relativePath = path.isAbsolute(fileInPublicDir)
      ? path.relative(opt.publicDir, fileInPublicDir)
      : fileInPublicDir;
    return `//${opt.hostname}${opt.publicPath}${relativePath}` as UrlToPublicFile;
  }
}

function doesCurrentRequestHaveAccessToClient(clientId: ClientId) {
  // TODO implement
  return true;
}

function createExpressLogger(logger: Logger): express.RequestHandler {
  return (req, _, next) => {
    logger.info(req.method, req.url);
    next();
  };
}

function serverTextHeader(options: CliOptions) {
  return `
===============================
#                             #
#     ███╗   ███╗ ██████╗     #
#     ████╗ ████║ ██╔══██╗    #
#     ██╔████╔██║ ██████╔╝    #
#     ██║╚██╔╝██║ ██╔═══╝     #
#     ██║ ╚═╝ ██║ ██║         #
#     ╚═╝     ╚═╝ ╚═╝         #
===============================
buildVersion: ${options.buildVersion}
hostname: ${options.hostname}
listenHostname: ${options.listenHostname}
authSecretKey: ${options.authSecretKey ? "set" : "not set"}
databaseUrl: ${options.databaseUrl}
port: ${options.port}
publicDir: ${options.publicDir}
clientDir: ${options.clientDir}
corsOrigin: ${options.corsOrigin}
Tick interval: ${options.tickInterval.totalMilliseconds}ms
Persist interval: ${options.persistInterval.totalMilliseconds}ms
=====================================================`;
}

void main(readCliOptions());
