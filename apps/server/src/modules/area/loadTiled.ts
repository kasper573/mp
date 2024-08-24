import fs from "fs/promises";
import path from "path";
import { TiledResource } from "@mp/state";
import { createTiledLoader } from "@mp/tiled-loader";

export async function loadTiled(tmxFile: string) {
  const { error, tiledMap } = await load(tmxFile);
  if (error || !tiledMap) {
    throw new Error(String(error || "Failed to load area"));
  }
  return new TiledResource(tiledMap);
}

const loadJson = (path: string) => fs.readFile(path, "utf-8").then(JSON.parse);
const relativePath = (p: string, b: string) => path.resolve(path.dirname(b), p);
const load = createTiledLoader({
  loadJson,
  relativePath,
});
