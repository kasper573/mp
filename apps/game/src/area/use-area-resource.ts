import { createVectorTiledLoader } from "@mp/tiled-loader";
import { skipToken } from "@mp/rpc/react";
import type { AreaId } from "./area-id";
import { TiledResource } from "./tiled-resource";
import { ctxGameRpcClient } from "../rpc/game-rpc-client";
import { AreaResource } from "./area-resource";
import { ioc } from "../context/ioc";

export function useAreaResource(areaId: AreaId | undefined) {
  const rpc = ioc.get(ctxGameRpcClient);
  return rpc.area.areaFileUrl.useQuery({
    input: areaId ?? skipToken,
    staleTime: Infinity,
    map: loadAreaResource,
  });
}

export async function loadAreaResource(
  areaFileUrl: string,
  areaId: AreaId,
): Promise<AreaResource> {
  const loadTiled = createVectorTiledLoader({
    loadFile: loadJson,
  });
  const result = await loadTiled.load(areaFileUrl);
  if (result.isErr()) {
    throw result.error;
  }
  return new AreaResource(areaId, new TiledResource(result.value));
}

async function loadJson(url: string) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  const json: unknown = await response.json();
  return json as Record<string, unknown>;
}
