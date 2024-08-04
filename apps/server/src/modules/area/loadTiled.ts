import fs from "fs/promises";
import { TiledResource } from "@mp/excalibur";

export async function loadTiled(tmxFile: string) {
  const resource = new TiledResource(tmxFile, tiledHeadlessInterface);
  await resource.load();
  return resource;
}

const tiledHeadlessInterface = {
  headless: true,
  fileLoader: (path: string) => fs.readFile(path, "utf-8").then(JSON.parse),
};
