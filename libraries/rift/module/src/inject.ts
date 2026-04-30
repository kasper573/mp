import { DEPS, type DepEntry, type DepsMetadata } from "./internal";
import type { Class } from "./types";

export function inject<T extends object>(cls: Class<T>) {
  return function <This>(
    _target: ClassAccessorDecoratorTarget<This, T>,
    context: ClassAccessorDecoratorContext<This, T>,
  ): void {
    const metadata = context.metadata as DepsMetadata;
    const own = Object.hasOwn(metadata, DEPS);
    const deps = own
      ? (metadata[DEPS] as Map<PropertyKey, DepEntry>)
      : new Map(metadata[DEPS]);
    if (!own) {
      metadata[DEPS] = deps;
    }
    deps.set(context.name, {
      cls,
      set(instance, value) {
        context.access.set(instance as This, value as T);
      },
    });
  };
}

if (!Symbol.metadata) {
  Object.assign(Symbol, { metadata: Symbol("Symbol.metadata") });
}
