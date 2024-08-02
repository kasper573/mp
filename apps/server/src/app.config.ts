import path from "path";
import express from "express";
import config from "@colyseus/tools";
import morgan from "morgan";
import type { PathToLocalFile, UrlToPublicFile } from "@mp/state";
import { WorldRoom } from "./modules/world/room";
import { ModuleName } from "./modules/names";
import { loadAreas } from "./modules/area/loadAreas";
import { env } from "./env";

export default config({
  async initializeGameServer(server) {
    const areas = await loadAreas(path.resolve(publicDir, "areas"), createUrl);
    server.define(
      ModuleName.world,
      class extends WorldRoom {
        constructor() {
          super(areas, areas.keys().next().value);
        }
      },
    );
  },
  initializeExpress(app) {
    app.use(morgan("tiny"));
    app.use(publicPath, express.static(publicDir, {}));
  },
});

function createUrl(fileInPublicDir: PathToLocalFile): UrlToPublicFile {
  const port = env.httpPort === 80 ? "" : `:${env.httpPort}`;
  return `//${env.host}${port}${publicPath}${path.relative(publicDir, fileInPublicDir)}` as UrlToPublicFile;
}

const publicPath = "/public/";
const publicDir = path.resolve(__dirname, "../public");
