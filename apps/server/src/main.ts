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
import { serialization } from "./serialization";
import { readCliOptions, type CliOptions } from "./cli";
import { createDBClient } from "./db/client";
import { loadWorldState, persistWorldState } from "./modules/world/persistence";

async function main(opt: CliOptions) {
  const logger = new Logger(console);
  logger.info(serverTextHeader(opt));

  const db = createDBClient(opt.databaseUrl);

  const areas = await loadAreas(path.resolve(opt.publicDir, "areas"));

  if (areas.isErr() || areas.value.size === 0) {
    logger.error(
      "Cannot start server without areas",
      areas.isErr() ? areas.error : "No areas found",
    );
    process.exit(1);
  }

  const defaultAreaId = areas.value.keys().next().value;
  const world = await loadWorldState(db);

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
    createContext: createServerContext,
    modules,
    serializeRPCOutput: serialization.rpc.serialize,
    serializeStateUpdate: serialization.stateUpdate.serialize,
    parseRPC: serialization.rpc.parse,
    parseAuth: (auth) => ("token" in auth ? { token: auth.token } : undefined),
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
  setTimeout(persist, opt.persistInterval);

  global.connect.subscribe(({ context }) => {
    const { characterId, clientId } = context.source.unwrap("client");
    connectedClients.set(characterId, clientId);
    logger.info("Client connected", { clientId, characterId });
  });

  global.disconnect.subscribe(({ context }) => {
    const { characterId } = context.source.unwrap("client");
    connectedClients.delete(characterId);
    logger.info("Client disconnected", { characterId });
  });

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

  async function persist() {
    const result = await persistWorldState(db, world);
    if (!result.ok) {
      logger.error("Failed to persist world state", result.error);
    }
    setTimeout(persist, opt.persistInterval);
  }

  function* getStateUpdates() {
    // TODO optimize by sending changes only
    for (const id of world.characters.keys()) {
      const clientId = connectedClients.get(id);
      if (clientId) {
        yield [clientId, world] as const;
      } else {
        // TODO collect metrics
      }
    }
  }

  async function createServerContext({
    clientId,
    auth,
  }: CreateContextOptions<ClientId>): Promise<ServerContext> {
    if (!auth) {
      throw new Error(`Client ${clientId} is not authenticated`);
    }
    return {
      world,
      source: new ServerContextSource({
        type: "client",
        clientId,
        characterId: getCharacterIdByAuthToken(auth.token),
      }),
    };
  }

  const connectedClients = new Map<CharacterId, ClientId>();

  function onError(e: unknown, type: string, message?: unknown) {
    logger.chain(type).error(...(message ? [message, e] : [e]));
  }

  function createUrl(fileInPublicDir: PathToLocalFile): UrlToPublicFile {
    const relativePath = path.isAbsolute(fileInPublicDir)
      ? path.relative(opt.publicDir, fileInPublicDir)
      : fileInPublicDir;
    return `//${opt.hostname}${opt.publicPath}${relativePath}` as UrlToPublicFile;
  }

  function getCharacterIdByAuthToken(authToken: string): CharacterId {
    // TODO implement
    return authToken as CharacterId;
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

interface CharacterSession {
  characterId: CharacterId;
  clientId: ClientId;
}
