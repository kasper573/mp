import type { AreaId } from "@mp/data";
import { varchar } from "npm:drizzle-orm/pg-core";

export const areaId = () => varchar({ length: 60 }).$type<AreaId>();
