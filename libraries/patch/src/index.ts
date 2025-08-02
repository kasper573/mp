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

        if (parent instanceof Map) {
          if (!parent.has(key)) {
            throw new Error(`Key '${key}' not found at '${op.path}'`);
          }
          parent.set(key, value);
        } else if (Array.isArray(parent)) {
          const idx = Number(key);
          if (!Number.isInteger(idx) || idx < 0 || idx >= parent.length) {
            throw new Error(`Index '${key}' out of bounds at '${op.path}'`);
          }
          parent[idx] = value;
        } else if (parent instanceof Set) {
          const idx = Number(key);
          const arr = Array.from(parent);
          if (!Number.isInteger(idx) || idx < 0 || idx >= arr.length) {
            throw new Error(`Index '${key}' out of bounds at '${op.path}'`);
          }
          // Replace in place by rebuilding the Set
          arr[idx] = value;
          parent.clear();
          for (const el of arr) parent.add(el);
        } else if (isObject(parent)) {
          if (!(key in parent)) {
            throw new Error(`Property '${key}' not found at '${op.path}'`);
          }
          (parent as Record<string, unknown>)[key] = value;
        } else {
          throw new Error(`Cannot traverse non-container at '${op.path}'`);
        }
        break;
      }

      case PatchOpCode.Delete: {
        if (parent instanceof Map) {
          if (!parent.delete(key)) {
            throw new Error(`Key '${key}' not found at '${op.path}'`);
          }
        } else if (Array.isArray(parent)) {
          const idx = Number(key);
          if (!Number.isInteger(idx) || idx < 0 || idx >= parent.length) {
            throw new Error(`Index '${key}' out of bounds at '${op.path}'`);
          }
          parent.splice(idx, 1);
        } else if (parent instanceof Set) {
          const idx = Number(key);
          const arr = Array.from(parent);
          if (!Number.isInteger(idx) || idx < 0 || idx >= arr.length) {
            throw new Error(`Index '${key}' out of bounds at '${op.path}'`);
          }
          // Delete by rebuilding the Set without the element
          arr.splice(idx, 1);
          parent.clear();
          for (const el of arr) parent.add(el);
        } else if (isObject(parent)) {
          if (!(key in parent)) {
            throw new Error(`Property '${key}' not found at '${op.path}'`);
          }
          delete (parent as Record<string, unknown>)[key];
        } else {
          throw new Error(`Cannot delete on non-container at '${op.path}'`);
        }
        break;
      }

      case PatchOpCode.Assign: {
        const val = op.value;
        if (!isObject(val)) {
          throw new Error(`Assign value must be an object at '${op.path}'`);
        }

        if (parent instanceof Map) {
          const existing = parent.get(key);
          if (isObject(existing)) {
            Object.assign(existing, val);
          } else {
            throw new Error(`Target is not an object in Map at '${op.path}'`);
          }
        } else if (Array.isArray(parent)) {
          const idx = Number(key);
          if (!Number.isInteger(idx) || idx < 0 || idx >= parent.length) {
            throw new Error(`Index '${key}' out of bounds at '${op.path}'`);
          }
          const existing = parent[idx];
          if (isObject(existing)) {
            Object.assign(existing, val);
          } else {
            throw new Error(`Target is not an object in Array at '${op.path}'`);
          }
        } else if (parent instanceof Set) {
          const idx = Number(key);
          const arr = Array.from(parent);
          if (!Number.isInteger(idx) || idx < 0 || idx >= arr.length) {
            throw new Error(`Index '${key}' out of bounds at '${op.path}'`);
          }
          const element = arr[idx];
          if (isObject(element)) {
            Object.assign(element, val);
          } else {
            throw new Error(`Target is not an object in Set at '${op.path}'`);
          }
        } else if (isObject(parent)) {
          if (!(key in parent)) {
            throw new Error(`Property '${key}' not found at '${op.path}'`);
          }
          const existing = (parent as Record<string, unknown>)[key];
          if (isObject(existing)) {
            Object.assign(existing, val);
          } else {
            throw new Error(
              `Target is not an object in Object at '${op.path}'`,
            );
          }
        } else {
          throw new Error(`Cannot assign on non-container at '${op.path}'`);
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
    if (parent instanceof Map) {
      parent = parent.get(seg);
    } else if (Array.isArray(parent)) {
      parent = parent[Number(seg)];
    } else if (parent instanceof Set) {
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
    !(val instanceof Map) &&
    !(val instanceof Set)
  );
}
