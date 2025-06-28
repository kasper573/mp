// This is a rfc6902 adjacent patch format, but with a few differences:
// - Array data structure since this data is encoded using cbor, where property names impact payload size.
// - Path is an array instead of a json pointer string. This makes patch filtering much faster since no string parsing is needed.
// - Only the operations the sync server and client needs is supported.

import type { SyncEvent } from "./sync-event";

export type SyncMessage = [
  Patch | undefined,
  serverTime: Date,
  events?: SyncEvent[],
];

export type Patch = Operation[];

export type PatchPathStep = string | number;
export type PatchPath =
  | [entityName: PatchPathStep]
  | [entityName: PatchPathStep, entityId: PatchPathStep];

export type Operation = SetOperation | UpdateOperation | RemoveOperation;

export enum PatchType {
  Set,
  Update,
  Remove,
}

export type SetOperation = [PatchType.Set, path: PatchPath, value: unknown];

export type UpdateOperation = [
  PatchType.Update,
  path: PatchPath,
  value: object,
];

export type RemoveOperation = [PatchType.Remove, path: PatchPath];

export function applyPatch(target: object, patch: Patch): void {
  for (const operation of patch) {
    applyOperation(target, operation);
  }
}

export function prefixOperation(
  prefix: PatchPathStep,
  operation: Operation,
): Operation {
  const [type, path, ...rest] = operation;
  return [type, [prefix, ...path] as PatchPath, ...rest] as Operation;
}

export function applyOperation(
  target: object,
  [type, path, value]: Operation,
): void {
  switch (type) {
    case PatchType.Set:
      return setValue(target, path, value);
    case PatchType.Update:
      return updateValue(target, path, value);
    case PatchType.Remove:
      return removeValue(target, path);
  }
}

function setValue(root: object, path: PatchPath, value: unknown): void {
  const target = getValue(root, path.slice(0, -1)) as Record<string, unknown>;
  const lastKey = path.at(-1) as string;
  if (target instanceof Map) {
    target.set(lastKey, value);
  } else {
    target[lastKey] = value;
  }
}

function updateValue(root: object, path: PatchPath, value: unknown): void {
  const target = getValue(root, path) as object | undefined;
  if (!target) {
    throw new Error(
      `Could not update value at path "${path.join(".")}", no prexisting value found`,
    );
  }
  Object.assign(target, value);
}

function removeValue(root: object, path: PatchPath): void {
  const target = getValue(root, path.slice(0, -1)) as Record<string, unknown>;
  const lastKey = path.at(-1) as string;
  if (target instanceof Map) {
    target.delete(lastKey);
  } else {
    delete target[lastKey];
  }
}

function getValue(target: object, path: unknown[]): unknown {
  for (const key of path) {
    if (target instanceof Map) {
      target = target.get(key) as never;
    } else {
      target = target[key as keyof typeof target];
    }
  }
  return target;
}
