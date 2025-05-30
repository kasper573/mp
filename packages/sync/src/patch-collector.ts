import type { Operation, PatchPath } from "./patch";
import { PatchType } from "./patch";
import type { PatchableEntities, PatchableEntityId } from "./sync-emitter";

export class PatchCollectorFactory<
  Entity extends object,
  EntityId extends PatchableEntityId = PatchableEntityId,
> {
  private subscriptions = new Set<MutationReceiver<EntityId, Entity>>();

  constructor(private getEntityId?: (entity: Entity) => EntityId) {}

  create(initialData: Entity): Entity {
    const proxy = new Proxy(initialData as object, {
      set: (target, prop, value) => {
        const key = prop as keyof typeof target;
        const oldValue = target[key];
        if (oldValue !== value) {
          target[key] = value as never;
          this.dispatch({
            entityId: this.getEntityId?.(target as Entity) as EntityId,
            key,
            value: value as never,
          });
        }
        return true;
      },
      get(target, p, receiver) {
        if (p === patchCollectorInstanceSymbol) {
          return true;
        }

        if (PatchCollectorFactory.restrictDeepMutations) {
          return deepMutationGuard(target, p, receiver);
        }

        return Reflect.get(target, p, receiver) as unknown;
      },
    });

    return proxy as Entity;
  }

  subscribe(receiver: MutationReceiver<EntityId, Entity>) {
    this.subscriptions.add(receiver);
    return () => this.subscriptions.delete(receiver);
  }

  private dispatch(mutation: Mutation<EntityId, Entity>) {
    for (const receiver of this.subscriptions) {
      receiver(mutation);
    }
  }

  /**
   * Convenience method to create a PatchCollectorRecord instance for this factory.
   */
  record(
    initialEntries?: Iterable<readonly [EntityId, Entity]>,
  ): PatchCollectorRecord<EntityId, Entity> {
    return createPatchCollectorRecord<EntityId, Entity>(this, initialEntries);
  }

  static restrictDeepMutations = false;
}

type MutationReceiver<EntityId, Entity> = (
  mutation: Mutation<EntityId, Entity>,
) => void;

export type Mutation<
  EntityId,
  Entity,
  K extends keyof Entity = keyof Entity,
> = {
  entityId: EntityId;
  key: K;
  value: Entity[K];
};

type OperationReceiver = (operation: Operation) => void;

function deepMutationGuard<T extends object>(
  target: T,
  prop: string | symbol,
  receiver: unknown,
): unknown {
  const value = Reflect.get(target, prop, receiver) as unknown;
  if (typeof value === "object" && value !== null) {
    return new Proxy(value, {
      set: () => {
        throw new Error("Deep mutations are not allowed");
      },
      get: deepMutationGuard,
    });
  }
  return value;
}

export type PatchCollectorRecord<
  EntityId extends PatchableEntityId,
  Entity extends object,
> = PatchableEntities<EntityId, Entity> & {
  [subscribeFunctionName](emitOperation: OperationReceiver): () => void;
};

export function createPatchCollectorRecord<
  EntityId extends PatchableEntityId,
  Entity extends object,
>(
  entityFactory: PatchCollectorFactory<Entity, EntityId>,
  initialEntries: Iterable<readonly [EntityId, Entity]> = [],
): PatchCollectorRecord<EntityId, Entity> {
  const subscriptions = new Set<OperationReceiver>();
  return new Proxy(
    Object.fromEntries(initialEntries) as PatchCollectorRecord<
      EntityId,
      Entity
    >,
    {
      set: (record, prop, value) => {
        if (!isPatchCollectorInstance(value)) {
          throw new Error("Subject is not a patch collector instance");
        }

        const result = Reflect.set(record, prop, value);
        dispatch([PatchType.Set, [prop] as PatchPath, value]);
        return result;
      },
      deleteProperty: (record, prop) => {
        const result = Reflect.deleteProperty(record, prop);
        dispatch([PatchType.Remove, [prop] as PatchPath]);
        return result;
      },
      get(target, p, receiver) {
        if (p === subscribeFunctionName) {
          return subscribe;
        }
        return Reflect.get(target, p, receiver) as unknown;
      },
    },
  );

  function subscribe(emitOperation: OperationReceiver): () => void {
    const unsubscribeFromFactory = entityFactory.subscribe((mutation) => {
      emitOperation([
        PatchType.Set,
        [mutation.entityId, mutation.key] as PatchPath,
        mutation.value,
      ]);
    });

    subscriptions.add(emitOperation);
    return () => {
      subscriptions.delete(emitOperation);
      unsubscribeFromFactory();
    };
  }

  function dispatch(operation: Operation) {
    for (const receiver of subscriptions) {
      receiver(operation);
    }
  }
}

const patchCollectorInstanceSymbol = Symbol("patch-collector-instance");

// $ to try to avoid colliding with keys
const subscribeFunctionName = "$subscribe";

export function isPatchCollectorRecord<
  EntityId extends PatchableEntityId,
  Entity extends object,
>(subject: unknown): subject is PatchCollectorRecord<EntityId, Entity> {
  return subject
    ? typeof Reflect.get(subject, subscribeFunctionName) === "function"
    : false;
}

function isPatchCollectorInstance(target: unknown): boolean {
  return target
    ? Reflect.get(target, patchCollectorInstanceSymbol) === true
    : false;
}
