import { varchar } from "@mp-modules/db";
import type { AreaId } from "../../shared/area/AreaId";

export const areaId = () => varchar({ length: 60 }).$type<AreaId>();
