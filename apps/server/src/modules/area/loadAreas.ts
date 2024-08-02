import path from "path";
import fs from "fs/promises";
import type { AreaId, PathToLocalFile, UrlToPublicFile } from "@mp/state";
import { AreaResource } from "@mp/state";
import { loadTiled } from "./loadTiled";

export async function loadAreas(
  dir: string,
  createUrl: (file: PathToLocalFile) => UrlToPublicFile,
): Promise<Map<AreaId, AreaResource>> {
  const files = await fs.readdir(dir);
  const entries = await Promise.all(
    files.map(async (file) => {
      const tmxFile = path.join(dir, file) as PathToLocalFile;
      const id = path.basename(file, path.extname(file)) as AreaId;
      return [
        id,
        new AreaResource(
          id,
          { filepath: tmxFile, url: createUrl(tmxFile) },
          await loadTiled(tmxFile),
        ),
      ] as const;
    }),
  );

  return new Map(entries);
}
