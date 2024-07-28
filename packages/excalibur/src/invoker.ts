import type { Component, Entity } from "excalibur";

export function invoker<T extends Component>(
  componentClass: InstanceOf<T>,
  entity: Entity,
): ComponentInvoker<T> {
  return new Proxy({} as ComponentInvoker<T>, {
    get(_, prop) {
      return function call(...args: unknown[]) {
        const results: unknown[] = [];
        for (const component of entity.getComponents()) {
          if (component instanceof componentClass) {
            results.push(
              (component[prop as keyof typeof component] as AnyFunction)(
                ...(args as never[]),
              ),
            );
          }
        }
        return results;
      };
    },
  });
}

type InstanceOf<T> = new (...args: never[]) => T;
type AnyFunction = (...args: never[]) => unknown;

type MethodNames<T> = {
  [K in keyof T]: T[K] extends AnyFunction ? K : never;
}[keyof T];

type ComponentInvoker<T = unknown> = {
  [K in MethodNames<T>]: Aggregated<T[K]>;
};

type Aggregated<Method> = Method extends AnyFunction
  ? (...args: Parameters<Method>) => ReturnType<Method>[]
  : never;
