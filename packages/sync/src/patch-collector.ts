import type { Operation, PatchPath } from "./patch";
import { PatchType } from "./patch";

export class PatchCollectorFactory<
  Entity extends object,
  EntityId = undefined,
> {
  private subscriptions = new Set<MutationReceiver<EntityId, Entity>>();

  constructor(
    private getEntityId: (entity: Entity) => EntityId = () =>
      undefined as EntityId,
  ) {}

  create(initialData: Entity): Entity {
    const proxy = new Proxy(initialData as object, {
      set: (target, prop, value) => {
        const key = prop as keyof typeof target;
        const oldValue = target[key];
        if (oldValue !== value) {
          target[key] = value as never;
          this.dispatch({
            entityId: this.getEntityId(target as Entity),
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
   * Convenience method to create a PatchCollectorMap instance for this factory.
   */
  map(
    initialEntries?: Iterable<readonly [EntityId, Entity]> | null,
  ): PatchCollectorMap<EntityId, Entity> {
    return new PatchCollectorMap<EntityId, Entity>(this, initialEntries);
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

export class PatchCollectorMap<EntityId, Entity extends object> extends Map<
  EntityId,
  Entity
> {
  private subscriptions = new Set<OperationReceiver>();

  constructor(
    private entityFactory: PatchCollectorFactory<Entity, EntityId>,
    initialEntries?: Iterable<readonly [EntityId, Entity]> | null,
  ) {
    // Can't pass initial entries to super constructor because it will lead to calls to set,
    // which will need to accses idLookup before it's been initialized
    super();

    if (initialEntries) {
      for (const [id, value] of initialEntries) {
        this.set(id, value);
      }
    }
  }

  override clear(): void {
    const removedIds = Array.from(this.keys());
    for (const id of removedIds) {
      this.delete(id);
    }
  }

  override delete(entityId: EntityId): boolean {
    const entity = this.get(entityId);
    if (entity) {
      super.delete(entityId);
      this.dispatch([PatchType.Remove, [entityId] as PatchPath]);
      return true;
    }
    return false;
  }

  override set(id: EntityId, entity: Entity): this {
    if (!isPatchCollectorInstance(entity)) {
      throw new Error("Subject is not a patch collector instance");
    }

    super.set(id, entity);
    this.dispatch([PatchType.Set, [id] as PatchPath, entity]);
    return this;
  }

  subscribe(emitOperation: OperationReceiver): () => void {
    const unsubscribeFromFactory = this.entityFactory.subscribe((mutation) => {
      emitOperation([
        PatchType.Set,
        [mutation.entityId, mutation.key] as PatchPath,
        mutation.value,
      ]);
    });

    this.subscriptions.add(emitOperation);
    return () => {
      this.subscriptions.delete(emitOperation);
      unsubscribeFromFactory();
    };
  }

  private dispatch(operation: Operation) {
    for (const receiver of this.subscriptions) {
      receiver(operation);
    }
  }
}

const patchCollectorInstanceSymbol = Symbol("patch-collector-instance");

function isPatchCollectorInstance(target: unknown): boolean {
  return target
    ? Reflect.get(target, patchCollectorInstanceSymbol) === true
    : false;
}
