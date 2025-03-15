import { varchar } from "@mp-modules/db";
import type { AreaId } from "@mp-modules/area";

export const areaId = () => varchar({ length: 60 }).$type<AreaId>();
