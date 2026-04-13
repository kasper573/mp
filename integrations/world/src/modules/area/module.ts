import { defineModule } from "@rift/modular";
import { areas } from "@mp/fixtures";
import type { AreaId } from "@mp/fixtures";
import { loadAreaResource } from "./load-area-resource";
import type { AreaResource } from "./area-resource";

declare module "@rift/modular" {
  interface ServerContextValues {
    tiledBaseUrl: string;
  }
}

export const areaModule = defineModule({
  server: async (ctx) => {
    const baseUrl = ctx.values.tiledBaseUrl;

    const entries = await Promise.all(
      areas.map(async (def): Promise<[AreaId, AreaResource]> => {
        const fileUrl = new URL(def.tiledFile, baseUrl).toString();
        return [def.id, await loadAreaResource(def.id, fileUrl)];
      }),
    );

    const areaMap = new Map<AreaId, AreaResource>(entries);

    return {
      api: { areas: areaMap },
    };
  },
});
