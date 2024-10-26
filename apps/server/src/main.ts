#!/usr/bin/env node

import "dotenv-flow/config";
import path from "node:path";
import http from "node:http";
import { Logger } from "@mp/logger";
import express from "express";
import { type PathToLocalFile, type UrlToPublicFile } from "@mp/data";
import createCors from "cors";
import type { CreateContextOptions, ServerError } from "@mp/network/server";
import { Server } from "@mp/network/server";
import type { TimeSpan } from "@mp/time";
import { createAuthClient } from "@mp/auth/server";
import { createServerCRDT } from "@mp/transformer";
import { createGlobalModule } from "./modules/global";
import { createModules } from "./modules/definition";
import { type ClientId, type ServerContext } from "./context";
import { loadAreas } from "./modules/area/loadAreas";
import { readCliOptions, type CliOptions } from "./cli";
import { createDBClient } from "./db/client";
import { loadWorldState, persistWorldState } from "./modules/world/persistence";
import { setAsyncInterval } from "./asyncInterval";
import { ClientRegistry } from "./modules/world/ClientRegistry";
import type { WorldState } from "./package";
import { rpcSerializer } from "./serialization";

async function main(opt: CliOptions) {
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

  const worldState = createServerCRDT<WorldState, ClientId>(
    initialWorldState.value,
  );

  const clients = new ClientRegistry();
  const modules = createModules({
    areas: areas.value,
    defaultAreaId,
    state: worldState.access,
    createUrl,
    buildVersion: opt.buildVersion,
  });

  const global = createGlobalModule(modules);

  const socketServer = new Server({
    createContext: createServerContext,
    modules,
    serializeRPCResponse: rpcSerializer.serialize,
    parseRPC: rpcSerializer.parse,
    onConnection: (input, context) => global.connect({ input, context }),
    onDisconnect: (input, context) => global.disconnect({ input, context }),
    onError,
  });

  const httpServer = http.createServer(expressApp);
  socketServer.listen(httpServer);
  httpServer.listen(opt.port, opt.listenHostname, () => {
    logger.info(`Server listening on ${opt.listenHostname}:${opt.port}`);
  });

  setAsyncInterval(tick, opt.tickInterval);
  setAsyncInterval(persist, opt.persistInterval);

  const tickContext: ServerContext = createServerContext({
    clientId: undefined as unknown as ClientId,
  });

  async function tick(tickDelta: TimeSpan) {
    try {
      worldState.access((state) => {
        state.serverTick = tickDelta.totalMilliseconds;
      });

      await global.tick({ input: tickDelta, context: tickContext });

      for (const [clientId, stateUpdate] of worldState.flush(
        clients.getClientIds(),
      )) {
        socketServer.sendStateUpdate(clientId, stateUpdate);
      }
    } catch (error) {
      onError({ type: "tick", error, context: tickContext });
    }
  }

  async function persist() {
    const state = worldState.access((state) => state);
    const result = await persistWorldState(db, state as WorldState);
    if (result.isErr()) {
      logger.error("Failed to persist world state", result.error);
    }
  }

  function createServerContext({
    clientId,
    headers,
  }: CreateContextOptions<ClientId>): ServerContext {
    const who = clientId ? `client ${clientId}` : "server";
    return {
      accessWorldState: worldState.access,
      headers,
      clientId,
      auth,
      logger: logger.chain(who),
      clients,
    };
  }

  function onError({
    type,
    rpc,
    error,
    context,
  }: ServerError<ServerContext, string>) {
    const args: unknown[] = [
      context?.clientId,
      rpc ? `${rpc.moduleName}.${rpc.procedureName}` : undefined,
      rpc ? rpc.input : undefined,
      error,
    ].filter(Boolean);
    logger.chain(type).error(...args);
  }

  function createUrl(fileInPublicDir: PathToLocalFile): UrlToPublicFile {
    const relativePath = path.isAbsolute(fileInPublicDir)
      ? path.relative(opt.publicDir, fileInPublicDir)
      : fileInPublicDir;
    return `//${opt.hostname}${opt.publicPath}${relativePath}` as UrlToPublicFile;
  }
}

function createExpressLogger(logger: Logger): express.RequestHandler {
  return (req, _, next) => {
    logger.info(req.method, req.url);
    next();
  };
}

function serverTextHeader(options: CliOptions) {
  return `
=====================================================
#                                                   #
#                ███╗   ███╗ ██████╗                #
#                ████╗ ████║ ██╔══██╗               #
#                ██╔████╔██║ ██████╔╝               #
#                ██║╚██╔╝██║ ██╔═══╝                #
#                ██║ ╚═╝ ██║ ██║                    #
#                ╚═╝     ╚═╝ ╚═╝                    #
=====================================================
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
