import type { AreaId } from "@mp/data";
import { varchar } from "@mp-modules/drizzle";

export const areaId = () => varchar({ length: 60 }).$type<AreaId>();
