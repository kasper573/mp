import type { InventoryId } from "./item";
import type { UserId } from "@mp/oauth";
import { object, prop } from "@mp/sync";
import { AppearanceTrait } from "./appearance";
import { CombatTrait } from "./combat";
import { MovementTrait } from "./movement";
import type { Branded } from "@mp/std";

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
export type CharacterId = Branded<string, "CharacterId">;
