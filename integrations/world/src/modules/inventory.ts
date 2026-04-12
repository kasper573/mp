import { defineModule } from "@rift/modular";
import type { Entity } from "@rift/core";
import { consumables, equipment, type ItemDefinition } from "@mp/fixtures";
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

    function spawnItem(ownerId: number, definitionId: string) {
      const def = itemLookup.get(definitionId);
      if (!def) {
        return;
      }

      if (def.type === "consumable") {
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
        const entity = ctx.rift.spawn();
        entity.set(ItemOwner, { ownerId });
        entity.set(ItemDefinitionComp, { definitionId, itemType: 0 });
        entity.set(Stackable, {
          stackSize: 1,
          maxStackSize: def.maxStackSize,
        });
        return;
      }

      // Equipment
      const entity = ctx.rift.spawn();
      entity.set(ItemOwner, { ownerId });
      entity.set(ItemDefinitionComp, { definitionId, itemType: 1 });
      entity.set(Durable, {
        durability: def.maxDurability,
        maxDurability: def.maxDurability,
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
