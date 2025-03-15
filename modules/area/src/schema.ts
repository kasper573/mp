import type { AreaId } from "../../data/src";
import { varchar } from "@mp-modules/db";

export const areaId = () => varchar({ length: 60 }).$type<AreaId>();
