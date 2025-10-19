import { type PathLike, type Path, Vector, type VectorLike } from "@mp/math";

/**
 * Gel/EdgeDB representation of the Path type from @mp/math
 *
 * In EdgeQL, this is stored as JSON and needs to be serialized/deserialized
 * when reading from or writing to the database.
 */

export function serializePath<T extends number>(path: Path<T>): PathLike<T> {
  return path.map((v) => ({ x: v.x, y: v.y }) as VectorLike<T>) as PathLike<T>;
}

export function deserializePath<T extends number>(
  data: string | PathLike<T>,
): Path<T> {
  if (typeof data === "string") {
    data = JSON.parse(data) as PathLike<T>;
  }
  return data.map((v) => Vector.from<T>(v));
}
