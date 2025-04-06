import { Vector } from "@mp/math";
import { customType } from "drizzle-orm/pg-core";

/**
 * A drizzle/postgres representation of the Vector type from @mp/std
 */
export function vector<T extends number>() {
  const buildSchema = customType<{
    data: Vector<T>;
    driverData: [T, T];
    notNull: true;
  }>({
    dataType() {
      return "point";
    },
    toDriver(v) {
      return [v.x, v.y];
    },
    fromDriver([x, y]) {
      return new Vector<T>(x, y);
    },
  });

  return buildSchema();
}
