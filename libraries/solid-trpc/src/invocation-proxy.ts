export function createInvocationProxy(
  resolveFn: FunctionResolver,
  path: string[] = [],
) {
  return new Proxy(empty as object, {
    get: (_, prop) => createInvocationProxy(resolveFn, [...path, String(prop)]),
    apply: (_, _2, args: unknown[]) => resolveFn(path)(...args),
  });
}

type FunctionResolver = (path: string[]) => AnyFunction;

export type AnyFunction = (...args: unknown[]) => unknown;

const empty = Object.freeze(function () {});

export function getPropAt(obj: object, path: string[]) {
  return path.reduce((acc, key) => acc[key as never], obj);
}
