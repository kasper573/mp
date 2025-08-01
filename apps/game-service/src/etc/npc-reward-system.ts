import type { CharacterId, NpcId } from "@mp/db/types";
import type { Character, GameState, NpcReward } from "@mp/game-shared";
import type { Logger } from "@mp/logger";
import { assert } from "@mp/std";

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
      return; // No rewards for this NPC
    }

    for (const reward of rewards) {
      const recipient = assert(
        this.gameState.actors.get(recipientId) as Character,
      );
      switch (reward.type) {
        case "item": {
          this.logger.warn(
            reward,
            "Ignored npc item reward. Not implemented yet.",
          );
          break;
        }
        case "xp": {
          recipient.progression.xp += reward.xp;
          break;
        }
      }
    }
  }
}
