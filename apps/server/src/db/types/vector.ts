import type { Vector } from "@mp/math";
import { vec } from "@mp/math";
import { customType } from "drizzle-orm/pg-core";

export const vector = customType<{ data: Vector; driverData: string }>({
  dataType: () => "jsonb",
  toDriver: (value) => JSON.stringify(value),
  fromDriver: (json: unknown) => {
    const { x, y } = json as Vector;
    return vec(x, y);
  },
});
