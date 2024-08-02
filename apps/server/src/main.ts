import "./polyfill";
import path from "path";
import { Logger } from "@mp/logger";
import express from "express";
import {
  TimeSpan,
  type PathToLocalFile,
  type UrlToPublicFile,
} from "@mp/state";
import { Server } from "@mp/tse/server";
import createCors from "cors";
import { env } from "./env";
import { createConnectionModule } from "./modules/connection";
import type { ClientContext, ClientState, ServerContext } from "./context";
import type { ServerModules } from "./modules/definition";
import { createModules } from "./modules/definition";
import type { CharacterId, WorldState } from "./package";
import { loadAreas } from "./modules/area/loadAreas";
import { transformers } from "./transformers";

async function main() {
  const cors = createCors();
  const logger = new Logger(console);
  const httpServer = express();
  httpServer.use(cors);
  httpServer.use(publicPath, express.static(publicDir, {}));

  const areas = await loadAreas(path.resolve(publicDir, "areas"), createUrl);
  const defaultAreaId = areas.keys().next().value;
  const world: WorldState = {
    characters: new Map(),
  };

  async function allowReconnection(id: CharacterId, timeoutSeconds: number) {
    logger.warn(`allowReconnection() is not implemented`);
    return false;
  }

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
  const socketServer = new Server<
    ServerModules,
    ServerContext,
    ClientContext,
    ClientState
  >({
    logger,
    connection,
    createContext: ({ clientId }) => ({
      clientId: clientId as CharacterId,
      world,
      time: lastTick,
    }),
    modules,
    serializeClientState: transformers.clientState.serialize,
    parseMessage: transformers.message.parse,
  });

  function tick() {
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
  }

  socketServer.listen(env.wsPort);
  httpServer.listen(env.httpPort);
  setInterval(tick, env.tickInterval);
}

function createUrl(fileInPublicDir: PathToLocalFile): UrlToPublicFile {
  const port = env.httpPort === 80 ? "" : `:${env.httpPort}`;
  return `//${env.host}${port}${publicPath}${path.relative(publicDir, fileInPublicDir)}` as UrlToPublicFile;
}

const publicPath = "/public/";
const publicDir = path.resolve(__dirname, "../public");

main();
