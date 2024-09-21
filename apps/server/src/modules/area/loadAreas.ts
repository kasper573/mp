import path from "path";
import fs from "fs/promises";
import type { AreaId, PathToLocalFile } from "@mp/data";
import { type Result, ok, err } from "@mp/state";
import { AreaResource } from "@mp/data";
import { loadTiled } from "./loadTiled";

export async function loadAreas(
  dir: string,
): Promise<Result<Map<AreaId, AreaResource>, unknown>> {
  try {
    const files = await fs.readdir(dir);
    const entries = await Promise.all(
      files.map(async (file) => {
        const tmxFile = path.join(dir, file) as PathToLocalFile;
        const id = path.basename(file, path.extname(file)) as AreaId;
        return [id, new AreaResource(id, await loadTiled(tmxFile))] as const;
      }),
    );

    return ok(new Map(entries));
  } catch (error) {
    return err(error);
  }
}
