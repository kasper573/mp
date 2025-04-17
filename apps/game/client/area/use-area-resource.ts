import { createTiledLoader } from "@mp/tiled-loader";
import { skipToken } from "@mp/rpc";
import { useContext, type Accessor } from "solid-js";
import type { AreaId } from "../../shared/area/area-id";
import { TiledResource } from "../../shared/area/tiled-resource";
import { useRpc } from "../use-rpc";
import { BuildVersionContext } from "../build-version-context";
import { AreaResource } from "../../shared/area/area-resource";

export function useAreaResource(areaId?: Accessor<AreaId | undefined>) {
  const rpc = useRpc();
  const { server: serverVersion } = useContext(BuildVersionContext);

  return rpc.area.areaFileUrl.useQuery(() => ({
    input: areaId?.() ?? skipToken,
    async map(url, input) {
      const loadTiled = createTiledLoader({
        loadJson,
        relativePath: (path, base) => relativeURL(path, base, serverVersion()),
      });
      const result = await loadTiled(url);
      if (result.isErr()) {
        throw result.error;
      }
      return new AreaResource(input, new TiledResource(result.value));
    },
  }));
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

function relativeURL(path: string, base: string, version: string) {
  base = base.startsWith("//") ? window.location.protocol + base : base;
  const url = new URL(path, base);

  // Since relative urls in tile map files are resolved on the client side we have to add
  // the version param manually (it's easier than dynamically updating the tile map files to have the version params embedded)
  url.searchParams.set("v", version);

  return url.toString();
}
