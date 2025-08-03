export enum PatchOpCode {
  ObjectPropertySet = 1,
  ObjectAssign = 2,
  ArrayReplace = 4,
  SetReplace = 5,
  MapSet = 6,
  MapDelete = 7,
  MapReplace = 8,
}

export type PathSegment = string | number;

export type Path = readonly PathSegment[];

export interface MapReplaceOperation {
  op: PatchOpCode.MapReplace;
  path: Path;
  entries: Array<[key: unknown, value: unknown]>;
}

export interface MapSetOperation {
  op: PatchOpCode.MapSet;
  path: Path;
  key: PathSegment;
  value: unknown;
}

export interface MapDeleteOperation {
  op: PatchOpCode.MapDelete;
  path: Path;
  key: PathSegment;
}

export interface ArrayReplaceOperation {
  op: PatchOpCode.ArrayReplace;
  path: Path;
  elements: unknown[];
}

export interface SetReplaceOperation {
  op: PatchOpCode.SetReplace;
  path: Path;
  values: unknown[];
}

export interface ObjectPropertySetOperation {
  op: PatchOpCode.ObjectPropertySet;
  path: Path;
  prop: PathSegment;
  value: unknown;
}

export interface ObjectAssignOperation {
  op: PatchOpCode.ObjectAssign;
  path: Path;
  changes: Record<PathSegment, unknown>;
}

export type Operation =
  | ObjectPropertySetOperation
  | ObjectAssignOperation
  | ArrayReplaceOperation
  | SetReplaceOperation
  | MapSetOperation
  | MapDeleteOperation
  | MapReplaceOperation;

export type Patch = Operation[];

/**
 * Applies an RFC6902-inspired patch to the given target object
 */
export function applyPatch(target: unknown, patch: Patch): void {
  for (const op of patch) {
    switch (op.op) {
      case PatchOpCode.ObjectPropertySet: {
        const parent = getValueAtPath<Record<string, unknown>>(target, op.path);
        parent[op.prop] = op.value;
        break;
      }

      case PatchOpCode.ObjectAssign: {
        const obj = getValueAtPath<object>(target, op.path);
        Object.assign(obj as object, op.changes);
        break;
      }

      case PatchOpCode.ArrayReplace: {
        const arr = getValueAtPath<unknown[]>(target, op.path);
        arr.splice(0, arr.length, ...op.elements);
        break;
      }

      case PatchOpCode.SetReplace: {
        const set = getValueAtPath<Set<unknown>>(target, op.path);
        set.clear();
        for (const value of op.values) {
          set.add(value);
        }
        break;
      }

      case PatchOpCode.MapSet: {
        const map = getValueAtPath<Map<unknown, unknown>>(target, op.path);
        map.set(op.key, op.value);
        break;
      }

      case PatchOpCode.MapDelete: {
        const map = getValueAtPath<Map<unknown, unknown>>(target, op.path);
        map.delete(op.key);
        break;
      }

      case PatchOpCode.MapReplace: {
        const map = getValueAtPath<Map<unknown, unknown>>(target, op.path);
        map.clear();
        for (const [k, v] of map.entries()) {
          map.set(k, v);
        }
        break;
      }
      default:
        throw new Error(`Unsupported patch operation`, { cause: op });
    }
  }
}

/**
 * Retrieve the value at the given path, traversing Maps, arrays, and objects.
 */
function getValueAtPath<Ret>(root: unknown, path: Path): Ret {
  let current: unknown = root;
  for (const segment of path) {
    current = isMapLike(current)
      ? current.get(segment)
      : (current as Record<string, unknown>)[segment];
  }
  return current as Ret;
}

function isMapLike<K, V>(value: unknown): value is Map<K, V> {
  return (
    value instanceof Map ||
    (value !== null &&
      typeof value === "object" &&
      mapLikeProps.every((prop) => prop in value))
  );
}

const mapLikeProps = ["get", "set", "delete", "clear"] satisfies Array<
  keyof Map<unknown, unknown>
>;
