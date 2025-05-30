import type { PatchPath, PatchPathStep } from "./patch";
import { PatchType, type Patch } from "./patch";
import type { EntityPatchOptimizer } from "./patch-optimizer";
import type { PatchableEntities, PatchableEntityId } from "./sync-emitter";

export class PatchCollectorFactory<Entity extends object> {
  constructor(private optimizer?: EntityPatchOptimizer<Entity>) {}

  /**
   * Create a PatchCollector instance for this entity type.
   */
  create(initialState: Entity): PatchCollector<Entity> {
    let changes: Partial<Entity> = {};
    let dirty = false;

    const record = new Proxy(initialState, {
      set: (target, prop, newValue) => {
        let shouldCollectValue = true;
        let collectedValue = newValue as unknown;
        const optimizer = this.optimizer?.[prop as keyof Entity];

        if (optimizer) {
          [shouldCollectValue, collectedValue] = optimizer(
            newValue as never,
            Reflect.get(target, prop),
            target,
          );
        }

        if (shouldCollectValue) {
          Reflect.set(changes, prop, collectedValue);
          dirty = true;
        }

        return Reflect.set(target, prop, newValue);
      },
      get(target, p, receiver) {
        if (p === flushFunctionName) {
          return flush;
        }
        if (PatchCollectorFactory.restrictDeepMutations) {
          return deepMutationGuard(target, p, receiver);
        }
        return Reflect.get(target, p, receiver) as unknown;
      },
    });

    const flush: EntityFlushFn = (...path) => {
      let patch: Patch = [];
      if (dirty) {
        patch = [[PatchType.Update, path as PatchPath, changes]];
      }

      changes = {};
      dirty = false;
      return patch;
    };

    return record as PatchCollector<Entity>;
  }

  /**
   * Create a PatchCollectorRecord instance for this entity type.
   */
  record<EntityId extends PatchableEntityId>(
    initialEntries?: Iterable<readonly [EntityId, Entity]>,
  ): PatchCollectorRecord<EntityId, Entity> {
    return createPatchCollectorRecord<EntityId, Entity>(initialEntries);
  }

  static restrictDeepMutations = false;
}

export type PatchCollector<Entity> = Entity & {
  [flushFunctionName]: EntityFlushFn;
};

export type PatchCollectorRecord<
  EntityId extends PatchableEntityId,
  Entity extends object,
> = PatchableEntities<EntityId, Entity> & {
  [flushFunctionName](): Patch;
};

function createPatchCollectorRecord<
  EntityId extends PatchableEntityId,
  Entity extends object,
>(
  initialEntries: Iterable<readonly [EntityId, Entity]> = [],
): PatchCollectorRecord<EntityId, Entity> {
  let previouslyFlushedIds = new Set<EntityId>();

  const record = new Proxy(
    Object.fromEntries(initialEntries) as PatchCollectorRecord<
      EntityId,
      Entity
    >,
    {
      get(target, p, receiver) {
        if (p === flushFunctionName) {
          return flush;
        }
        return Reflect.get(target, p, receiver) as unknown;
      },
    },
  );

  function flush(): Patch {
    const patch: Patch = [];
    const currentIds = new Set(Object.keys(record) as EntityId[]);

    const addedIds = currentIds.difference(previouslyFlushedIds);
    for (const id of addedIds) {
      patch.push([PatchType.Set, [id], record[id]]);
    }

    const removedIds = previouslyFlushedIds.difference(currentIds);
    for (const id of removedIds) {
      patch.push([PatchType.Remove, [id]]);
    }

    const potentiallyUpdatedIds = previouslyFlushedIds.intersection(currentIds);
    for (const id of potentiallyUpdatedIds) {
      const entity = record[id];
      if (isPatchCollector(entity)) {
        const operations = entity[flushFunctionName](id);
        if (operations.length > 0) {
          patch.push(...operations);
        }
      }
    }

    previouslyFlushedIds = currentIds;

    return patch;
  }

  return record;
}

type EntityFlushFn = (...path: PatchPathStep[]) => Patch;

// $ to try to avoid colliding with keys
const flushFunctionName = "$flush";

export function isPatchCollectorRecord<
  EntityId extends PatchableEntityId,
  Entity extends object,
>(subject: unknown): subject is PatchCollectorRecord<EntityId, Entity> {
  return subject
    ? typeof Reflect.get(subject, flushFunctionName) === "function"
    : false;
}

function isPatchCollector<Entity>(
  subject: unknown,
): subject is PatchCollector<Entity> {
  return subject
    ? typeof Reflect.get(subject, flushFunctionName) === "function"
    : false;
}

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
