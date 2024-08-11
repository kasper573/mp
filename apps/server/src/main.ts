import "./polyfill";
import path from "path";
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
  const publicPath = "/public/";
  const publicDir = path.resolve(__dirname, "../public");
  const areas = await loadAreas(path.resolve(publicDir, "areas"), createUrl);
  const defaultAreaId = areas.keys().next().value;
  const world: WorldState = { characters: new Map() };

  const logger = new Logger(console);
  const httpLogger = logger.chain("http");
  const wsLogger = logger.chain("ws");

  logger.info("starting server with env", args);

  const global = createGlobalModule();
  const httpServer = express();
  httpServer.use(createExpressLogger(httpLogger));
  httpServer.use(createCors({ origin: args.httpCorsOrigin }));
  httpServer.use(publicPath, express.static(publicDir));
  if (args.clientDistPath !== undefined) {
    httpServer.use("/", express.static(args.clientDistPath));
  }

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

  socketServer.listen(args.wsPort);
  wsLogger.info("listening on port", args.wsPort);

  httpServer.listen(args.httpPort, args.httpListenHostname, () => {
    httpLogger.info(
      "listening on",
      `${args.httpListenHostname}:${args.httpPort}`,
    );
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
    const port = args.httpPort === 80 ? "" : `:${args.httpPort}`;
    const relativePath = path.isAbsolute(fileInPublicDir)
      ? path.relative(publicDir, fileInPublicDir)
      : fileInPublicDir;
    return `//${args.httpPublicHostname}${port}${publicPath}${relativePath}` as UrlToPublicFile;
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

main(readCliArgs());
