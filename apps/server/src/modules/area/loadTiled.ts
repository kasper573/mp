import fs from "node:fs/promises";
import path from "node:path";
import { TiledResource } from "@mp/data";
import { createTiledLoader } from "@mp/tiled-loader";

export async function loadTiled(tmxFile: string) {
  const result = await load(tmxFile);
  if (result.isErr()) {
    throw result.error;
  }
  return new TiledResource(result.value);
}

const loadJson = (path: string) => fs.readFile(path, "utf8").then(JSON.parse);
const relativePath = (p: string, b: string) => path.resolve(path.dirname(b), p);
const load = createTiledLoader({
  loadJson,
  relativePath,
});
