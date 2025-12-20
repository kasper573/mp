import type { VectorLike } from "@mp/math";
import { Vector } from "@mp/math";
import type { Table } from "drizzle-orm";
import type { ColumnBaseConfig } from "drizzle-orm";
import { PgPointObject, PgPointObjectBuilder } from "drizzle-orm/pg-core";

/**
 * A drizzle/postgres representation of the Vector type from @mp/math
 */
export function vector<T extends number>(name = "") {
  return new VectorBuilder<T>(name);
}

class VectorObject<T extends number> extends PgPointObject<
  VectorColumnConfig<T>
> {
  override mapFromDriverValue(value: VectorLike<number>) {
    return Vector.from(value);
  }
}

class VectorBuilder<T extends number> extends PgPointObjectBuilder<
  VectorColumnConfig<T>
> {
  build(table: Table) {
    return new VectorObject<T>(table, this.config);
  }
}

interface VectorColumnConfig<T extends number> extends ColumnBaseConfig<
  "json",
  "PgPointObject"
> {
  data: Vector<T>;
  driverData: VectorLike<T>;
}
