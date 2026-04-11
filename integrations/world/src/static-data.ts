import type {
  ActorModelId,
  AreaId,
  ConsumableDefinitionId,
  EquipmentDefinitionId,
} from "./domain-ids";

export const defaultAreaId = "forest" as AreaId;
import type {
  ConsumableDefinition,
  EquipmentDefinition,
  ItemDefinition,
  ItemDefinitionByReference,
  ItemReference,
} from "./items";

export const actorModelIds: readonly ActorModelId[] = [
  "adventurer" as ActorModelId,
];

export const consumableDefinitions: readonly ConsumableDefinition[] = [
  {
    type: "consumable",
    id: "apple" as ConsumableDefinitionId,
    name: "Apple",
    maxStackSize: 10,
  },
];

export const equipmentDefinitions: readonly EquipmentDefinition[] = [
  {
    type: "equipment",
    id: "sword" as EquipmentDefinitionId,
    name: "Sword",
    maxDurability: 100,
  },
];

const consumableById = new Map(
  consumableDefinitions.map((d) => [d.id, d] as const),
);
const equipmentById = new Map(
  equipmentDefinitions.map((d) => [d.id, d] as const),
);

export function lookupItemDefinition<Ref extends ItemReference>(
  ref: Ref,
): ItemDefinitionByReference<Ref> {
  const def: ItemDefinition | undefined =
    ref.type === "consumable"
      ? consumableById.get(ref.definitionId)
      : equipmentById.get(ref.definitionId);
  if (!def) {
    throw new Error(
      `Unknown item definition: ${ref.type}/${String(ref.definitionId)}`,
    );
  }
  return def as ItemDefinitionByReference<Ref>;
}
