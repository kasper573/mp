import type { Cleanup, Feature } from "../feature";
import { createShortId } from "@mp/std";
import { Kill } from "../combat/events";
import { CharacterTag, NpcTag } from "../identity/components";
import { Progression } from "../progression/components";
import { InventoryRef } from "../inventory/components";
import { spawnItem } from "../item/bundle";
import type { ItemDefinitionLookup } from "../item/definition-lookup";
import type { NpcReward } from "./definitions";

export interface NpcRewardOptions {
  readonly rewardsByNpcId: ReadonlyMap<string, ReadonlyArray<NpcReward>>;
  readonly itemLookup: ItemDefinitionLookup;
}

export function npcRewardFeature(opts: NpcRewardOptions): Feature {
  return {
    server(server): Cleanup {
      return server.on(Kill, (event) => {
        const { attackerId, victimId } = event.data;
        if (!server.world.has(attackerId, CharacterTag)) return;
        const victimNpc = server.world.get(victimId, NpcTag);
        if (!victimNpc) return;

        const rewards = opts.rewardsByNpcId.get(victimNpc.definitionId);
        if (!rewards) return;

        const attackerInventory = server.world.get(attackerId, InventoryRef);
        if (!attackerInventory) return;

        for (const reward of rewards) {
          if (reward.type === "xp") {
            const prog = server.world.get(attackerId, Progression);
            if (prog) {
              server.world.write(attackerId, Progression, {
                xp: prog.xp + reward.xp,
              });
            }
            continue;
          }
          const def = opts.itemLookup(reward.reference);
          const itemId =
            def.type === "consumable"
              ? spawnItem(server.world, {
                  type: "consumable",
                  definition: def,
                  instanceId: createShortId(),
                  stackSize: reward.amount,
                  ownerId: attackerId,
                })
              : spawnItem(server.world, {
                  type: "equipment",
                  definition: def,
                  instanceId: createShortId(),
                  durability: def.maxDurability,
                  ownerId: attackerId,
                });
          server.world.add(itemId, InventoryRef, {
            inventoryId: attackerInventory.inventoryId,
          });
        }
      });
    },
  };
}
