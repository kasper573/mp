import type { CharacterId, ItemContainerId } from "@mp/db/types";
import type { UserId } from "@mp/oauth";
import { object, prop } from "@mp/sync";
import { AppearanceTrait } from "./appearance";
import { CombatTrait } from "./combat";
import { MovementTrait } from "./movement";

export const Character = object({
  type: prop<"character">(),
  identity: object({
    id: prop<CharacterId>(),
    userId: prop<UserId>(),
  }),
  appearance: AppearanceTrait,
  movement: MovementTrait,
  combat: CombatTrait,
  progression: object({
    xp: prop<number>(),
  }),
  inventoryId: prop<ItemContainerId>(),
});

export type Character = typeof Character.$infer;
