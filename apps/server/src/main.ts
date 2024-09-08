import path from "path";
import http from "http";
import { Logger } from "@mp/logger";
import express from "express";
import { type PathToLocalFile, type UrlToPublicFile } from "@mp/state";
import createCors from "cors";
import type { CreateContextOptions, ServerError } from "@mp/network/server";
import { Server } from "@mp/network/server";
import type { TimeSpan } from "@mp/time";
import { createGlobalModule } from "./modules/global";
import { createModules } from "./modules/definition";
import {
  ServerContextSource,
  type ClientId,
  type ServerContext,
} from "./context";
import { loadAreas } from "./modules/area/loadAreas";
import type { CharacterId, WorldState } from "./modules/world/schema";
import { serialization } from "./serialization";
import { readCliOptions, type CliOptions } from "./cli";
import { createDBClient } from "./db/client";
import { loadWorldState, persistWorldState } from "./modules/world/persistence";
import { setAsyncInterval } from "./asyncInterval";

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

  const defaultAreaId = Array.from(areas.value.keys())[0];
  const world = await loadWorldState(db);

  const expressApp = express();
  expressApp.use(createExpressLogger(logger.chain("http")));
  expressApp.use(createCors({ origin: opt.corsOrigin }));
  expressApp.use(opt.publicPath, express.static(opt.publicDir));
  if (opt.clientDir !== undefined) {
    const indexFile = path.resolve(opt.clientDir, "index.html");
    expressApp.use("/", express.static(opt.clientDir));
    expressApp.get("*", (_, res) => res.sendFile(indexFile));
  }

  const modules = createModules({
    areas: areas.value,
    defaultAreaId,
    state: world,
    logger: logger.chain("module"),
    createUrl,
  });

  const global = createGlobalModule(modules);

  const characterConnections = new Map<CharacterId, Set<ClientId>>();

  const socketServer = new Server({
    createContext: createServerContext,
    modules,
    serializeRPCResponse: serialization.rpc.serialize,
    serializeStateUpdate: serialization.stateUpdate.serialize,
    parseRPC: serialization.rpc.parse,
    parseAuth: (auth) => ("token" in auth ? { token: auth.token } : undefined),
    async onConnection(input, context) {
      const { characterId, clientId } = context.source.unwrap("client");
      let clientIdsForCharacter = characterConnections.get(characterId);
      if (!clientIdsForCharacter) {
        clientIdsForCharacter = new Set();
        characterConnections.set(characterId, clientIdsForCharacter);
      }
      clientIdsForCharacter.add(clientId);
      await global.connect({ input, context });
    },
    async onDisconnect(input, context) {
      const { characterId, clientId } = context.source.unwrap("client");
      await global.disconnect({ input, context });
      const clientIdsForCharacter = characterConnections.get(characterId);
      if (clientIdsForCharacter) {
        clientIdsForCharacter.delete(clientId);
        if (clientIdsForCharacter.size === 0) {
          characterConnections.delete(characterId);
        }
      }
    },
    onError,
  });

  const httpServer = http.createServer(expressApp);
  socketServer.listen(httpServer);
  httpServer.listen(opt.port, opt.listenHostname, () => {
    logger.info(`Server listening on ${opt.listenHostname}:${opt.port}`);
  });

  setAsyncInterval(tick, opt.tickInterval);
  setAsyncInterval(persist, opt.persistInterval);

  const tickContext: ServerContext = {
    source: new ServerContextSource({ type: "server" }),
    world,
  };

  async function tick(tickDelta: TimeSpan) {
    try {
      // TODO ticks should be synchronous
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
    if (!result.ok) {
      logger.error("Failed to persist world state", result.error);
    }
  }

  function* getStateUpdates() {
    const state = getClientWorldState(world);

    // TODO optimize by sending changes only
    for (const id of world.characters.keys()) {
      const clientIds = characterConnections.get(id);
      if (clientIds) {
        for (const id of clientIds) {
          yield [id, state] as const;
        }
      } else {
        // TODO collect metrics
      }
    }
  }

  function getClientWorldState(world: WorldState): WorldState {
    return {
      characters: new Map(
        Array.from(world.characters.entries()).filter(([id]) =>
          characterConnections.has(id),
        ),
      ),
    };
  }

  function createServerContext({
    clientId,
    auth,
  }: CreateContextOptions<ClientId>): ServerContext {
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

  function onError({
    type,
    rpc,
    error,
    context,
  }: ServerError<ServerContext, string>) {
    const id =
      context?.source.payload.type === "client"
        ? context.source.payload.clientId
        : "server invocation";
    const args: unknown[] = [id, rpc, error].filter(Boolean);
    logger.chain(type).error(...args);
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
  .map(([k, v]) => `- ${k}: ${String(v)}`)
  .join("\n")}
=====================================================`;
}

void main(readCliOptions());
