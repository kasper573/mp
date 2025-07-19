import type { Result } from "@mp/std";
import { ok, err } from "@mp/std";
import { setProperty } from "dot-prop";
import { type, type Type } from "@mp/validate";

export function assertEnv<EnvType extends Type>(
  envType: EnvType,
  envInput: FlatObject,
  prefix = "",
): EnvType["infer"] {
  const result = parseEnv(envType, envInput, prefix);
  if (result.isErr()) {
    throw new Error(result.error);
  }
  return result.value;
}

export function parseEnv<EnvType extends Type>(
  envType: EnvType,
  envInput: FlatObject,
  prefix = "",
): Result<EnvType["infer"], string> {
  const selected = selectProperties(envInput, prefix);
  const nested = flatToNestedObject(selected);

  const parsed = envType(nested);
  if (parsed instanceof type.errors) {
    return err(parsed.summary);
  }
  return ok(parsed);
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

function flatToNestedObject(flat: FlatObject): NestedObject {
  const obj: NestedObject = {};
  for (const originalKey in flat) {
    const key = camelizeAndDotNotateKey(originalKey);
    setProperty(obj, key, flat[originalKey]);
  }
  return obj;
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
