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
import { createGlobalModule } from "./modules/global";
import { createModules } from "./modules/definition";
import type { CharacterId, ClientId, WorldState } from "./package";
import { loadAreas } from "./modules/world/loadAreas";
import { transformers } from "./transformers";

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

  const socketServer = new Server({
    createContext: ({ clientId }) => ({
      world,
      clientId: clientId as CharacterId,
    }),
    modules: createModules({
      global,
      areas,
      defaultAreaId,
      state: world,
      allowReconnection,
      logger,
    }),
    serializeClientState: transformers.clientState.serialize,
    parseMessage: transformers.message.parse,
    onConnection: (context) => global.connect({ context }),
    onDisconnect: (payload, context) => global.disconnect({ payload, context }),
    onError,
  });

  socketServer.listen(env.wsPort);
  httpServer.listen(env.httpPort);
  setInterval(tick, env.tickInterval);

  let lastTickDelta = TimeSpan.Zero;
  let lastTick = new Date();
  function tick() {
    try {
      const thisTick = new Date();
      lastTickDelta = TimeSpan.fromDateDiff(lastTick, thisTick);
      lastTick = thisTick;

      global.tick({
        context: { clientId: "server-tick" as ClientId, world },
        payload: lastTickDelta,
      });

      for (const { id } of world.characters.values()) {
        socketServer.sendClientState(id, world);
      }
    } catch (error) {
      onError(error, "tick");
    }
  }

  async function allowReconnection(id: CharacterId, timeout: TimeSpan) {
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
