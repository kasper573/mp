import path from "path";
import fs from "fs/promises";
import type { PathToLocalFile, UrlToPublicFile } from "../../FileReference";
import { loadTiled } from "./loadTiled";
import { AreaResource } from "./AreaResource";

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
        new AreaResource(
          { filepath: tmxFile, url: createUrl(tmxFile) },
          await loadTiled(tmxFile),
        ),
      ] as const;
    }),
  );

  return new Map(entries);
}
