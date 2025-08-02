export enum PatchOpCode {
  Replace = 1,
  Delete = 2,
  Assign = 3,
}

export interface ReplaceOperation {
  op: PatchOpCode.Replace;
  path: string; // JSON-Pointer style, e.g. "/a/b/0"
  value: unknown;
}

export interface DeleteOperation {
  op: PatchOpCode.Delete;
  path: string;
}

export interface AssignOperation {
  op: PatchOpCode.Assign;
  path: string;
  value: object;
}

export type Operation = ReplaceOperation | DeleteOperation | AssignOperation;

export type Patch = Operation[];

/**
 * Applies an RFC6902-inspired patch (supporting only replace, delete, assign)
 * to the given target in place. Supports Objects, Arrays, Maps and Sets.
 */
export function applyPatch(target: unknown, patch: Patch): void {
  for (const op of patch) {
    const segments = parsePath(op.path);
    const { parent, key } = getContainer(target, segments);

    switch (op.op) {
      case PatchOpCode.Replace: {
        const value = op.value;

        if (isMapLike(parent)) {
          parent.set(key, value);
        } else if (isSetLike(parent)) {
          const idx = Number(key);
          const arr = Array.from(parent);
          // Replace in place by rebuilding the Set
          arr[idx] = value;
          parent.clear();
          for (const el of arr) parent.add(el);
        } else if (Array.isArray(parent)) {
          parent[Number(key)] = value;
        } else {
          (parent as Record<string, unknown>)[key] = value;
        }
        break;
      }

      case PatchOpCode.Delete: {
        if (isMapLike(parent)) {
          parent.delete(key);
        } else if (isSetLike(parent)) {
          const idx = Number(key);
          const arr = Array.from(parent);
          // Delete by rebuilding the Set without the element
          arr.splice(idx, 1);
          parent.clear();
          for (const el of arr) parent.add(el);
        } else if (Array.isArray(parent)) {
          const idx = Number(key);
          parent.splice(idx, 1);
        } else {
          delete (parent as Record<string, unknown>)[key];
        }
        break;
      }

      case PatchOpCode.Assign: {
        const val = op.value;
        if (isMapLike(parent)) {
          const existing = parent.get(key);
          Object.assign(existing as object, val);
        } else if (isSetLike(parent)) {
          const idx = Number(key);
          const arr = Array.from(parent);
          const element = arr[idx];
          Object.assign(element as object, val);
        } else if (Array.isArray(parent)) {
          const idx = Number(key);
          const existing = parent[idx];
          Object.assign(existing as object, val);
        } else {
          const existing = (parent as Record<string, unknown>)[key];
          Object.assign(existing as object, val);
        }
        break;
      }

      default:
        throw new Error(`Unsupported operation`, { cause: op });
    }
  }
}

function parsePath(path: string): string[] {
  if (!path.startsWith("/")) {
    throw new Error(`Invalid path '${path}'. Must start with '/'.`);
  }
  return path
    .split("/")
    .slice(1)
    .map((seg) => seg.replace(/~1/g, "/").replace(/~0/g, "~"));
}

// Walk all but the final segment to find the parent container
function getContainer(root: unknown, segments: string[]) {
  let parent: unknown = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (isMapLike(parent)) {
      parent = parent.get(seg);
    } else if (Array.isArray(parent)) {
      parent = parent[Number(seg)];
    } else if (isSetLike(parent)) {
      parent = Array.from(parent)[Number(seg)];
    } else if (isObject(parent)) {
      parent = (parent as Record<string, unknown>)[seg];
    } else {
      throw new Error(`Cannot traverse non-container at segment '${seg}'`);
    }
    if (parent === undefined) {
      throw new Error(`Path not found at segment '${seg}'`);
    }
  }
  return {
    parent,
    key: segments[segments.length - 1],
  };
}

// Type‐guard for plain JS objects
function isObject(val: unknown): val is Record<string, unknown> {
  return (
    typeof val === "object" &&
    val !== null &&
    !Array.isArray(val) &&
    !isMapLike(val) &&
    !isSetLike(val)
  );
}

function isMapLike<K, V>(value: unknown): value is Map<K, V> {
  return (
    value instanceof Map ||
    (typeof value === "object" &&
      value !== null &&
      mapLikeProps.every((prop) => prop in value))
  );
}

function isSetLike<T>(value: unknown): value is Set<T> {
  return (
    value instanceof Set ||
    (typeof value === "object" &&
      value !== null &&
      setLikeProps.every((prop) => prop in value))
  );
}

const mapLikeProps = ["get", "set", "delete", "clear"] satisfies Array<
  keyof Map<unknown, unknown>
>;
const setLikeProps = ["add", "delete", "clear"] satisfies Array<
  keyof Set<unknown>
>;
