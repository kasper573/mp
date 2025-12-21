import type { AreaId } from "@mp/game-shared";
import type { VectorLike } from "@mp/math";
import type { Tile } from "@mp/std";
import { areaFileUrls } from "./area";
import { loadAreaResource } from "../integrations/load-area-resource";
import type { ApiContext } from "../context";

/** @gqlQueryField */
export async function defaultSpawnPoint(ctx: ApiContext): Promise<SpawnPoint> {
  const [info] = await areaFileUrls("internal", ctx);
  if (!info) {
    throw new Error("No areas available");
  }

  const area = await loadAreaResource(info.areaId, info.url);
  return {
    areaId: area.id,
    coords: area.start,
  };
}

/** @gqlType */
export interface SpawnPoint {
  /** @gqlField */
  areaId: AreaId;
  /** @gqlField */
  coords: VectorLike<Tile>;
}
