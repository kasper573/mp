import { object, string } from "@rift/types";
import type { AreaId } from "@mp/fixtures";

export const AreaTag = object({
  areaId: string<AreaId>(),
});

export const areaComponents = [AreaTag] as const;
