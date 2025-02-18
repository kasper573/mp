// This is a rfc6902 adjacent patch format, but with a few differences:
// - Terse property names since this data is serialized using cbor, which encodes property names in the payload.
// - Path is an array instead of a json pointer string. This makes patch filtering much faster since no string parsing is needed.
// - Only the operations the sync server and client needs is supported.

export type Patch = Operation[];

export type Operation = AddOperation | RemoveOperation | UpdateOperation;

export type PatchPath = Array<string | number>;

export interface AddOperation {
  o: "a";
  p: PatchPath;
  v: unknown;
}

export interface RemoveOperation {
  o: "r";
  p: PatchPath;
}

export interface UpdateOperation {
  o: "u";
  p: PatchPath;
  v: unknown;
}

export function applyPatch(target: object, patch: Patch): void {
  for (const operation of patch) {
    applyOperation(target, operation);
  }
}

function applyOperation(target: object, operation: Operation): void {
  switch (operation.o) {
    case "a":
    case "u":
      return applySetOperation(target, operation);
    case "r":
      return applyRemoveOperation(target, operation);
  }
}

function applySetOperation(
  target: object,
  { p, v }: AddOperation | UpdateOperation,
): void {
  for (let i = 0; i < p.length - 1; i++) {
    target = target[p[i] as keyof typeof target];
  }

  const lastKey = p.at(-1) as keyof typeof target;
  target[lastKey] = v as never;
}

function applyRemoveOperation(target: object, { p }: RemoveOperation): void {
  for (let i = 0; i < p.length - 1; i++) {
    target = target[p[i] as keyof typeof target];
  }

  delete target[p.at(-1) as keyof typeof target];
}
