import type { Operation, PatchPath } from "./patch";
import { PatchType } from "./patch";

export class PatchCollector<Data extends object> {
  private patchReceiver?: OperationReceiver;

  create(initialData: Data): Data {
    const proxy = new Proxy(initialData as object, {
      set: (target, prop, value) => {
        const key = prop as keyof typeof target;
        const oldValue = target[key];
        if (oldValue !== value) {
          target[key] = value as (typeof target)[typeof key];
          this.patchReceiver?.([PatchType.Set, [key] as PatchPath, value]);
        }
        return true;
      },
      get: this.restrictDeepMutations ? deepMutationGuard : undefined,
    });

    return proxy as Data;
  }

  setReceiver(receiver?: OperationReceiver): void {
    this.patchReceiver = receiver;
  }

  restrictDeepMutations = false;
}

type OperationReceiver = (operation: Operation) => void;

const deepMutationGuard: ProxyHandler<object>["get"] = (target, prop) => {
  const value = target[prop as keyof typeof target] as unknown;
  if (typeof value === "object" && value !== null) {
    return new Proxy(value, {
      set: () => {
        throw new Error("Deep mutations are not allowed");
      },
      get: deepMutationGuard,
    });
  }
  return value;
};
