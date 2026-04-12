import { defineModule } from "@rift/modular";
import type { Entity } from "@rift/core";
import {
  consumables,
  equipment,
  type ConsumableDefinition,
  type EquipmentDefinition,
  type ItemDefinition,
} from "@mp/fixtures";
import {
  ItemOwner,
  ItemDefinitionComp,
  Stackable,
  Durable,
} from "../components";

const itemLookup = new Map<string, ItemDefinition>(
  [...consumables, ...equipment].map((d) => [d.id, d]),
);

export const inventoryModule = defineModule({
  server: (ctx) => {
    const itemQuery = ctx.rift.query(ItemOwner, ItemDefinitionComp);

    function spawnItem(
      ownerId: number,
      definitionId: string,
      itemType: "consumable" | "equipment",
    ) {
      const def = itemLookup.get(definitionId);
      if (!def) {
        return;
      }

      if (itemType === "consumable") {
        // Try merging into existing stack
        for (const item of itemQuery.value) {
          if (
            item.get(ItemOwner).ownerId === ownerId &&
            item.get(ItemDefinitionComp).definitionId === definitionId &&
            item.has(Stackable)
          ) {
            const stack = item.get(Stackable);
            if (stack.stackSize < stack.maxStackSize) {
              stack.stackSize += 1;
              return;
            }
          }
        }

        // New stack
        const cDef = def as ConsumableDefinition;
        const entity = ctx.rift.spawn();
        entity.set(ItemOwner, { ownerId });
        entity.set(ItemDefinitionComp, { definitionId, itemType: 0 }); // 0 = consumable
        entity.set(Stackable, {
          stackSize: 1,
          maxStackSize: cDef.maxStackSize,
        });
        return;
      }

      // Equipment
      const eDef = def as EquipmentDefinition;
      const entity = ctx.rift.spawn();
      entity.set(ItemOwner, { ownerId });
      entity.set(ItemDefinitionComp, { definitionId, itemType: 1 }); // 1 = equipment
      entity.set(Durable, {
        durability: eDef.maxDurability,
        maxDurability: eDef.maxDurability,
      });
    }

    return {
      api: {
        spawnItem,
        getItemsForOwner(ownerId: number): Entity[] {
          const results: Entity[] = [];
          for (const item of itemQuery.value) {
            if (item.get(ItemOwner).ownerId === ownerId) {
              results.push(item);
            }
          }
          return results;
        },
      },
    };
  },
});
