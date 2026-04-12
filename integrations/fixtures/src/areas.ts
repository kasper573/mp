import type { AreaDefinition, AreaId } from "./types";

export const areas: readonly AreaDefinition[] = [
  { id: "forest" as AreaId, tiledFile: "areas/forest.json" },
  { id: "island" as AreaId, tiledFile: "areas/island.json" },
];
