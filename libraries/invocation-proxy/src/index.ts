export function createInvocationProxy(
  resolveFn: FunctionResolver,
  path: string[] = [],
): InvocationProxy {
  return new Proxy(empty as unknown as InvocationProxy, {
    get: (target, prop) =>
      createInvocationProxy(resolveFn, [...path, String(prop)]),
    apply: (target, thisArg, args: unknown[]) => resolveFn(path)(...args),
  });
}

export type InvocationProxy = AnyFunction & {
  [key: string]: InvocationProxy;
};

export type FunctionResolver = (path: string[]) => AnyFunction;

export type AnyFunction = (...args: unknown[]) => unknown;

const empty = Object.freeze(function () {});
