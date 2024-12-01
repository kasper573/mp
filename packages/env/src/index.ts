import { setProperty } from "dot-prop";
import type { BaseIssue, BaseSchema, InferOutput } from "valibot";
import { parse } from "valibot";

export * from "valibot";

export function parseEnv<
  const Schema extends BaseSchema<unknown, unknown, BaseIssue<unknown>>,
>(schema: Schema, env: FlatObject, prefix = "MP_"): InferOutput<Schema> {
  const selected = selectProperties(env, prefix);
  const nested = flatToNestedObject(selected);
  const res = parse(schema, nested);
  return res;
}

type Primitive = string | number | boolean | null | undefined;
type FlatObject = Record<string, Primitive>;
type NestedObject = { [key: string]: Primitive | NestedObject };

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
