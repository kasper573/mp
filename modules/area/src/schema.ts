import type { AreaId } from "@mp-modules/data";
import { varchar } from "@mp-modules/db";

export const areaId = () => varchar({ length: 60 }).$type<AreaId>();
