import type { Result } from "@mp/std";
import { err, ok } from "@mp/std";
import { setProperty } from "dot-prop";

export function parseEnv<T extends object>(
  envInput: FlatObject,
  prefix = "",
): Result<T, Error> {
  try {
    const selected = selectProperties(envInput, prefix);
    return ok(flatToNestedObject(selected));
  } catch (error) {
    return err(new Error("Failed to parse env", { cause: error }));
  }
}

type Primitive = string | number | boolean | null | undefined;
export type FlatObject = Record<string, Primitive>;
interface NestedObject {
  [key: string]: Primitive | NestedObject;
}

function selectProperties(flat: FlatObject, prefix: string): FlatObject {
  const res: FlatObject = {};
  for (const key in flat) {
    if (key.startsWith(prefix)) {
      res[key.slice(prefix.length)] = flat[key];
    }
  }
  return res;
}

function flatToNestedObject<T extends object>(flat: FlatObject): T {
  const obj: NestedObject = {};
  for (const originalKey in flat) {
    const key = camelizeAndDotNotateKey(originalKey);
    setProperty(obj, key, flat[originalKey]);
  }
  return obj as T;
}

function camelizeAndDotNotateKey(key: string): string {
  return key
    .split(/__+/g)
    .map((part) => camelize(part.split("_")))
    .join(".");
}

function camelize(words: string[]): string {
  return words
    .map((word, i) => {
      if (i === 0) {
        return word.toLowerCase();
      }
      return word[0].toUpperCase() + word.slice(1).toLowerCase();
    })
    .join("");
}
