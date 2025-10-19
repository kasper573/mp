import type { VectorLike } from "@mp/math";
import { Vector } from "@mp/math";

/**
 * Gel/EdgeDB representation of the Vector type from @mp/math
 * 
 * In EdgeQL, this is stored as JSON and needs to be serialized/deserialized
 * when reading from or writing to the database.
 */

export function serializeVector<T extends number>(vector: Vector<T>): VectorLike<T> {
  return { x: vector.x, y: vector.y } as VectorLike<T>;
}

export function deserializeVector<T extends number>(value: VectorLike<T>): Vector<T> {
  return Vector.from(value) as Vector<T>;
}
