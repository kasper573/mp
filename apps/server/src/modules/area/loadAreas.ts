import path from "path";
import fs from "fs/promises";
import type { TiledResource } from "@mp/excalibur";
import { loadTiled } from "./loadTiled";

export async function loadAreas(
  dir: string,
  createUrl: (file: string) => string,
): Promise<Map<string, AreaResource>> {
  const files = await fs.readdir(dir);
  const entries = await Promise.all(
    files.map(async (file) => {
      const tmxFile = path.join(dir, file);
      return [
        file,
        {
          tmxFile: { filepath: tmxFile, url: createUrl(tmxFile) },
          tiled: await loadTiled(tmxFile),
        },
      ] as const;
    }),
  );

  return new Map(entries);
}

export interface AreaResource {
  tmxFile: FileReference;
  tiled: TiledResource;
}

export interface FileReference {
  filepath: string;
  url: string;
}
