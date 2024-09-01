import "./polyfill";
import path from "path";
import http from "http";
import { Logger } from "@mp/logger";
import express from "express";
import {
  TimeSpan,
  type PathToLocalFile,
  type UrlToPublicFile,
} from "@mp/state";
import createCors from "cors";
import type { CreateContextOptions } from "@mp/network/server";
import { Server } from "@mp/network/server";
import { createGlobalModule } from "./modules/global";
import { createModules } from "./modules/definition";
import {
  ServerContextSource,
  type ClientId,
  type ServerContext,
} from "./context";
import { loadAreas } from "./modules/area/loadAreas";
import type { CharacterId } from "./modules/world/schema";
import type { WorldState } from "./modules/world/schema";
import { serialization } from "./serialization";
import { readCliOptions, type CliOptions } from "./cli";
import { createDBClient } from "./db/client";
import { createDBSync } from "./db/sync";

async function main(opt: CliOptions) {
  const logger = new Logger(console);
  logger.info(serverTextHeader(opt));

  const db = createDBClient(opt.databaseUrl);
  const persistence = createDBSync({
    db,
    logger,
    interval: opt.persistInterval,
    getSnapshot: () => world,
  });

  const areas = await loadAreas(path.resolve(opt.publicDir, "areas"));

  if (areas.isErr() || areas.value.size === 0) {
    logger.error(
      "Cannot start server without areas",
      areas.isErr() ? areas.error : "No areas found",
    );
    process.exit(1);
  }

  const defaultAreaId = areas.value.keys().next().value;
  const world: WorldState = { characters: new Map() };

  const global = createGlobalModule();
  const expressApp = express();
  expressApp.use(createExpressLogger(logger.chain("http")));
  expressApp.use(createCors({ origin: opt.corsOrigin }));
  expressApp.use(opt.publicPath, express.static(opt.publicDir));
  if (opt.clientDir !== undefined) {
    expressApp.use("/", express.static(opt.clientDir));
  }

  const modules = createModules({
    global,
    areas: areas.value,
    defaultAreaId,
    state: world,
    logger: logger.chain("module"),
    createUrl,
  });

  const socketServer = new Server({
    createContext: createClientContext,
    modules,
    serializeRPCOutput: serialization.rpc.serialize,
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

  setInterval(tick, opt.tickInterval);
  persistence.start();

  let lastTick = performance.now();

  const tickContext: ServerContext = {
    source: new ServerContextSource({ type: "server" }),
    world,
  };

  function tick() {
    try {
      const thisTick = performance.now();
      const tickDelta = TimeSpan.fromMilliseconds(thisTick - lastTick);
      lastTick = thisTick;

      global.tick({ input: tickDelta, context: tickContext });

      for (const [clientId, stateUpdate] of getStateUpdates()) {
        socketServer.sendStateUpdate(clientId, stateUpdate);
      }
    } catch (error) {
      onError(error, "tick");
    }
  }

  function* getStateUpdates() {
    // TODO optimize by sending changes only
    for (const id of world.characters.keys()) {
      yield [getClientIdByCharacterId(id), world] as const;
    }
  }

  function createClientContext({
    clientId,
  }: CreateContextOptions<ClientId>): ServerContext {
    return {
      world,
      source: new ServerContextSource({
        type: "client",
        clientId,
        characterId: getCharacterIdByClientId(clientId),
      }),
    };
  }

  function onError(e: unknown, type: string, message?: unknown) {
    logger.chain(type).error(...(message ? [message, e] : [e]));
  }

  function createUrl(fileInPublicDir: PathToLocalFile): UrlToPublicFile {
    const relativePath = path.isAbsolute(fileInPublicDir)
      ? path.relative(opt.publicDir, fileInPublicDir)
      : fileInPublicDir;
    return `//${opt.hostname}${opt.publicPath}${relativePath}` as UrlToPublicFile;
  }

  function getCharacterIdByClientId(clientId: ClientId): CharacterId {
    // TODO implement
    return clientId as unknown as CharacterId;
  }

  function getClientIdByCharacterId(characterId: CharacterId): ClientId {
    // TODO implement
    return characterId as unknown as ClientId;
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
${Object.entries(options)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}
=====================================================`;
}

main(readCliOptions());
