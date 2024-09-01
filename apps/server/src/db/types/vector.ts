import type { VectorLike } from "@mp/math";
import { Vector } from "@mp/math";
import { customType } from "drizzle-orm/pg-core";

export const vector = customType<{ data: Vector; driverData: string }>({
  dataType: () => "jsonb",
  toDriver: (value) => JSON.stringify(value),
  fromDriver: (json: unknown) => {
    const { x, y } = json as VectorLike;
    return new Vector(x, y);
  },
});
