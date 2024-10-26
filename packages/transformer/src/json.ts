import SuperJSON from "superjson";
import type { AbstractTransformer } from "./transformer";

export const jsonTransformer: SuperJSONTransformer = {
  parse: SuperJSON.parse,
  serialize: SuperJSON.stringify,
  registerClass: SuperJSON.registerClass,
};

type AnyClass = new (...args: never[]) => unknown;

interface SuperJSONTransformer extends AbstractTransformer<string> {
  registerClass(classType: AnyClass, options?: { identifier?: string }): void;
}

export { default as SuperJSON } from "superjson";
