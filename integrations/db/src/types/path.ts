import { type PathLike, type Path, Vector } from "@mp/math";
import type { ValueTransformer } from "typeorm";

/**
 * A TypeORM/postgres representation of the Path type from @mp/math
 */
export class PathTransformer<T extends number> implements ValueTransformer {
  to(value: PathLike<T> | undefined): string | undefined {
    if (!value) return undefined;
    return JSON.stringify(value);
  }

  from(value: string | PathLike<T> | undefined): Path<T> | undefined {
    if (!value) return undefined;
    if (typeof value === "string") {
      value = JSON.parse(value) as PathLike<T>;
    }
    return value.map((v) => Vector.from<T>(v));
  }
}
