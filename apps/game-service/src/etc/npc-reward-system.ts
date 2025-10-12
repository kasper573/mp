import type { CharacterId, NpcId } from "@mp/db/types";
import {
  ItemInstance,
  type Character,
  type GameState,
  type NpcReward,
} from "@mp/game-shared";
import type { Logger } from "@mp/logger";
import type { Rng } from "@mp/std";
import { assert, createShortId } from "@mp/std";

export class NpcRewardSystem {
  private rewardsPerNpc = new Map<NpcId, NpcReward[]>();

  constructor(
    private logger: Logger,
    private gameState: GameState,
    private rng: Rng,
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

  giveRewardForKillingNpc(recipientId: CharacterId, npcId: NpcId) {
    const rewards = this.rewardsPerNpc.get(npcId);
    if (!rewards) {
      this.logger.debug(
        `Gave no reward for killing npc. No rewards defined for NPC ${npcId}.`,
      );
      return;
    }

    this.logger.debug(
      `Giving ${rewards.length} rewards for killing NPC ${npcId} to character ${recipientId}.`,
    );

    for (const reward of rewards) {
      const recipient = assert(
        this.gameState.actors.get(recipientId) as Character,
      );
      switch (reward.type) {
        case "item": {
          const item = ItemInstance.create({
            id: createShortId(),
            itemId: reward.itemId,
            inventoryId: recipient.inventoryId,
          });
          this.gameState.items.set(item.id, item);

          this.logger.debug(
            `Gave item ${reward.itemId} to character ${recipientId} for killing NPC ${npcId}.`,
          );
          break;
        }
        case "xp": {
          this.logger.debug(
            `Gave ${reward.xp} XP to character ${recipientId} for killing NPC ${npcId}.`,
          );
          recipient.progression.xp += reward.xp;
          break;
        }
        default:
          this.logger.warn(
            reward,
            `Unknown npc reward type. Cannot give reward.`,
          );
          break;
      }
    }
  }
}
