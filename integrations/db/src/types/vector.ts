import type { VectorLike } from "@mp/math";
import { Vector } from "@mp/math";
import type { ValueTransformer } from "typeorm";

/**
 * A TypeORM/postgres representation of the Vector type from @mp/math
 */
export class VectorTransformer<T extends number> implements ValueTransformer {
  to(value: VectorLike<T> | undefined): string | undefined {
    if (!value) return undefined;
    // PostgreSQL point format: (x,y)
    return `(${value.x},${value.y})`;
  }

  from(value: string | VectorLike<T> | undefined): Vector<T> | undefined {
    if (!value) return undefined;
    if (typeof value === "string") {
      // Parse PostgreSQL point format: (x,y)
      const match = value.match(/\(([^,]+),([^)]+)\)/);
      if (match) {
        return Vector.from<T>({
          x: parseFloat(match[1]) as T,
          y: parseFloat(match[2]) as T,
        });
      }
      return undefined;
    }
    return Vector.from<T>(value);
  }
}
