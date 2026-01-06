import { areaFileUrls } from "./area";
import { loadAreaResource } from "../integrations/load-area-resource";
import type { ApiContext } from "../context";

export async function defaultSpawnPoint(ctx: ApiContext) {
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
