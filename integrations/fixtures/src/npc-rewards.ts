import type {
  ConsumableDefinitionId,
  EquipmentDefinitionId,
  NpcDefinitionId,
  NpcRewardId,
} from "./ids";
import type { ItemReference } from "./items";

interface NpcRewardBase<T extends string> {
  readonly id: NpcRewardId;
  readonly type: T;
  readonly npcId: NpcDefinitionId;
}

export interface NpcItemReward extends NpcRewardBase<"item"> {
  readonly reference: ItemReference;
  readonly amount: number;
}

export interface NpcXpReward extends NpcRewardBase<"xp"> {
  readonly xp: number;
}

export type NpcReward = NpcItemReward | NpcXpReward;

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
    reference: {
      type: "consumable",
      definitionId: "apple" as ConsumableDefinitionId,
    },
    amount: 1,
  },
  {
    id: "soldier:sword" as NpcRewardId,
    type: "item",
    npcId: SOLDIER_ID,
    reference: {
      type: "equipment",
      definitionId: "sword" as EquipmentDefinitionId,
    },
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
