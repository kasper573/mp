import path from "path";
import fs from "fs/promises";
import type {
  AreaId,
  PathToLocalFile,
  Result,
  UrlToPublicFile,
} from "@mp/state";
import { AreaResource, err, ok } from "@mp/state";
import { loadTiled } from "./loadTiled";

export async function loadAreas(
  dir: string,
  createUrl: (file: PathToLocalFile) => UrlToPublicFile,
): Promise<Result<Map<AreaId, AreaResource>, unknown>> {
  try {
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

    return ok(new Map(entries));
  } catch (error) {
    return err(error);
  }
}
