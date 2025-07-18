import path from "node:path";
import fs from "node:fs/promises";
import type { AreaLookup, AreaId } from "@mp/game/server";
import { AreaResource, TiledResource } from "@mp/game/server";
import type { LocalFile } from "@mp/std";
import { createTiledLoader } from "@mp/tiled-loader";

export async function loadAreas(dir: string): Promise<AreaLookup> {
  const files = await fs.readdir(dir);
  const entries = await Promise.all(
    files.map(async (file) => {
      const tmxFile = path.join(dir, file) as LocalFile;
      const id = path.basename(file, path.extname(file)) as AreaId;
      return [id, new AreaResource(id, await loadTiled(tmxFile))] as const;
    }),
  );

  return new Map(entries);
}

async function loadTiled(tmxFile: string) {
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
