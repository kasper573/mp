import { type PathLike, type Path, Vector } from "@mp/math";
import type { Table } from "drizzle-orm";
import type { ColumnBaseConfig } from "drizzle-orm";
import { PgJsonb, PgJsonbBuilder } from "drizzle-orm/pg-core";

/**
 * A drizzle/postgres representation of the Path type from @mp/math
 */
export function path<T extends number>(name = "") {
  return new PathBuilder<T>(name);
}

class PathObject<T extends number> extends PgJsonb<PathColumnConfig<T>> {
  override mapFromDriverValue(value: string | PathLike<T>): Path<T> {
    if (typeof value === "string") {
      value = JSON.parse(value) as PathLike<T>;
    }
    return value.map((v) => Vector.from<T>(v));
  }
}

class PathBuilder<T extends number> extends PgJsonbBuilder<
  PathColumnConfig<T>
> {
  build(table: Table) {
    return new PathObject<T>(table, this.config);
  }
}

interface PathColumnConfig<T extends number>
  extends ColumnBaseConfig<"json", "PgJsonb"> {
  data: Path<T>;
  driverData: PathLike<T>;
}
