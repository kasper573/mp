import { varchar } from "@mp/db";
import type { AreaId } from "../../shared/area/area-id";

export const areaId = () => varchar({ length: 60 }).$type<AreaId>();
