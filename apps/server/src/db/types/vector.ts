import type { Vector } from "@mp/math";
import type { TileNumber } from "@mp/std";
import { type Pixel } from "@mp/std";
import type { PgCustomColumnBuilder } from "drizzle-orm/pg-core";
import { point } from "drizzle-orm/pg-core";

export const pixelVector = vector<Pixel>;
export const tileVector = vector<TileNumber>;

function vector<T extends number>(name: string) {
  return point(name, { mode: "xy" }) as unknown as PgCustomColumnBuilder<{
    name: "vector";
    dataType: "custom";
    columnType: "PgCustomColumn";
    data: Vector<T>;
    driverParam: string;
    enumValues: undefined;
  }>;
}
