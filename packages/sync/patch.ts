// This is a rfc6902 adjacent patch format, but with a few differences:
// - Array data structure since this data is serialized using cbor, where property names impact payload size.
// - Path is an array instead of a json pointer string. This makes patch filtering much faster since no string parsing is needed.
// - Only the operations the sync server and client needs is supported.

export type Patch = Operation[];

export type PatchPath = Array<string | number>;

export type Operation = [path: PatchPath, value?: unknown];

export function applyPatch(target: object, patch: Patch): void {
  for (const operation of patch) {
    applyOperation(target, operation);
  }
}

function applyOperation(target: object, [path, value]: Operation): void {
  for (let i = 0; i < path.length - 1; i++) {
    target = target[path[i] as keyof typeof target];
  }

  const lastKey = path.at(-1) as keyof typeof target;
  if (value === undefined) {
    delete target[lastKey];
  } else {
    target[lastKey] = value as never;
  }
}
