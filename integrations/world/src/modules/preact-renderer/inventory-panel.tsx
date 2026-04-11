import { useComputed } from "@mp/state/react";
import {
  CharacterMeta,
  ConsumableStack,
  EquipmentDurability,
  ItemMeta,
} from "../../components";
import {
  useEntityComponent,
  useLocalCharacterEntity,
  useRiftQuery,
} from "./hooks";

export function InventoryPanel() {
  const entity = useLocalCharacterEntity();
  const meta = useEntityComponent(entity, CharacterMeta);
  const allItems = useRiftQuery(ItemMeta);
  const items = useComputed(() => {
    const inventoryId = meta.value?.inventoryId;
    if (!inventoryId) return [];
    return allItems.value.filter(
      (e) => e.get(ItemMeta).inventoryId === inventoryId,
    );
  });

  return (
    <div>
      <div>Inventory</div>
      <ul>
        {items.value.map((e) => {
          const item = e.get(ItemMeta);
          if (item.itemType === "consumable" && e.has(ConsumableStack)) {
            const stack = e.get(ConsumableStack);
            return (
              <li key={item.instanceId}>
                {item.definitionId} x{stack.stackSize}
              </li>
            );
          }
          if (item.itemType === "equipment" && e.has(EquipmentDurability)) {
            const dur = e.get(EquipmentDurability);
            return (
              <li key={item.instanceId}>
                {item.definitionId} ({dur.durability})
              </li>
            );
          }
          return <li key={item.instanceId}>{item.definitionId}</li>;
        })}
      </ul>
    </div>
  );
}
