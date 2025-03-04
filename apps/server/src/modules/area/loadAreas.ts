import path from "node:path";
import fs from "node:fs/promises";
import type { AreaId, PathToLocalFile } from "@mp/data";
import { AreaResource } from "@mp/data";
import { InjectionContext } from "@mp/injector";
import { loadTiled } from "./loadTiled";

export async function loadAreas(dir: string): Promise<AreaLookup> {
  const files = await fs.readdir(dir);
  const entries = await Promise.all(
    files.map(async (file) => {
      const tmxFile = path.join(dir, file) as PathToLocalFile;
      const id = path.basename(file, path.extname(file)) as AreaId;
      return [id, new AreaResource(id, await loadTiled(tmxFile))] as const;
    }),
  );

  return new Map(entries);
}

export type AreaLookup = ReadonlyMap<AreaId, AreaResource>;

export const ctx_areaLookup = InjectionContext.new<AreaLookup>();
