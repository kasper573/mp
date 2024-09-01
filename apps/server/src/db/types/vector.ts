import { Vector } from "@mp/math";
import { customType } from "drizzle-orm/pg-core";

export const vector = customType<{ data: Vector; driverData: string }>({
  dataType: () => "jsonb",
  toDriver: (value: Vector) => JSON.stringify(value),
  fromDriver(value: string): Vector {
    const { x, y } = JSON.parse(value);
    return new Vector(x, y);
  },
});
