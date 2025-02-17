import type { Vector } from "@mp/math";
import { point } from "drizzle-orm/pg-core";

/**
 * A drizzle/postgres representation of the Vector type from @mp/std
 */
export function vector<T extends number>() {
  return point({ mode: "xy" }).$type<Vector<T>>();
}
