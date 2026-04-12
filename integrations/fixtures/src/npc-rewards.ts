import type { NpcReward } from "./types";
import { npcs } from "./npcs";
import { consumables, equipment } from "./items";

const soldier = npcs[0];

export const npcRewards: readonly NpcReward[] = [
  {
    type: "xp",
    npcId: soldier.id,
    xp: 10,
  },
  {
    type: "item",
    npcId: soldier.id,
    itemType: "consumable",
    itemId: consumables[0].id,
    amount: 1,
  },
  {
    type: "item",
    npcId: soldier.id,
    itemType: "equipment",
    itemId: equipment[0].id,
    amount: 1,
  },
];
