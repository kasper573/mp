import type { TiledMapWithVectors } from "@mp/tiled-loader";
import { createTiledLoaderWithVectors } from "@mp/tiled-loader";
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
  const tiledMap = await loadTiledMap(areaFileUrl);
  return new AreaResource(areaId, new TiledResource(tiledMap));
}

export function useTiledMap(areaId: AreaId | undefined) {
  const rpc = ioc.get(ctxGameRpcClient);
  return rpc.area.areaFileUrl.useQuery({
    input: areaId ?? skipToken,
    staleTime: Infinity,
    map: loadTiledMap,
  });
}

export async function loadTiledMap(url: string): Promise<TiledMapWithVectors> {
  const loadTiled = createTiledLoaderWithVectors({
    loadJson,
    relativePath: (path, base) => relativeUrl(path, base),
  });
  const result = await loadTiled(url);
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
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

function relativeUrl(path: string, base: string) {
  base = base.startsWith("//") ? window.location.protocol + base : base;
  const url = new URL(path, base);
  return url.toString();
}
