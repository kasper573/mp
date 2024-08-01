import path from "path";
import fs from "fs/promises";
import type { TiledResource } from "@mp/excalibur";
import type {
  FileReference,
  PathToLocalFile,
  UrlToPublicFile,
} from "../../FileReference";
import { loadTiled } from "./loadTiled";

export async function loadAreas(
  dir: string,
  createUrl: (file: PathToLocalFile) => UrlToPublicFile,
): Promise<Map<string, AreaResource>> {
  const files = await fs.readdir(dir);
  const entries = await Promise.all(
    files.map(async (file) => {
      const tmxFile = path.join(dir, file) as PathToLocalFile;
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
