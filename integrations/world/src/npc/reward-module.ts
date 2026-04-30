import type { Cleanup } from "@rift/module";
import type { EntityId, RiftServerEvent } from "@rift/core";
import { RiftServerModule } from "@rift/core";
import { createShortId } from "@mp/std";
import { Kill } from "../combat/events";
import { CharacterTag, NpcTag } from "../identity/components";
import { Progression } from "../progression/components";
import { OwnedBy } from "../inventory/components";
import { spawnItem } from "../item/bundle";
import type { ItemDefinitionLookup } from "../item/definition-lookup";
import type { NpcReward } from "./definitions";

export interface NpcRewardOptions {
  readonly rewardsByNpcId: ReadonlyMap<string, ReadonlyArray<NpcReward>>;
  readonly itemLookup: ItemDefinitionLookup;
}

export class NpcRewardModule extends RiftServerModule {
  readonly #rewardsByNpc: ReadonlyMap<string, ReadonlyArray<NpcReward>>;
  readonly #itemLookup: ItemDefinitionLookup;

  constructor(opts: NpcRewardOptions) {
    super();
    this.#rewardsByNpc = opts.rewardsByNpcId;
    this.#itemLookup = opts.itemLookup;
  }

  init(): Cleanup {
    return this.server.on(Kill, this.#onKill);
  }

  #onKill = (
    event: RiftServerEvent<{ attackerId: EntityId; victimId: EntityId }>,
  ): void => {
    const { attackerId, victimId } = event.data;
    const attackerIsCharacter = this.server.world.has(attackerId, CharacterTag);
    if (!attackerIsCharacter) return;
    const victimNpc = this.server.world.get(victimId, NpcTag);
    if (!victimNpc) return;

    const rewards = this.#rewardsByNpc.get(victimNpc.definitionId);
    if (!rewards) return;

    for (const reward of rewards) {
      if (reward.type === "xp") {
        const prog = this.server.world.get(attackerId, Progression);
        if (prog) {
          this.server.world.set(attackerId, Progression, {
            ...prog,
            xp: prog.xp + reward.xp,
          });
        }
        continue;
      }
      const def = this.#itemLookup(reward.reference);
      if (def.type === "consumable") {
        const id = spawnItem(this.server.world, {
          type: "consumable",
          definition: def,
          instanceId: createShortId(),
          stackSize: reward.amount,
          ownerId: attackerId,
        });
        this.server.world.set(id, OwnedBy, { ownerId: attackerId });
      } else {
        const id = spawnItem(this.server.world, {
          type: "equipment",
          definition: def,
          instanceId: createShortId(),
          durability: def.maxDurability,
          ownerId: attackerId,
        });
        this.server.world.set(id, OwnedBy, { ownerId: attackerId });
      }
    }
  };
}
