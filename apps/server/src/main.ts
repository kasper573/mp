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
import { Server } from "@mp/network/server";
import { env } from "./env";
import { createConnectionModule } from "./modules/connection";
import { createModules } from "./modules/definition";
import type { CharacterId, WorldState } from "./package";
import { loadAreas } from "./modules/world/loadAreas";
import { transformers } from "./transformers";

async function main() {
  // Data, state and configuration
  const publicPath = "/public/";
  const publicDir = path.resolve(__dirname, "../public");
  const areas = await loadAreas(path.resolve(publicDir, "areas"), createUrl);
  const defaultAreaId = areas.keys().next().value;
  const world: WorldState = {
    characters: new Map(),
  };

  // Modules
  const cors = createCors();
  const logger = new Logger(console);
  const httpServer = express();

  httpServer.use(cors);
  httpServer.use(publicPath, express.static(publicDir, {}));

  const connection = createConnectionModule();
  const modules = createModules({
    connection,
    areas,
    defaultAreaId,
    state: world,
    allowReconnection,
    logger,
  });

  let lastTick = new Date();
  const socketServer = new Server({
    connection,
    createContext: ({ clientId }) => ({
      clientId: clientId as CharacterId,
      world,
      time: lastTick,
    }),
    modules,
    serializeClientState: transformers.clientState.serialize,
    parseMessage: transformers.message.parse,
    onError,
  });

  socketServer.listen(env.wsPort);
  httpServer.listen(env.httpPort);
  setInterval(tick, env.tickInterval);

  function tick() {
    try {
      const thisTick = new Date();
      const delta = TimeSpan.fromDateDiff(lastTick, thisTick);

      modules.world.tick({
        context: {
          clientId: "server-tick" as CharacterId, // TODO this seems weird
          time: thisTick,
          world,
        },
        payload: delta,
      });

      for (const { id } of world.characters.values()) {
        socketServer.sendClientState(id, world);
      }

      lastTick = thisTick;
    } catch (error) {
      onError(error, "tick");
    }
  }

  async function allowReconnection(id: CharacterId, timeoutSeconds: number) {
    logger.warn(`allowReconnection() is not implemented`);
    return false;
  }

  function onError(e: unknown, type: string, message?: unknown) {
    return logger.chain(type).error(...(message ? [message, e] : [e]));
  }

  function createUrl(fileInPublicDir: PathToLocalFile): UrlToPublicFile {
    const port = env.httpPort === 80 ? "" : `:${env.httpPort}`;
    return `//${env.host}${port}${publicPath}${path.relative(publicDir, fileInPublicDir)}` as UrlToPublicFile;
  }
}

main();
