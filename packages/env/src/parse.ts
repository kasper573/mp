import { ok, err } from "@mp/std";
import { setProperty } from "dot-prop";
import type { BaseSchema, BaseIssue, InferOutput } from "valibot";
import { safeParse } from "valibot";

export function assertEnv<
  const Schema extends BaseSchema<unknown, unknown, BaseIssue<unknown>>,
>(schema: Schema, env: FlatObject, prefix = ""): InferOutput<Schema> {
  const result = parseEnv(schema, env, prefix);
  if (result.isErr()) {
    throw new Error(result.error);
  }
  return result.value;
}

export function parseEnv<
  const Schema extends BaseSchema<unknown, unknown, BaseIssue<unknown>>,
>(schema: Schema, env: FlatObject, prefix = "") {
  const selected = selectProperties(env, prefix);
  const nested = flatToNestedObject(selected);
  const res = safeParse(schema, nested);
  if (res.success) {
    return ok(res.output);
  }
  return err(describeIssues(res.issues));
}

type Primitive = string | number | boolean | null | undefined;
export type FlatObject = Record<string, Primitive>;
interface NestedObject { [key: string]: Primitive | NestedObject }

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

function describeIssues(issues: BaseIssue<unknown>[]): string {
  return issues
    .map(
      (issue) =>
        `${(issue.path ?? []).map((p) => p.key).join(".")}: ${issue.message}`,
    )
    .join("\n");
}
