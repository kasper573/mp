import type { CharacterId, NpcDefinitionId, AreaId } from "@mp/game-shared";
import type { Character, NpcReward } from "@mp/game-shared";
import { assert, promiseFromResult } from "@mp/std";
import { spawnItem } from "./item-spawn-system";
import type { InjectionContainer } from "@mp/ioc";
import { ctxGameState, ctxLogger } from "../context";
import type { DbRepository } from "@mp/db";

export class NpcRewardSystem {
  private rewardsPerNpc = new Map<NpcDefinitionId, NpcReward[]>();
  private loadAttempt = 0;
  private isLoaded = false;

  constructor(
    private ioc: InjectionContainer,
    private db: DbRepository,
    private areaId: AreaId,
  ) {
    // Start lazy loading rewards with infinite retry
    void this.lazyLoadRewards();
  }

  private async lazyLoadRewards() {
    const logger = this.ioc.get(ctxLogger);
    const initialDelay = 1000;
    const maxDelay = 30000;
    const factor = 2;

    while (!this.isLoaded) {
      try {
        this.loadAttempt++;
        logger.info({ attempt: this.loadAttempt }, `Loading NPC rewards...`);

        // oxlint-disable-next-line no-await-in-loop
        const npcRewards = await promiseFromResult(
          this.db.selectAllNpcRewards(this.areaId),
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
        return;
      } catch (error) {
        const delay = Math.min(
          initialDelay * Math.pow(factor, this.loadAttempt - 1),
          maxDelay,
        );
        logger.warn(
          { error, attempt: this.loadAttempt, nextRetryIn: delay },
          `Failed to load NPC rewards, retrying...`,
        );
        // oxlint-disable-next-line no-await-in-loop
        await new Promise((res) => setTimeout(res, delay));
      }
    }
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
