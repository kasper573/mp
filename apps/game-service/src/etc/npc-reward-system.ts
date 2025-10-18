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
    const logger = this.logger.child({
      reason: `killed NPC`,
      npcId,
      recipientId,
    });

    const rewards = this.rewardsPerNpc.get(npcId);
    if (!rewards) {
      logger.debug(`No rewards defined for NPC`);
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
            logger,
          );
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
