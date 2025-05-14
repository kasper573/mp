import type { Patch, UpdateOperation } from "./patch";
import { PatchType } from "./patch";
import type { PatchableState } from "./patch-state-machine";

/**
 * Returns a new patch that transforms update operations according to the provided filter.
 */
export function filterPatch<State extends PatchableState>(
  state: State,
  patch: Patch,
  filter: PatchFilter<State>,
): Patch {
  return patch.map((op) =>
    op[0] === PatchType.Update ? filterUpdateOperation(state, filter, op) : op,
  );
}

/**
 * Returns a new update operation with some properties filtered out.
 */
function filterUpdateOperation<State extends PatchableState>(
  state: State,
  filter: PatchFilter<State>,
  op: UpdateOperation,
): UpdateOperation {
  const [, path, update] = op;

  if (path.length !== 2) {
    // We can only filter direct updates to entities.
    return op;
  }

  const entityName = path[0];
  const entityId = path[1];
  const entityFilter = filter[entityName];
  if (!entityFilter) {
    // Entity has no filter, keep the operation as is.
    return op;
  }

  const entity = state[entityName][entityId] as
    | Record<string, unknown>
    | undefined;

  if (!entity) {
    // Entity doesn't exist in local state, which means the update is likely
    // intended to be applied to an entity that was received with the same patch.
    // In these cases, we don't want to filter out the update, since no local
    // state exists to compare against.
    return op;
  }

  // Entity has a filter. Copy the update and remove the properties that don't pass the filter.
  const filteredUpdate = { ...(update as typeof entity) };
  for (const key in entityFilter) {
    const propertyFilter = entityFilter[key] as
      | PropertyFilter<unknown, unknown>
      | undefined;
    const oldValue = entity[key];
    const newValue = filteredUpdate[key];
    if (!propertyFilter || !(key in filteredUpdate)) {
      continue;
    }
    if (!propertyFilter(newValue, oldValue, entity, update as never)) {
      delete filteredUpdate[key];
    }
  }

  return [PatchType.Update, path, filteredUpdate];
}

export type PatchFilter<State extends PatchableState> = {
  [Entity in keyof State]?: EntityFilter<State[Entity][keyof State[Entity]]>;
};

type EntityFilter<Entity> = {
  [Field in keyof Entity]?: PropertyFilter<Entity[Field], Entity>;
};

type PropertyFilter<Value, Entity> = (
  newValue: Value,
  oldValue: Value,
  entity: Entity,
  update: Partial<Entity>,
) => boolean;
