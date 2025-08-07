import type { CharacterId, NpcId } from "@mp/db/types";
import type { Character, GameState, NpcReward } from "@mp/game-shared";
import type { Logger } from "@mp/logger";
import { assert } from "@mp/std";
import { trySpawnItem } from "./spawn-item";

export class NpcRewardSystem {
  private rewardsPerNpc = new Map<NpcId, NpcReward[]>();

  constructor(
    private logger: Logger,
    private gameState: GameState,
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
          const res = trySpawnItem(
            this.gameState,
            reward.itemId,
            recipient.inventoryId,
          );
          if (res.isErr()) {
            this.logger.error(
              res.error,
              `Failed to give item reward ${reward.itemId} to character ${recipientId} for killing NPC ${npcId}.`,
            );
          } else {
            this.logger.debug(
              `Gave item ${reward.itemId} to character ${recipientId} for killing NPC ${npcId}.`,
            );
          }
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
