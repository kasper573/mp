import type { CharacterId, InventoryId } from "./ids";
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
  inventoryId: prop<InventoryId>(),
});

export type Character = typeof Character.$infer;
