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
  type ClientContext,
  type ClientId,
  type ClientStateUpdate,
  type ServerContext,
} from "./context";
import { loadAreas } from "./modules/area/loadAreas";
import type { CharacterId } from "./modules/world/schema";
import type { ServerModules } from "./modules/definition";
import type { WorldState } from "./modules/world/schema";
import { serialization } from "./serialization";
import { readCliArgs, type CliArgs } from "./cli";

async function main(args: CliArgs) {
  const logger = new Logger(console);
  logger.info("starting server with env", args);

  const areas = await loadAreas(
    path.resolve(args.publicDir, "areas"),
    createUrl,
  ).then((res) => res.assert(panic));

  const defaultAreaId = areas.keys().next().value;
  const world: WorldState = { characters: new Map() };

  const httpLogger = logger.chain("http");
  const wsLogger = logger.chain("ws");

  const global = createGlobalModule();
  const expressApp = express();
  expressApp.use(createExpressLogger(httpLogger));
  expressApp.use(createCors({ origin: args.corsOrigin }));
  expressApp.use(args.publicPath, express.static(args.publicDir));
  if (args.clientPath !== undefined) {
    expressApp.use("/", express.static(args.clientPath));
  }

  const httpServer = http.createServer(expressApp);

  const modules = createModules({
    global,
    areas,
    defaultAreaId,
    state: world,
    logger: wsLogger,
    createUrl,
  });

  const socketServer = new Server<
    ServerModules,
    ServerContext,
    ClientContext,
    ClientStateUpdate,
    ClientId
  >({
    createContext: createClientContext,
    modules,
    serializeRPCOutput: serialization.rpc.serialize,
    serializeStateUpdate: serialization.stateUpdate.serialize,
    parseRPC: serialization.rpc.parse,
    onConnection: (input, context) => global.connect({ input, context }),
    onDisconnect: (input, context) => global.disconnect({ input, context }),
    onError,
  });

  socketServer.listen(httpServer);

  httpServer.listen(args.port, "0.0.0.0", () => {
    logger.info("server listening on", `0.0.0.0:${args.port}`);
  });

  setInterval(tick, args.tickInterval);

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
      ? path.relative(args.publicDir, fileInPublicDir)
      : fileInPublicDir;
    return `//${args.hostname}${args.publicPath}${relativePath}` as UrlToPublicFile;
  }

  function getCharacterIdByClientId(clientId: ClientId): CharacterId {
    // TODO implement
    return clientId as unknown as CharacterId;
  }

  function getClientIdByCharacterId(characterId: CharacterId): ClientId {
    // TODO implement
    return characterId as unknown as ClientId;
  }

  function panic(error: unknown) {
    logger.error("panic", error);
    process.exit(1);
  }
}

function createExpressLogger(logger: Logger): express.RequestHandler {
  return (req, _, next) => {
    logger.info(req.method, req.url);
    next();
  };
}

main(readCliArgs());
