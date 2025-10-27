import type { CharacterId, NpcDefinitionId } from "@mp/game-shared";
import type { Character, NpcReward } from "@mp/game-shared";
import { assert } from "@mp/std";
import { spawnItem } from "./item-spawn-system";
import type { InjectionContainer } from "@mp/ioc";
import { ctxGameState, ctxLogger } from "../context";

export class NpcRewardSystem {
  private rewardsPerNpc = new Map<NpcDefinitionId, NpcReward[]>();

  constructor(
    private ioc: InjectionContainer,
    npcRewards: NpcReward[],
  ) {
    for (const reward of npcRewards) {
      if (this.rewardsPerNpc.has(reward.npcId)) {
        this.rewardsPerNpc.get(reward.npcId)?.push(reward);
      } else {
        this.rewardsPerNpc.set(reward.npcId, [reward]);
      }
    }
  }

  giveRewardForKillingNpc(recipientId: CharacterId, npcId: NpcDefinitionId) {
    const gameState = this.ioc.get(ctxGameState);
    const logger = this.ioc.get(ctxLogger).child({
      reason: `Killed NPC`,
      npcId,
      recipientId,
    });

    const rewards = this.rewardsPerNpc.get(npcId);
    if (!rewards) {
      logger.debug(`No rewards defined for NPC`);
      return;
    }

    for (const reward of rewards) {
      const recipient = assert(gameState.actors.get(recipientId) as Character);
      switch (reward.type) {
        case "item": {
          spawnItem(this.ioc, reward.reference, recipient.inventoryId, logger);
          break;
        }
        case "xp": {
          logger.debug(`Gave ${reward.xp} XP`);
          recipient.progression.xp += reward.xp;
          break;
        }
        default:
          logger.warn(reward, `Unknown npc reward type. Cannot give reward.`);
          break;
      }
    }
  }
}
