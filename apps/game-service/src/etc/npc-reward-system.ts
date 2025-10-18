import type { CharacterId, NpcId } from "@mp/db/types";
import type { Character, GameState, NpcReward } from "@mp/game-shared";
import type { Logger } from "@mp/logger";
import type { Rng } from "@mp/std";
import { assert } from "@mp/std";
import { spawnItem } from "./item-spawn-system";

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

    for (const reward of rewards) {
      const recipient = assert(
        this.gameState.actors.get(recipientId) as Character,
      );
      switch (reward.type) {
        case "item": {
          spawnItem(
            this.gameState,
            reward.reference,
            recipient.inventoryId,
            this.logger.child({ reason: `killed NPC ${npcId}` }),
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
