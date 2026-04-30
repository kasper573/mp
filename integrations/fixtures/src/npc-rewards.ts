import type { NpcDefinitionId, NpcReward, NpcRewardId } from "@mp/world";

const SOLDIER_ID = "1" as NpcDefinitionId;

export const npcRewards: ReadonlyArray<NpcReward> = [
  {
    id: "soldier:xp" as NpcRewardId,
    type: "xp",
    npcId: SOLDIER_ID,
    xp: 10,
  },
  {
    id: "soldier:apple" as NpcRewardId,
    type: "item",
    npcId: SOLDIER_ID,
    reference: { type: "consumable", definitionId: "apple" as never },
    amount: 1,
  },
  {
    id: "soldier:sword" as NpcRewardId,
    type: "item",
    npcId: SOLDIER_ID,
    reference: { type: "equipment", definitionId: "sword" as never },
    amount: 1,
  },
];

export const npcRewardsByNpcId: ReadonlyMap<
  NpcDefinitionId,
  ReadonlyArray<NpcReward>
> = (() => {
  const map = new Map<NpcDefinitionId, NpcReward[]>();
  for (const reward of npcRewards) {
    let list = map.get(reward.npcId);
    if (!list) {
      list = [];
      map.set(reward.npcId, list);
    }
    list.push(reward);
  }
  return map;
})();
