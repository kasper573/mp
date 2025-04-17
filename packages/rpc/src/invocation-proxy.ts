export function createInvocationProxy(
  resolveFn: FunctionResolver,
  path: string[] = [],
) {
  return new Proxy(empty as object, {
    get: (target, prop) =>
      createInvocationProxy(resolveFn, [...path, String(prop)]),
    apply: (target, thisArg, args: unknown[]) => resolveFn(path)(...args),
  });
}

type FunctionResolver = (path: string[]) => AnyFunction;

export type AnyFunction = (...args: unknown[]) => unknown;

const empty = Object.freeze(function () {});
