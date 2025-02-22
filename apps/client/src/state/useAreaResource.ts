import { type AreaId, AreaResource, TiledResource } from "@mp/data";
import { createTiledLoader } from "@mp/tiled-loader";
import { skipToken } from "npm:@tanstack/solid-query";
import { type Accessor } from "npm:solid-js";
import { useTRPC } from "../integrations/trpc.ts";

export function useAreaResource(areaId?: Accessor<AreaId | undefined>) {
  const trpc = useTRPC();

  return trpc.area.areaFileUrl.createQuery(() => ({
    refetchOnWindowFocus: false,
    input: areaId?.() ?? skipToken,
    async map(url, input) {
      const result = await loadTiled(url);
      return new AreaResource(input, new TiledResource(result._unsafeUnwrap()));
    },
  }));
}

const loadTiled = createTiledLoader({
  loadJson,
  relativePath: relativeURL,
});

async function loadJson(url: string) {
  const response = await fetch(url);
  const json: unknown = await response.json();
  return json as Record<string, unknown>;
}

function relativeURL(url: string, base: string) {
  base = base.startsWith("//") ? globalThis.location.protocol + base : base;
  return new URL(url, base).toString();
}
