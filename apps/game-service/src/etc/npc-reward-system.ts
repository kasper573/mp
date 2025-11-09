import type { CharacterId, NpcDefinitionId, AreaId } from "@mp/game-shared";
import type { Character, NpcReward } from "@mp/game-shared";
import { assert, promiseFromResult, withBackoffRetries } from "@mp/std";
import { spawnItem } from "./item-spawn-system";
import type { InjectionContainer } from "@mp/ioc";
import { ctxGameState, ctxLogger } from "../context";
import type { DbRepository } from "@mp/db";

export class NpcRewardSystem {
  private rewardsPerNpc = new Map<NpcDefinitionId, NpcReward[]>();
  private isLoaded = false;

  constructor(
    private ioc: InjectionContainer,
    private db: DbRepository,
    private areaId: AreaId,
  ) {
    void this.lazyLoadRewards();
  }

  private async lazyLoadRewards() {
    const logger = this.ioc.get(ctxLogger);
    logger.info(`Loading NPC rewards...`);

    const npcRewards = await withBackoffRetries(
      () => promiseFromResult(this.db.selectAllNpcRewards(this.areaId)),
      {
        maxRetries: "infinite",
        initialDelay: 1000,
        factor: 2,
      },
    );

    for (const reward of npcRewards) {
      if (this.rewardsPerNpc.has(reward.npcId)) {
        this.rewardsPerNpc.get(reward.npcId)?.push(reward);
      } else {
        this.rewardsPerNpc.set(reward.npcId, [reward]);
      }
    }

    this.isLoaded = true;
    logger.info(
      { rewardCount: npcRewards.length },
      `NPC rewards loaded successfully`,
    );
  }

  giveRewardForKillingNpc(recipientId: CharacterId, npcId: NpcDefinitionId) {
    // Progressive enhancement: only give rewards if loaded
    if (!this.isLoaded) {
      return;
    }

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
