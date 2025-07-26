import { loadAreaResource, type AreaId } from "@mp/game/server";
import type { InjectionContainer } from "@mp/ioc";
import type { Vector } from "@mp/math";

import type { Tile } from "@mp/std";
import { rpc } from "../integrations/trpc";

import { getAreaFileUrls } from "./area-file-urls";

export const defaultSpawnPoint = rpc.procedure.query(({ ctx }) =>
  getDefaultSpawnPoint(ctx.ioc),
);

export async function getDefaultSpawnPoint(
  ioc: InjectionContainer,
): Promise<{ areaId: AreaId; coords: Vector<Tile> }> {
  const areaFiles = await getAreaFileUrls(ioc);
  const someAreaInfo = areaFiles.entries().toArray()[0];
  if (!someAreaInfo) {
    throw new Error("No areas available");
  }

  const [areaId, areaFile] = someAreaInfo;
  const area = await loadAreaResource(areaId, areaFile);
  return {
    areaId: area.id,
    coords: area.start,
  };
}
