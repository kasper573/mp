import "dotenv-flow/config";
import path from "path";
import http from "http";
import { Logger } from "@mp/logger";
import express from "express";
import { type PathToLocalFile, type UrlToPublicFile } from "@mp/data";
import createCors from "cors";
import type { CreateContextOptions, ServerError } from "@mp/network/server";
import { Server } from "@mp/network/server";
import type { TimeSpan } from "@mp/time";
import { createAuthClient } from "@mp/auth/server";
import { createGlobalModule } from "./modules/global";
import { createModules } from "./modules/definition";
import { type ClientId, type ServerContext } from "./context";
import { loadAreas } from "./modules/area/loadAreas";
import type { WorldState } from "./modules/world/schema";
import { serialization } from "./serialization";
import { readCliOptions, type CliOptions } from "./cli";
import { createDBClient } from "./db/client";
import { loadWorldState, persistWorldState } from "./modules/world/persistence";
import { setAsyncInterval } from "./asyncInterval";
import { ClientRegistry } from "./modules/world/ClientRegistry";

async function main(opt: CliOptions) {
  const logger = new Logger(console);
  logger.info(serverTextHeader(opt));

  logger.info("Hello world");

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

  const defaultAreaId = Array.from(areas.value.keys())[0];
  const result = await loadWorldState(db);
  if (result.isErr()) {
    logger.error("Failed to load world state", result.error);
    process.exit(1);
  }

  const world = result.value;

  const expressApp = express();
  expressApp.use(createExpressLogger(logger.chain("http")));
  expressApp.use(createCors({ origin: opt.corsOrigin }));
  expressApp.use(opt.publicPath, express.static(opt.publicDir));
  if (opt.clientDir !== undefined) {
    const indexFile = path.resolve(opt.clientDir, "index.html");
    expressApp.use("/", express.static(opt.clientDir));
    expressApp.get("*", (_, res) => res.sendFile(indexFile));
  }

  const clients = new ClientRegistry();
  const modules = createModules({
    areas: areas.value,
    defaultAreaId,
    state: world,
    createUrl,
  });

  const global = createGlobalModule(modules);

  const socketServer = new Server({
    createContext: createServerContext,
    modules,
    serializeRPCResponse: serialization.rpc.serialize,
    serializeStateUpdate: serialization.stateUpdate.serialize,
    parseRPC: serialization.rpc.parse,
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
      await global.tick({ input: tickDelta, context: tickContext });

      for (const [clientId, stateUpdate] of getStateUpdates()) {
        socketServer.sendStateUpdate(clientId, stateUpdate);
      }
    } catch (error) {
      onError({ type: "tick", error, context: tickContext });
    }
  }

  async function persist() {
    const result = await persistWorldState(db, world);
    if (result.isErr()) {
      logger.error("Failed to persist world state", result.error);
    }
  }

  function* getStateUpdates() {
    const state = getClientWorldState(world);

    for (const characterId of world.characters.keys()) {
      for (const clientId of clients.getClientIds(characterId)) {
        yield [clientId, state] as const;
      }
    }
  }

  function getClientWorldState(world: WorldState): WorldState {
    return {
      characters: new Map(
        Array.from(world.characters.entries()).filter(([id]) =>
          clients.hasCharacter(id),
        ),
      ),
    };
  }

  function createServerContext({
    clientId,
    headers,
  }: CreateContextOptions<ClientId>): ServerContext {
    const who = clientId ? `client ${clientId}` : "server";
    return {
      world,
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
