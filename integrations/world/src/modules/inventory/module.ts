import { defineModule } from "@rift/modular";
import type { EntityId } from "@rift/core";
import { computed } from "@mp/state";
import {
  items,
  type ItemDefinition,
  type ItemDefinitionId,
} from "@mp/fixtures";
import {
  ItemOwner,
  ItemDefinitionComp,
  Stackable,
  Durable,
} from "../../components";
import { sessionModule } from "../session/module";

const itemLookup = new Map<ItemDefinitionId, ItemDefinition>(
  items.map((d) => [d.id, d]),
);

export const inventoryModule = defineModule({
  dependencies: [sessionModule],
  client: (ctx) => {
    const session = ctx.using(sessionModule);
    const allItems = ctx.rift.query(ItemOwner, ItemDefinitionComp);

    const myItems = computed(() => {
      const myId = session.myEntityId.value;
      if (myId === undefined) return [];
      return allItems.value.filter(
        (item) => item.get(ItemOwner).ownerId === myId,
      );
    });

    return { api: { myItems } };
  },
  server: (ctx) => {
    const itemQuery = ctx.rift.query(ItemOwner, ItemDefinitionComp);

    function spawnItem(ownerId: EntityId, definitionId: ItemDefinitionId) {
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
      api: { spawnItem },
    };
  },
});
