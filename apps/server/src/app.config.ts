import path from "path";
import express from "express";
import config from "@colyseus/tools";
import morgan from "morgan";
import { AreaRoom } from "./modules/area/room";
import { ModuleName } from "./modules/names";
import { loadAreas } from "./modules/area/loadAreas";
import { env } from "./env";
import type { PathToLocalFile, UrlToPublicFile } from "./FileReference";

export default config({
  async initializeGameServer(server) {
    const areas = await loadAreas(path.resolve(publicDir, "areas"), createUrl);
    if (!areas.size) {
      throw new Error("No areas found!");
    }
    const [someArea] = Array.from(areas.values());
    server.define(ModuleName.area, AreaRoom, someArea);
  },
  initializeExpress(app) {
    app.use(morgan("tiny"));
    app.use(publicPath, express.static(publicDir, {}));
  },
});

function createUrl(fileInPublicDir: PathToLocalFile): UrlToPublicFile {
  return `//${env.host}:${env.httpPort}${publicPath}${path.relative(publicDir, fileInPublicDir)}` as UrlToPublicFile;
}

const publicPath = "/public/";
const publicDir = path.resolve(__dirname, "../public");
