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
import { env } from "./env";
import { createGlobalModule } from "./modules/global";
import { createModules } from "./modules/definition";
import type {
  CharacterId,
  ClientContext,
  ClientId,
  ClientStateUpdate,
  ServerContext,
  ServerModules,
  WorldState,
} from "./package";
import { loadAreas } from "./modules/area/loadAreas";
import { serialization } from "./serialization";

async function main() {
  const publicPath = "/public/";
  const publicDir = path.resolve(__dirname, "../public");
  const areas = await loadAreas(path.resolve(publicDir, "areas"), createUrl);
  const defaultAreaId = areas.keys().next().value;
  const world: WorldState = { characters: new Map() };

  const logger = new Logger(console);
  const global = createGlobalModule();
  const httpServer = express();
  httpServer.use(createCors());
  httpServer.use(publicPath, express.static(publicDir, {}));

  const modules = createModules({
    global,
    areas,
    defaultAreaId,
    state: world,
    logger,
    createUrl,
  });

  const socketServer = new Server<
    ServerModules,
    ServerContext,
    ClientContext,
    ClientStateUpdate,
    ClientId
  >({
    createContext,
    modules,
    serializeRPCOutput: serialization.rpc.serialize,
    serializeStateUpdate: serialization.stateUpdate.serialize,
    parseRPC: serialization.rpc.parse,
    onConnection: (input, context) => global.connect({ input, context }),
    onDisconnect: (input, context) => global.disconnect({ input, context }),
    onError,
  });

  socketServer.listen(env.wsPort);
  httpServer.listen(env.httpPort);
  setInterval(tick, env.tickInterval);

  let lastTick = performance.now();

  const tickContext: ServerContext = {
    clientId: "server-tick" as ClientId,
    characterId: "server-tick-has-no-character" as CharacterId,
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

  function createContext({
    clientId,
  }: CreateContextOptions<ClientId>): ServerContext {
    return {
      world,
      clientId,
      characterId: getCharacterIdByClientId(clientId),
    };
  }

  function onError(e: unknown, type: string, message?: unknown) {
    logger.chain(type).error(...(message ? [message, e] : [e]));
  }

  function createUrl(fileInPublicDir: PathToLocalFile): UrlToPublicFile {
    const port = env.httpPort === 80 ? "" : `:${env.httpPort}`;
    const relativePath = path.isAbsolute(fileInPublicDir)
      ? path.relative(publicDir, fileInPublicDir)
      : fileInPublicDir;
    return `http://${env.host}${port}${publicPath}${relativePath}` as UrlToPublicFile;
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

main();
